import { describe, it, expect } from 'vitest';
import { parseMainParams, buildFclArgs } from './cadenceParams';

// Mock FCL type constructors — record calls to verify correct type resolution
function createMockTypes() {
  const make = (name: string) => ({ __type: name });

  const t: any = {
    String: make('String'),
    Int: make('Int'),
    Int8: make('Int8'),
    Int16: make('Int16'),
    Int32: make('Int32'),
    Int64: make('Int64'),
    Int128: make('Int128'),
    Int256: make('Int256'),
    UInt: make('UInt'),
    UInt8: make('UInt8'),
    UInt16: make('UInt16'),
    UInt32: make('UInt32'),
    UInt64: make('UInt64'),
    UInt128: make('UInt128'),
    UInt256: make('UInt256'),
    Fix64: make('Fix64'),
    UFix64: make('UFix64'),
    Bool: make('Bool'),
    Address: make('Address'),
    Path: make('Path'),
    Optional: (inner: any) => ({ __type: 'Optional', inner }),
    Array: (inner: any) => ({ __type: 'Array', inner }),
    Dictionary: (opts: any) => ({ __type: 'Dictionary', key: opts.key, value: opts.value }),
  };

  const arg = (value: any, type: any) => ({ value, type });

  return { t, arg };
}

function buildArgs(code: string, values: Record<string, string>) {
  const { t, arg } = createMockTypes();
  const params = parseMainParams(code);
  const builder = buildFclArgs(params, values);
  return builder(arg, t);
}

// ─── parseMainParams ────────────────────────────────────────────────

describe('parseMainParams', () => {
  it('parses script params', () => {
    const code = 'access(all) fun main(addr: Address, amount: UInt64)';
    expect(parseMainParams(code)).toEqual([
      { name: 'addr', type: 'Address' },
      { name: 'amount', type: 'UInt64' },
    ]);
  });

  it('parses transaction params', () => {
    const code = 'transaction(name: String, flag: Bool)';
    expect(parseMainParams(code)).toEqual([
      { name: 'name', type: 'String' },
      { name: 'flag', type: 'Bool' },
    ]);
  });

  it('parses optional types', () => {
    const code = 'access(all) fun main(x: UInt32?, y: String?)';
    expect(parseMainParams(code)).toEqual([
      { name: 'x', type: 'UInt32?' },
      { name: 'y', type: 'String?' },
    ]);
  });

  it('parses array types', () => {
    const code = 'access(all) fun main(ids: [UInt64])';
    expect(parseMainParams(code)).toEqual([
      { name: 'ids', type: '[UInt64]' },
    ]);
  });

  it('returns empty for no params', () => {
    expect(parseMainParams('access(all) fun main()')).toEqual([]);
    expect(parseMainParams('transaction {}')).toEqual([]);
  });
});

// ─── Type resolution (via buildFclArgs) ─────────────────────────────

describe('buildFclArgs — type resolution', () => {
  it('resolves primitive types', () => {
    const result = buildArgs('access(all) fun main(a: UInt32, b: Int64, c: Bool)', {
      a: '42', b: '-10', c: 'true',
    });

    expect(result[0].type).toEqual({ __type: 'UInt32' });
    expect(result[1].type).toEqual({ __type: 'Int64' });
    expect(result[2].type).toEqual({ __type: 'Bool' });
  });

  it('resolves UInt64, UInt128, UInt256', () => {
    const result = buildArgs('access(all) fun main(a: UInt64, b: UInt128, c: UInt256)', {
      a: '1', b: '2', c: '3',
    });

    expect(result[0].type).toEqual({ __type: 'UInt64' });
    expect(result[1].type).toEqual({ __type: 'UInt128' });
    expect(result[2].type).toEqual({ __type: 'UInt256' });
  });

  it('resolves Word types to UInt equivalents', () => {
    const result = buildArgs('access(all) fun main(a: Word8, b: Word16, c: Word32, d: Word64)', {
      a: '1', b: '2', c: '3', d: '4',
    });

    expect(result[0].type).toEqual({ __type: 'UInt8' });
    expect(result[1].type).toEqual({ __type: 'UInt16' });
    expect(result[2].type).toEqual({ __type: 'UInt32' });
    expect(result[3].type).toEqual({ __type: 'UInt64' });
  });

  it('resolves Optional with correct inner type (the original bug)', () => {
    const result = buildArgs('access(all) fun main(x: UInt32?)', { x: '344' });

    expect(result[0].type).toEqual({
      __type: 'Optional',
      inner: { __type: 'UInt32' },
    });
  });

  it('resolves Optional for various inner types', () => {
    const result = buildArgs(
      'access(all) fun main(a: UInt64?, b: UInt256?, c: Bool?, d: Address?, e: UFix64?)',
      { a: '1', b: '2', c: 'true', d: '0x1', e: '5.0' },
    );

    expect(result[0].type).toEqual({ __type: 'Optional', inner: { __type: 'UInt64' } });
    expect(result[1].type).toEqual({ __type: 'Optional', inner: { __type: 'UInt256' } });
    expect(result[2].type).toEqual({ __type: 'Optional', inner: { __type: 'Bool' } });
    expect(result[3].type).toEqual({ __type: 'Optional', inner: { __type: 'Address' } });
    expect(result[4].type).toEqual({ __type: 'Optional', inner: { __type: 'UFix64' } });
  });

  it('resolves Array with correct inner type', () => {
    const result = buildArgs('access(all) fun main(ids: [UInt64])', { ids: '[1,2,3]' });

    expect(result[0].type).toEqual({
      __type: 'Array',
      inner: { __type: 'UInt64' },
    });
  });

  it('resolves Array of Optional', () => {
    const result = buildArgs('access(all) fun main(ids: [UInt32?])', { ids: '[1,2]' });

    expect(result[0].type).toEqual({
      __type: 'Array',
      inner: { __type: 'Optional', inner: { __type: 'UInt32' } },
    });
  });

  it('resolves Dictionary with correct key/value types', () => {
    const result = buildArgs('access(all) fun main(m: {String: UInt64})', { m: '{}' });

    expect(result[0].type).toEqual({
      __type: 'Dictionary',
      key: { __type: 'String' },
      value: { __type: 'UInt64' },
    });
  });

  it('falls back to String for unknown types', () => {
    const result = buildArgs('access(all) fun main(x: SomeCustomType)', { x: 'abc' });
    expect(result[0].type).toEqual({ __type: 'String' });
  });
});

// ─── Value coercion (via buildFclArgs) ──────────────────────────────

describe('buildFclArgs — value coercion', () => {
  it('coerces Bool', () => {
    const result = buildArgs('access(all) fun main(a: Bool, b: Bool)', {
      a: 'true', b: 'false',
    });
    expect(result[0].value).toBe(true);
    expect(result[1].value).toBe(false);
  });

  it('coerces UFix64 — adds .0 if missing', () => {
    const result = buildArgs('access(all) fun main(a: UFix64, b: UFix64)', {
      a: '5', b: '3.14',
    });
    expect(result[0].value).toBe('5.0');
    expect(result[1].value).toBe('3.14');
  });

  it('coerces Fix64 — adds .0 if missing', () => {
    const result = buildArgs('access(all) fun main(a: Fix64)', { a: '-7' });
    expect(result[0].value).toBe('-7.0');
  });

  it('coerces Optional — null for empty string', () => {
    const result = buildArgs('access(all) fun main(x: UInt32?)', { x: '' });
    expect(result[0].value).toBe(null);
  });

  it('coerces Optional — delegates to inner type for non-empty', () => {
    const result = buildArgs('access(all) fun main(a: Bool?, b: UFix64?)', {
      a: 'true', b: '5',
    });
    expect(result[0].value).toBe(true);   // Bool coercion
    expect(result[1].value).toBe('5.0');   // UFix64 coercion
  });

  it('coerces Array — parses JSON', () => {
    const result = buildArgs('access(all) fun main(ids: [UInt64])', {
      ids: '[1, 2, 3]',
    });
    expect(result[0].value).toEqual([1, 2, 3]);
  });

  it('coerces Array — falls back to comma split', () => {
    const result = buildArgs('access(all) fun main(addrs: [Address])', {
      addrs: '0x1, 0x2',
    });
    expect(result[0].value).toEqual(['0x1', '0x2']);
  });

  it('passes through string values as-is for string/int types', () => {
    const result = buildArgs('access(all) fun main(a: String, b: UInt64)', {
      a: 'hello', b: '42',
    });
    expect(result[0].value).toBe('hello');
    expect(result[1].value).toBe('42');
  });
});

import { describe, expect, it } from 'vitest';
import { buildFclArgs } from '../cadence/arguments.js';

describe('cadence/arguments', () => {
  it('builds FCL args for primitive and array types', () => {
    const arg = (value: unknown, type: unknown) => ({ value, type });
    const fclTypes = {
      Address: 'AddressType',
      UFix64: 'UFix64Type',
      UInt64: 'UInt64Type',
      Array: (inner: unknown) => ({ kind: 'Array', inner }),
      Optional: (inner: unknown) => ({ kind: 'Optional', inner }),
    };

    const args = buildFclArgs([
      { type: 'Address', value: '1234' },
      { type: 'UFix64', value: '10.5' },
      { type: '[UInt64]', value: [1, 2, 3] },
      { type: 'Address?', value: null },
    ])(arg, fclTypes);

    expect(args).toEqual([
      { value: '0x1234', type: 'AddressType' },
      { value: '10.5', type: 'UFix64Type' },
      {
        value: ['1', '2', '3'],
        type: { kind: 'Array', inner: 'UInt64Type' },
      },
      {
        value: null,
        type: { kind: 'Optional', inner: 'AddressType' },
      },
    ]);
  });

  it('parses array values from JSON strings', () => {
    const arg = (value: unknown, type: unknown) => ({ value, type });
    const fclTypes = {
      UInt8: 'UInt8Type',
      Array: (inner: unknown) => ({ kind: 'Array', inner }),
    };

    const args = buildFclArgs([
      { type: '[UInt8]', value: '[1,2,3]' },
    ])(arg, fclTypes);

    expect(args).toEqual([
      {
        value: ['1', '2', '3'],
        type: { kind: 'Array', inner: 'UInt8Type' },
      },
    ]);
  });
});

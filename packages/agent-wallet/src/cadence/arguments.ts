import type { JsonCdcValue } from '../flowindex/client.js';

export interface CadenceArgument {
  type: string;
  value: unknown;
}

const INTEGER_TYPES = new Set([
  'Int',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'Int128',
  'Int256',
  'UInt',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'UInt128',
  'UInt256',
  'Word8',
  'Word16',
  'Word32',
  'Word64',
  'Word128',
  'Word256',
]);

const FIXED_POINT_TYPES = new Set(['Fix64', 'Fix128', 'UFix64', 'UFix128']);
const STRING_TYPES = new Set(['String', 'Character']);

export function normalizeCadenceType(type: string): string {
  return type.replace(/\s+/g, '');
}

export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function parseArrayValue(type: string, value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Uint8Array) return Array.from(value);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Array.from(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to the generic error below.
    }
  }
  throw new Error(`Expected ${type} argument to be an array or JSON array string`);
}

function parseOptionalValue(value: unknown): unknown | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null;
  return value;
}

function normalizeBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true' || lowered === 'false') {
      return lowered === 'true';
    }
  }
  throw new Error('Bool arguments must be true or false');
}

function normalizeSimpleValue(type: string, value: unknown): unknown {
  const normalizedType = normalizeCadenceType(type);

  if (normalizedType === 'Address') {
    return normalizeAddress(String(value));
  }

  if (STRING_TYPES.has(normalizedType)) {
    return String(value);
  }

  if (normalizedType === 'Bool') {
    return normalizeBool(value);
  }

  if (INTEGER_TYPES.has(normalizedType) || FIXED_POINT_TYPES.has(normalizedType)) {
    return String(value);
  }

  throw new Error(`Unsupported Cadence argument type: ${type}`);
}

export function toJsonCdcValue(type: string, value: unknown): JsonCdcValue {
  const normalizedType = normalizeCadenceType(type);

  if (normalizedType.endsWith('?')) {
    const innerType = normalizedType.slice(0, -1);
    const optionalValue = parseOptionalValue(value);
    return {
      type: 'Optional',
      value: optionalValue === null ? null : toJsonCdcValue(innerType, optionalValue),
    };
  }

  if (normalizedType.startsWith('[') && normalizedType.endsWith(']')) {
    const innerType = normalizedType.slice(1, -1);
    const items = parseArrayValue(normalizedType, value);
    return {
      type: 'Array',
      value: items.map((item) => toJsonCdcValue(innerType, item)),
    };
  }

  return {
    type: normalizedType,
    value: normalizeSimpleValue(normalizedType, value),
  };
}

function resolveFclType(type: string, fclTypes: Record<string, unknown>): unknown {
  const normalizedType = normalizeCadenceType(type);

  if (normalizedType.endsWith('?')) {
    const innerType = normalizedType.slice(0, -1);
    const optional = fclTypes.Optional as ((inner: unknown) => unknown) | undefined;
    if (!optional) {
      throw new Error('FCL Optional type helper is unavailable');
    }
    return optional(resolveFclType(innerType, fclTypes));
  }

  if (normalizedType.startsWith('[') && normalizedType.endsWith(']')) {
    const innerType = normalizedType.slice(1, -1);
    const array = fclTypes.Array as ((inner: unknown) => unknown) | undefined;
    if (!array) {
      throw new Error('FCL Array type helper is unavailable');
    }
    return array(resolveFclType(innerType, fclTypes));
  }

  const resolved = fclTypes[normalizedType];
  if (!resolved) {
    throw new Error(`Unsupported Cadence argument type: ${type}`);
  }

  return resolved;
}

function normalizeFclValue(type: string, value: unknown): unknown {
  const normalizedType = normalizeCadenceType(type);

  if (normalizedType.endsWith('?')) {
    const innerType = normalizedType.slice(0, -1);
    const optionalValue = parseOptionalValue(value);
    return optionalValue === null ? null : normalizeFclValue(innerType, optionalValue);
  }

  if (normalizedType.startsWith('[') && normalizedType.endsWith(']')) {
    const innerType = normalizedType.slice(1, -1);
    const items = parseArrayValue(normalizedType, value);
    return items.map((item) => normalizeFclValue(innerType, item));
  }

  return normalizeSimpleValue(normalizedType, value);
}

export function buildFclArgs(argumentsList: CadenceArgument[]) {
  return (
    // FCL provides these callback parameters at runtime.
    // We keep the surface intentionally loose here so the helper can plug
    // directly into `fcl.query` / `fcl.mutate` without importing deep FCL types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arg: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fclTypes: Record<string, any>,
  ) => argumentsList.map(({ type, value }) => {
    const cadenceType = resolveFclType(type, fclTypes);
    const normalizedValue = normalizeFclValue(type, value);
    return arg(normalizedValue, cadenceType);
  });
}

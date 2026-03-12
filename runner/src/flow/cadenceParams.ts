export interface CadenceParam {
  name: string;
  type: string;
}

export interface CadenceParamValidationError {
  index: number;
  name: string;
  message: string;
}

const ADDRESS_RE = /^(?:0x)?[0-9a-fA-F]{16}$/;
const UNSIGNED_INT_RE = /^\d+$/;
const SIGNED_INT_RE = /^-?\d+$/;
const UFIX64_RE = /^\d+(?:\.\d+)?$/;
const FIX64_RE = /^-?\d+(?:\.\d+)?$/;
const PATH_RE = /^(storage|public|private)\/[A-Za-z_][A-Za-z0-9_]*$/;

const SIGNED_INT_TYPES = new Set([
  'Int',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'Int128',
  'Int256',
  'Fix64',
  'Fix128',
]);

const UNSIGNED_INT_TYPES = new Set([
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
  'UFix64',
  'UFix128',
]);

const PATH_TYPES = new Set(['Path', 'PublicPath', 'PrivatePath', 'StoragePath', 'CapabilityPath']);

export function parseMainParams(code: string): CadenceParam[] {
  // Match `fun main(...)` for scripts, or `transaction(...)` for transactions
  const match =
    code.match(/fun\s+main\s*\(([^)]*)\)/) ||
    code.match(/^\s*transaction\s*\(([^)]*)\)/m);
  if (!match || !match[1].trim()) return [];
  return match[1]
    .split(',')
    .map((param) => {
      const trimmed = param.trim();
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) return { name: trimmed, type: 'String' };
      const name = trimmed.slice(0, colonIdx).trim();
      const type = trimmed.slice(colonIdx + 1).trim();
      return { name, type: type || 'String' };
    })
    .filter((p) => p.name);
}

/**
 * Resolve a primitive type name to the actual fcl.t.X constructor.
 */
function resolvePrimitiveType(t: any, typeName: string): any {
  const map: Record<string, any> = {
    String: t.String,
    Character: t.String,
    Int: t.Int,
    Int8: t.Int8,
    Int16: t.Int16,
    Int32: t.Int32,
    Int64: t.Int64,
    Int128: t.Int128,
    Int256: t.Int256,
    UInt: t.UInt,
    UInt8: t.UInt8,
    UInt16: t.UInt16,
    UInt32: t.UInt32,
    UInt64: t.UInt64,
    UInt128: t.UInt128,
    UInt256: t.UInt256,
    Word8: t.UInt8,
    Word16: t.UInt16,
    Word32: t.UInt32,
    Word64: t.UInt64,
    Fix64: t.Fix64,
    UFix64: t.UFix64,
    Bool: t.Bool,
    Address: t.Address,
    Path: t.Path,
  };
  return map[typeName] || t.String;
}

function normalizeAddressLiteral(raw: string): string {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{16}$/.test(trimmed)) return `0x${trimmed}`;
  return trimmed;
}

function stringifyScalar(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return JSON.stringify(raw);
}

function validateValue(raw: unknown, cadenceType: string): string | null {
  const t = cadenceType.trim();

  if (t.endsWith('?')) {
    if (stringifyScalar(raw) === '') return null;
    return validateValue(raw, t.slice(0, -1));
  }

  if (t.startsWith('[') && t.endsWith(']')) {
    const innerType = t.slice(1, -1).trim();
    let items: unknown[];

    if (Array.isArray(raw)) {
      items = raw;
    } else {
      const text = stringifyScalar(raw);
      if (text === '') return 'Array value is required';
      if (text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) return 'Must be a valid JSON array';
          items = parsed;
        } catch {
          return 'Must be a valid JSON array';
        }
      } else {
        items = text.split(',').map((part) => part.trim()).filter(Boolean);
      }
    }

    for (let i = 0; i < items.length; i++) {
      const itemErr = validateValue(items[i], innerType);
      if (itemErr) return `Invalid array item ${i + 1}: ${itemErr}`;
    }
    return null;
  }

  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    if (colonIdx === -1) return null;

    const keyType = inner.slice(0, colonIdx).trim();
    const valueType = inner.slice(colonIdx + 1).trim();
    let entries: Array<[string, unknown]>;

    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      entries = Object.entries(raw as Record<string, unknown>);
    } else {
      const text = stringifyScalar(raw);
      if (text === '') return 'Dictionary value is required';
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return 'Must be a valid JSON object';
        }
        entries = Object.entries(parsed as Record<string, unknown>);
      } catch {
        return 'Must be a valid JSON object';
      }
    }

    for (const [key, value] of entries) {
      const keyErr = validateValue(key, keyType);
      if (keyErr) return `Invalid dictionary key "${key}": ${keyErr}`;
      const valueErr = validateValue(value, valueType);
      if (valueErr) return `Invalid dictionary value for "${key}": ${valueErr}`;
    }
    return null;
  }

  const text = stringifyScalar(raw);

  if (t === 'String') return null;
  if (t === 'Character') {
    if (text === '') return 'Character value is required';
    return [...text].length === 1 ? null : 'Character must contain exactly one character';
  }
  if (t === 'Bool') {
    if (text === '') return 'Bool value is required';
    return text === 'true' || text === 'false' ? null : 'Bool must be true or false';
  }
  if (t === 'Address') {
    if (text === '') return 'Address value is required';
    return ADDRESS_RE.test(text) ? null : 'Address must be 16 hex chars, with optional 0x prefix';
  }
  if (t === 'UFix64' || t === 'UFix128') {
    if (text === '') return `${t} value is required`;
    return UFIX64_RE.test(text) ? null : `${t} must look like 1 or 1.0`;
  }
  if (t === 'Fix64' || t === 'Fix128') {
    if (text === '') return `${t} value is required`;
    return FIX64_RE.test(text) ? null : `${t} must look like -1 or -1.0`;
  }
  if (SIGNED_INT_TYPES.has(t)) {
    if (text === '') return `${t} value is required`;
    return SIGNED_INT_RE.test(text) ? null : `${t} must be an integer`;
  }
  if (UNSIGNED_INT_TYPES.has(t)) {
    if (text === '') return `${t} value is required`;
    return UNSIGNED_INT_RE.test(text) ? null : `${t} must be an unsigned integer`;
  }
  if (PATH_TYPES.has(t)) {
    if (text === '') return `${t} value is required`;
    return PATH_RE.test(text) ? null : `${t} must look like storage/foo or public/foo`;
  }

  return null;
}

/**
 * Resolve a full Cadence type string (including Optional, Array, Dictionary)
 * to the actual fcl.t.X constructor.
 */
function resolveType(t: any, cadenceType: string): any {
  const trimmed = cadenceType.trim();

  // Optional: e.g. "UInt32?" → t.Optional(t.UInt32)
  if (trimmed.endsWith('?')) {
    const innerType = trimmed.slice(0, -1);
    return t.Optional(resolveType(t, innerType));
  }

  // Array: e.g. "[UInt64]" → t.Array(t.UInt64)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const innerType = trimmed.slice(1, -1);
    return t.Array(resolveType(t, innerType));
  }

  // Dictionary: e.g. "{String: UInt64}" → t.Dictionary({key: t.String, value: t.UInt64})
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    if (colonIdx !== -1) {
      const keyType = inner.slice(0, colonIdx).trim();
      const valueType = inner.slice(colonIdx + 1).trim();
      return t.Dictionary({ key: resolveType(t, keyType), value: resolveType(t, valueType) });
    }
    return t.Dictionary({ key: t.String, value: t.String });
  }

  return resolvePrimitiveType(t, trimmed);
}

/**
 * Coerce a raw string value into the shape FCL expects for a given Cadence type.
 */
export function coerceValue(raw: string, cadenceType: string): any {
  const t = cadenceType.trim();

  // Optional: null for empty, otherwise coerce the inner type
  if (t.endsWith('?')) {
    if (raw === '') return null;
    return coerceValue(raw, t.slice(0, -1));
  }
  if (t === 'Bool') return raw === 'true';
  if (t === 'UFix64' || t === 'Fix64') return raw.includes('.') ? raw : `${raw}.0`;
  if (t.startsWith('[') && t.endsWith(']')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.split(',').map((s) => s.trim());
    }
  }
  if (t === 'Address') return normalizeAddressLiteral(raw);
  return raw;
}

/**
 * Convert a raw user-input string + Cadence type into a JSON-CDC object
 * that the Flow emulator / simulate endpoint accepts.
 *
 * JSON-CDC spec: https://cadence-lang.org/docs/json-cadence-spec
 */
export function toCadenceJsonCdc(raw: string, cadenceType: string): Record<string, unknown> {
  const t = cadenceType.trim();

  // Optional
  if (t.endsWith('?')) {
    if (raw === '') return { type: 'Optional', value: null };
    return { type: 'Optional', value: toCadenceJsonCdc(raw, t.slice(0, -1)) };
  }

  // Array: e.g. [UInt64]
  if (t.startsWith('[') && t.endsWith(']')) {
    const innerType = t.slice(1, -1).trim();
    let items: string[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed.map(String) : [raw];
    } catch {
      items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return { type: 'Array', value: items.map((v) => toCadenceJsonCdc(v, innerType)) };
  }

  // Dictionary: e.g. {String: UInt64}
  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    const keyType = inner.slice(0, colonIdx).trim();
    const valueType = inner.slice(colonIdx + 1).trim();
    let entries: Array<{ key: string; value: string }>;
    try {
      const parsed = JSON.parse(raw);
      entries = Object.entries(parsed).map(([k, v]) => ({ key: k, value: String(v) }));
    } catch {
      entries = [];
    }
    return {
      type: 'Dictionary',
      value: entries.map((e) => ({
        key: toCadenceJsonCdc(e.key, keyType),
        value: toCadenceJsonCdc(e.value, valueType),
      })),
    };
  }

  // Bool
  if (t === 'Bool') return { type: 'Bool', value: raw === 'true' };

  // Fixed-point: ensure decimal
  if (t === 'UFix64' || t === 'Fix64') {
    return { type: t, value: raw.includes('.') ? raw : `${raw}.0` };
  }

  // Address
  if (t === 'Address') return { type: 'Address', value: normalizeAddressLiteral(raw) };

  // Path types
  if (t === 'Path') return { type: 'Path', value: { domain: 'storage', identifier: raw } };

  // All integer types + String + Character
  return { type: t, value: raw };
}

export function validateCadenceParams(
  params: CadenceParam[],
  values: Record<string, string>,
): CadenceParamValidationError[] {
  return params.flatMap((param, index) => {
    const message = validateValue(values[param.name] ?? '', param.type);
    if (!message) return [];
    return [{ index, name: param.name, message }];
  });
}

export function buildFclArgs(
  params: CadenceParam[],
  values: Record<string, string>,
) {
  return (arg: any, t: any) => {
    return params.map((p) => {
      const raw = values[p.name] || '';
      const fclType = resolveType(t, p.type);
      const value = coerceValue(raw, p.type);
      return arg(value, fclType);
    });
  };
}

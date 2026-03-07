import type { AuthUser } from './types';

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Decode a JWT token and return the payload as a plain object.
 * Returns null if the token is malformed.
 */
export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    // Handle URL-safe base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Normalize stringified exp to number
    if (typeof parsed.exp === 'string') {
      const n = Number(parsed.exp);
      if (Number.isFinite(n)) parsed.exp = n;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired (or will expire within 5 seconds).
 */
export function isExpired(token: string): boolean {
  const payload = parseJwt(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : 0;
  if (!exp) return true;
  // Consider expired if within 5 seconds of expiry
  return Date.now() >= exp * 1000 - 5_000;
}

/**
 * Return the number of seconds until a JWT token expires. Returns 0 if already expired.
 */
export function secondsUntilExpiry(token: string): number {
  const payload = parseJwt(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : 0;
  if (!exp) return 0;
  return Math.max(0, exp - Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Internal helpers for roles/teams parsing
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeClaimsList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

// ---------------------------------------------------------------------------
// userFromToken
// ---------------------------------------------------------------------------

export interface UserFromTokenOptions {
  /** When true (default), parse roles and teams from JWT claims. */
  enableRoles?: boolean;
}

/**
 * Extract an AuthUser from a JWT access token.
 *
 * By default, parses roles and teams from app_metadata, user_metadata, and
 * root-level JWT claims. Pass `{ enableRoles: false }` for a simpler user
 * with only id and email.
 */
export function userFromToken(token: string, options?: UserFromTokenOptions): AuthUser | null {
  const payload = parseJwt(token);
  const sub = typeof payload?.sub === 'string' ? payload.sub : '';
  if (!sub) return null;

  const email = typeof payload?.email === 'string' ? payload.email : '';

  const enableRoles = options?.enableRoles !== false;
  if (!enableRoles) {
    return { id: sub, email };
  }

  const appMetadata = asObject(payload?.app_metadata);
  const userMetadata = asObject(payload?.user_metadata);

  const roles = unique([
    ...normalizeClaimsList(payload?.role),
    ...normalizeClaimsList(payload?.roles),
    ...normalizeClaimsList(appMetadata?.role),
    ...normalizeClaimsList(appMetadata?.roles),
    ...normalizeClaimsList(userMetadata?.role),
    ...normalizeClaimsList(userMetadata?.roles),
  ]);

  const teams = unique([
    ...normalizeClaimsList(payload?.team),
    ...normalizeClaimsList(payload?.teams),
    ...normalizeClaimsList(appMetadata?.team),
    ...normalizeClaimsList(appMetadata?.teams),
    ...normalizeClaimsList(userMetadata?.team),
    ...normalizeClaimsList(userMetadata?.teams),
  ]);

  return {
    id: sub,
    email,
    role: roles[0],
    roles,
    team: teams[0],
    teams,
  };
}

import type { TokenData } from './types';

/**
 * POST to a GoTrue endpoint. Throws on non-OK responses with the error message
 * extracted from the JSON body.
 */
export async function gotruePost(
  gotrueUrl: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${gotrueUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ msg: res.statusText }));
    throw new Error(err.msg || err.error_description || err.error || 'Auth request failed');
  }

  return res.json();
}

/**
 * Refresh an access token using the GoTrue refresh_token grant.
 */
export async function refreshAccessToken(
  gotrueUrl: string,
  refreshToken: string,
): Promise<TokenData> {
  return gotruePost(gotrueUrl, '/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

/**
 * Build the full OAuth redirect URL for a given provider.
 */
export function buildOAuthRedirectUrl(
  gotrueUrl: string,
  provider: string,
  callbackUrl: string,
): string {
  return `${gotrueUrl}/authorize?provider=${provider}&redirect_to=${encodeURIComponent(callbackUrl)}`;
}

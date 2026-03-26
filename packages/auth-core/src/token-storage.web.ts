import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_wallet_tokens';

export function loadTokens(): StoredTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed as StoredTokens;
    return null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

export function removeTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

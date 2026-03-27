/**
 * Token storage for React Native using AsyncStorage.
 * Metro resolves this file instead of storage.web.ts on React Native.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_auth_tokens';

export async function loadStoredTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) {
      return parsed as StoredTokens;
    }
    return null;
  } catch {
    return null;
  }
}

export async function persistTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken }));
  } catch { /* ignore */ }
}

export async function clearTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_wallet_tokens';

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed as StoredTokens;
    return null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

export async function removeTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

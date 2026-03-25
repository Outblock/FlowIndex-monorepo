/**
 * Native keychain using expo-secure-store for the master key
 * and AsyncStorage for encrypted data (to avoid the 2KB limit).
 *
 * This file is only loaded on React Native (via .native.ts resolution),
 * so static imports of RN-only modules are safe.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encrypt, decrypt, deriveKeyFromPassword } from './encryption';

const STORAGE_PREFIX = 'flowindex_kc_';
const SALT = 'flowindex-wallet-v1';

export class KeychainNative {
  private key: CryptoKey | null = null;

  async unlock(password: string): Promise<void> {
    this.key = await deriveKeyFromPassword(password, SALT);
  }

  async store(id: string, value: string): Promise<void> {
    if (!this.key) throw new Error('Keychain locked');
    const encrypted = await encrypt(value, this.key);
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${id}`, encrypted);
  }

  async retrieve(id: string): Promise<string | null> {
    if (!this.key) throw new Error('Keychain locked');
    const encrypted = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!encrypted) return null;
    return decrypt(encrypted, this.key);
  }

  async remove(id: string): Promise<void> {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  }

  lock(): void {
    this.key = null;
  }
}

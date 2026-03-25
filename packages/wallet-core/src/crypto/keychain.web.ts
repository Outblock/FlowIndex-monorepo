import { encrypt, decrypt, deriveKeyFromPassword } from './encryption';

const STORAGE_KEY = 'flowindex_wallet_keychain';
const SALT = 'flowindex-wallet-v1';

export class KeychainWeb {
  private key: CryptoKey | null = null;

  async unlock(password: string): Promise<void> {
    this.key = await deriveKeyFromPassword(password, SALT);
  }

  async store(id: string, value: string): Promise<void> {
    if (!this.key) throw new Error('Keychain locked');
    const encrypted = await encrypt(value, this.key);
    const data = this.loadAll();
    data[id] = encrypted;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async retrieve(id: string): Promise<string | null> {
    if (!this.key) throw new Error('Keychain locked');
    const data = this.loadAll();
    const encrypted = data[id];
    if (!encrypted) return null;
    return decrypt(encrypted, this.key);
  }

  async remove(id: string): Promise<void> {
    const data = this.loadAll();
    delete data[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  lock(): void {
    this.key = null;
  }

  private loadAll(): Record<string, string> {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }
}

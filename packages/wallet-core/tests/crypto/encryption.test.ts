import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveKeyFromPassword } from '../../src/crypto/encryption';

describe('encryption', () => {
  it('encrypts and decrypts round-trip', async () => {
    const key = await deriveKeyFromPassword('test-password', 'salt-123');
    const plaintext = 'secret private key data';
    const encrypted = await encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', async () => {
    const key1 = await deriveKeyFromPassword('password1', 'salt');
    const key2 = await deriveKeyFromPassword('password2', 'salt');
    const encrypted = await encrypt('secret', key1);
    await expect(decrypt(encrypted, key2)).rejects.toThrow();
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await deriveKeyFromPassword('password', 'salt');
    const ct1 = await encrypt('same plaintext', key);
    const ct2 = await encrypt('same plaintext', key);
    expect(ct1).not.toBe(ct2);
  });
});

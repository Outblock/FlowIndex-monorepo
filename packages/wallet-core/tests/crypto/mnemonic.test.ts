import { describe, it, expect } from 'vitest';
import { generateMnemonic, validateMnemonic, mnemonicToSeed } from '../../src/crypto/mnemonic';

describe('mnemonic', () => {
  it('generates a valid 12-word mnemonic', () => {
    const mnemonic = generateMnemonic();
    const words = mnemonic.split(' ');
    expect(words).toHaveLength(12);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('validates known BIP-39 test vector', () => {
    // BIP-39 test vector (English, 128-bit entropy)
    const valid = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(validateMnemonic(valid)).toBe(true);
  });

  it('rejects invalid mnemonic', () => {
    expect(validateMnemonic('invalid words that are not a mnemonic')).toBe(false);
  });

  it('derives seed from mnemonic', async () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed = await mnemonicToSeed(mnemonic);
    expect(seed).toBeInstanceOf(Uint8Array);
    expect(seed.length).toBe(64);
    // Known seed hex for this mnemonic (no passphrase)
    const hex = Buffer.from(seed).toString('hex');
    expect(hex.startsWith('5eb00bbddcf069084889a8ab9155568165f5c453')).toBe(true);
  });
});

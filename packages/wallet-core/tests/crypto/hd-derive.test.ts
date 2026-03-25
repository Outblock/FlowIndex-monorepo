import { describe, it, expect } from 'vitest';
import { deriveSecp256k1Key, deriveP256KeyFromPath, FLOW_BIP44_PATH } from '../../src/crypto/hd-derive';
import { p256 } from '@noble/curves/nist.js';
import { mnemonicToSeed } from '../../src/crypto/mnemonic';

const P256_ORDER: bigint = p256.Point.Fn.ORDER;

describe('HD derivation', () => {
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('derives secp256k1 private key from mnemonic', async () => {
    const seed = await mnemonicToSeed(TEST_MNEMONIC);
    const key = deriveSecp256k1Key(seed, "m/44'/60'/0'/0/0");
    expect(key.privateKey).toBeInstanceOf(Uint8Array);
    expect(key.privateKey.length).toBe(32);
    expect(key.publicKey).toBeInstanceOf(Uint8Array);
    expect(key.publicKey.length).toBe(33); // compressed
  });

  it('derives P256 key from Flow BIP-44 path', async () => {
    const seed = await mnemonicToSeed(TEST_MNEMONIC);
    const key = deriveP256KeyFromPath(seed, FLOW_BIP44_PATH);
    expect(key.privateKey).toBeInstanceOf(Uint8Array);
    expect(key.privateKey.length).toBe(32);
    // Validate P256 scalar: must be 1 < k < n
    const scalar = BigInt('0x' + Buffer.from(key.privateKey).toString('hex'));
    expect(scalar > 0n).toBe(true);
    expect(scalar < P256_ORDER).toBe(true);
  });

  it('derives deterministic keys', async () => {
    const seed = await mnemonicToSeed(TEST_MNEMONIC);
    const key1 = deriveP256KeyFromPath(seed, FLOW_BIP44_PATH);
    const key2 = deriveP256KeyFromPath(seed, FLOW_BIP44_PATH);
    expect(Buffer.from(key1.privateKey).toString('hex'))
      .toBe(Buffer.from(key2.privateKey).toString('hex'));
  });
});

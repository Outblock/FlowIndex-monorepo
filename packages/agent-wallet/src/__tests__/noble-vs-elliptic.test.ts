/**
 * Confirms @noble/curves v2 sign() with prehash:false matches elliptic.
 * Root cause: noble v2 secp256k1.sign() auto-hashes with SHA-256 by default.
 * Our code was double-hashing: sha256(msg) → noble.sign(sha256 AGAIN) = wrong.
 * Fix: pass prehash:false since we already hash with the Flow-configured algo.
 */
import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import elliptic from 'elliptic';

const EC = elliptic.ec;
const TEST_PRIVATE_KEY = '4800e804c6a40631ad42c2992796938899be2e0873c9c9f13700238b55cd3d67';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

describe('noble v2 with prehash:false matches elliptic', () => {
  const rawMessage = hexToBytes('deadbeef01020304deadbeef01020304deadbeef01020304deadbeef01020304');
  const digest = sha256(rawMessage);
  const privBytes = hexToBytes(TEST_PRIVATE_KEY);
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(TEST_PRIVATE_KEY, 'hex');

  it('noble sign(digest, key, {prehash:false}) matches elliptic sign(digest)', () => {
    // Fixed code path: pre-hash ourselves, tell noble NOT to hash again
    const sigBytes = secp256k1.sign(digest, privBytes, { lowS: true, prehash: false }) as Uint8Array;
    const sig = secp256k1.Signature.fromBytes(sigBytes);
    const nobleR = sig.r.toString(16).padStart(64, '0');
    const nobleS = sig.s.toString(16).padStart(64, '0');

    const ellipticSig = keyPair.sign(Buffer.from(digest), { canonical: true });
    const ellipticR = ellipticSig.r.toString(16).padStart(64, '0');
    const ellipticS = ellipticSig.s.toString(16).padStart(64, '0');

    expect(nobleR).toBe(ellipticR);
    expect(nobleS).toBe(ellipticS);
  });

  it('noble sign(rawMsg, key) (auto-hash) also matches elliptic sign(digest)', () => {
    // Alternative: let noble hash for us (only works when hashAlgo=SHA2_256)
    const sigBytes = secp256k1.sign(rawMessage, privBytes, { lowS: true }) as Uint8Array;
    const sig = secp256k1.Signature.fromBytes(sigBytes);
    const nobleR = sig.r.toString(16).padStart(64, '0');
    const nobleS = sig.s.toString(16).padStart(64, '0');

    const ellipticSig = keyPair.sign(Buffer.from(digest), { canonical: true });
    const ellipticR = ellipticSig.r.toString(16).padStart(64, '0');
    const ellipticS = ellipticSig.s.toString(16).padStart(64, '0');

    expect(nobleR).toBe(ellipticR);
    expect(nobleS).toBe(ellipticS);
  });

  it('confirms default noble sign(digest) WITHOUT prehash:false double-hashes', () => {
    // This is the BUG: without prehash:false, noble hashes the already-hashed digest
    const sigDefault = secp256k1.sign(digest, privBytes, { lowS: true }) as Uint8Array;
    const sigFixed = secp256k1.sign(digest, privBytes, { lowS: true, prehash: false }) as Uint8Array;

    const parsedDefault = secp256k1.Signature.fromBytes(sigDefault);
    const parsedFixed = secp256k1.Signature.fromBytes(sigFixed);

    // They should be DIFFERENT — proving the default double-hashes
    expect(parsedDefault.r.toString(16)).not.toBe(parsedFixed.r.toString(16));
  });
});

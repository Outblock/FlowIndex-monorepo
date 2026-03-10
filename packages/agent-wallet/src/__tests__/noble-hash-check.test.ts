/**
 * Determine if @noble/curves v2 sign() internally hashes the input.
 * If noble double-hashes, signing raw message bytes with noble should
 * produce the same result as signing pre-hashed bytes with elliptic.
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

describe('noble v2 prehash behavior', () => {
  const rawMessage = hexToBytes('deadbeef01020304deadbeef01020304deadbeef01020304deadbeef01020304');
  const digest = sha256(rawMessage);
  const privBytes = hexToBytes(TEST_PRIVATE_KEY);
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(TEST_PRIVATE_KEY, 'hex');

  it('TEST 1: noble signs RAW message → compare with elliptic signing DIGEST', () => {
    // If noble internally hashes, then sign(rawMessage) = elliptic.sign(sha256(rawMessage))
    const nobleSig = secp256k1.sign(rawMessage, privBytes, { lowS: true });
    const parsedNoble = secp256k1.Signature.fromBytes(nobleSig);
    const nobleR = parsedNoble.r.toString(16).padStart(64, '0');
    const nobleS = parsedNoble.s.toString(16).padStart(64, '0');

    const ellipticSig = keyPair.sign(Buffer.from(digest), { canonical: true });
    const ellipticR = ellipticSig.r.toString(16).padStart(64, '0');
    const ellipticS = ellipticSig.s.toString(16).padStart(64, '0');

    console.log('Noble(raw msg) r:', nobleR.slice(0, 16) + '...');
    console.log('Elliptic(digest) r:', ellipticR.slice(0, 16) + '...');
    console.log('Match:', nobleR === ellipticR && nobleS === ellipticS);

    // If this matches, noble IS prehashing internally
    if (nobleR === ellipticR) {
      console.log('>>> CONFIRMED: noble v2 sign() internally hashes the message!');
      console.log('>>> Our code double-hashes: sha256 → noble.sign(sha256 again) = WRONG');
    }
  });

  it('TEST 2: noble signs DIGEST → compare with elliptic signing DIGEST', () => {
    // Current code path: both sign the pre-hashed digest
    const nobleSig = secp256k1.sign(digest, privBytes, { lowS: true });
    const parsedNoble = secp256k1.Signature.fromBytes(nobleSig);
    const nobleR = parsedNoble.r.toString(16).padStart(64, '0');
    const nobleS = parsedNoble.s.toString(16).padStart(64, '0');

    const ellipticSig = keyPair.sign(Buffer.from(digest), { canonical: true });
    const ellipticR = ellipticSig.r.toString(16).padStart(64, '0');
    const ellipticS = ellipticSig.s.toString(16).padStart(64, '0');

    console.log('Noble(digest) r:', nobleR.slice(0, 16) + '...');
    console.log('Elliptic(digest) r:', ellipticR.slice(0, 16) + '...');
    console.log('Match:', nobleR === ellipticR && nobleS === ellipticS);
  });

  it('TEST 3: try noble with prehash: false option', () => {
    // Maybe noble v2 has a prehash option
    try {
      const sig1 = secp256k1.sign(digest, privBytes, { lowS: true, prehash: false } as any);
      const parsed1 = secp256k1.Signature.fromBytes(sig1);
      const r1 = parsed1.r.toString(16).padStart(64, '0');

      const sig2 = secp256k1.sign(digest, privBytes, { lowS: true, prehash: true } as any);
      const parsed2 = secp256k1.Signature.fromBytes(sig2);
      const r2 = parsed2.r.toString(16).padStart(64, '0');

      console.log('prehash:false r:', r1.slice(0, 16) + '...');
      console.log('prehash:true  r:', r2.slice(0, 16) + '...');
      console.log('Different:', r1 !== r2);

      // Check which matches elliptic
      const ellipticSig = keyPair.sign(Buffer.from(digest), { canonical: true });
      const eR = ellipticSig.r.toString(16).padStart(64, '0');
      console.log('elliptic      r:', eR.slice(0, 16) + '...');
      console.log('prehash:false matches elliptic:', r1 === eR);
      console.log('prehash:true  matches elliptic:', r2 === eR);
    } catch (e) {
      console.log('prehash option error:', e);
    }
  });

  it('TEST 4: check noble default secp256k1 vs SECP256K1 (hmac-based)', () => {
    // noble-curves may wrap secp256k1 with auto-hashing
    console.log('secp256k1 keys:', Object.keys(secp256k1).filter(k => typeof (secp256k1 as any)[k] === 'function'));
    console.log('Has CURVE:', 'CURVE' in secp256k1);
    if ('CURVE' in secp256k1) {
      const curve = (secp256k1 as any).CURVE;
      console.log('CURVE.hash:', curve?.hash?.name || curve?.hash);
      console.log('CURVE.hmac:', typeof curve?.hmac);
    }
  });
});

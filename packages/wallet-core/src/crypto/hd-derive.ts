import { HDKey } from '@scure/bip32';
import { p256 } from '@noble/curves/nist.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

export const FLOW_BIP44_PATH = "m/44'/539'/0'/0/0";
export const EVM_BIP44_PATH = "m/44'/60'/0'/0/0";

/** P256 curve order (n). In @noble/curves v2 this lives on Point.Fn.ORDER. */
const P256_ORDER: bigint = p256.Point.Fn.ORDER;

export interface DerivedKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function deriveSecp256k1Key(seed: Uint8Array, path: string): DerivedKey {
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(path);
  if (!child.privateKey) throw new Error('Failed to derive private key');
  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey!,
  };
}

/**
 * Derive a P256 key from a BIP-44 path.
 *
 * BIP-32 only supports secp256k1 natively. We derive 32 bytes of entropy
 * via secp256k1 HD derivation, then use those bytes as a P256 private key
 * scalar. This is the standard multi-curve wallet approach.
 *
 * The derived value is validated to be a valid P256 scalar (1 < k < n).
 * If invalid (probability ~2^-224), we increment the path index and retry.
 */
export function deriveP256KeyFromPath(seed: Uint8Array, path: string): DerivedKey {
  const master = HDKey.fromMasterSeed(seed);
  let child = master.derive(path);
  if (!child.privateKey) throw new Error('Failed to derive private key');

  // Validate as P256 scalar
  let privBytes = child.privateKey;
  let scalar = bytesToBigInt(privBytes);
  let attempt = 0;

  while (scalar === 0n || scalar >= P256_ORDER) {
    attempt++;
    if (attempt > 100) throw new Error('Failed to derive valid P256 scalar');
    // Increment last index in path
    const lastSlash = path.lastIndexOf('/');
    const base = path.slice(0, lastSlash + 1);
    const index = parseInt(path.slice(lastSlash + 1), 10);
    const newPath = `${base}${index + attempt}`;
    child = master.derive(newPath);
    if (!child.privateKey) throw new Error('Failed to derive private key');
    privBytes = child.privateKey;
    scalar = bytesToBigInt(privBytes);
  }

  // Derive P256 public key from the scalar
  const pubKey = p256.getPublicKey(privBytes, false); // uncompressed

  return {
    privateKey: privBytes,
    publicKey: pubKey,
  };
}

export function deriveEvmKey(seed: Uint8Array, path: string = EVM_BIP44_PATH): DerivedKey {
  const key = deriveSecp256k1Key(seed, path);
  return {
    privateKey: key.privateKey,
    publicKey: secp256k1.getPublicKey(key.privateKey, false), // uncompressed for EVM
  };
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

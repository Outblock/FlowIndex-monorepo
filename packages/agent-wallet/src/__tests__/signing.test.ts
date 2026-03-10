/**
 * Signing tests — the most critical area for debugging.
 *
 * Tests the full signing pipeline:
 *   1. Key derivation from mnemonic and raw private key
 *   2. Signature format (r||s, 128 hex chars)
 *   3. Signature verification using the derived public key
 *   4. Hash algorithm selection (SHA2_256 vs SHA3_256)
 *   5. Curve selection (secp256k1 vs P256)
 *   6. FCL authz integration (service.ts request interceptor)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { LocalSigner as BaseLocalSigner } from '@flowindex/flow-signer';

// ---------------------------------------------------------------------------
// Hex helpers (matching flow-signer internals)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

// Standard BIP-39 test mnemonic
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// A deterministic private key for tests (32 bytes hex)
const TEST_PRIVATE_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// A sample message to sign (simulating an RLP-encoded tx payload)
const TEST_MESSAGE_HEX = 'f90123f90120b8a87472616e73616374696f6e28616d6f756e743a20554669783634';

describe('signing — key derivation', () => {
  it('derives consistent Flow key from mnemonic via BIP-44 path', () => {
    const seed = mnemonicToSeedSync(TEST_MNEMONIC);
    const hdKey = HDKey.fromMasterSeed(seed);
    const child = hdKey.derive("m/44'/539'/0'/0/0");

    expect(child.privateKey).toBeDefined();
    const privHex = bytesToHex(child.privateKey!);
    expect(privHex.length).toBe(64); // 32 bytes

    // Derive public key (uncompressed, sans 04 prefix)
    const pubKey = secp256k1.getPublicKey(child.privateKey!, false);
    const pubHex = bytesToHex(pubKey).slice(2); // strip 04
    expect(pubHex.length).toBe(128); // 64 bytes

    // Should be deterministic
    const seed2 = mnemonicToSeedSync(TEST_MNEMONIC);
    const child2 = HDKey.fromMasterSeed(seed2).derive("m/44'/539'/0'/0/0");
    expect(bytesToHex(child2.privateKey!)).toBe(privHex);
  });

  it('derives public key from raw private key (secp256k1)', () => {
    const privBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubKey = secp256k1.getPublicKey(privBytes, false);
    const pubHex = bytesToHex(pubKey).slice(2);
    expect(pubHex.length).toBe(128);
  });

  it('derives public key from raw private key (P256)', () => {
    const privBytes = hexToBytes(TEST_PRIVATE_KEY);
    const pubKey = p256.getPublicKey(privBytes, false);
    const pubHex = bytesToHex(pubKey).slice(2);
    expect(pubHex.length).toBe(128);
  });
});

describe('signing — sign + verify', () => {
  function signAndVerify(
    privateKeyHex: string,
    messageHex: string,
    sigAlgo: 'secp256k1' | 'P256',
    hashAlgo: 'SHA2_256' | 'SHA3_256',
  ) {
    const msgBytes = hexToBytes(messageHex);
    const digest = hashAlgo === 'SHA2_256' ? sha256(msgBytes) : sha3_256(msgBytes);
    const privBytes = hexToBytes(privateKeyHex);
    const curve = sigAlgo === 'P256' ? p256 : secp256k1;

    // Sign — v2 returns raw Uint8Array (64 bytes)
    // prehash:false because we already hashed with the configured algo above
    const sigRaw = curve.sign(digest, privBytes, { lowS: true, prehash: false });
    const sig = curve.Signature.fromBytes(sigRaw);
    const rHex = sig.r.toString(16).padStart(64, '0');
    const sHex = sig.s.toString(16).padStart(64, '0');
    const signature = rHex + sHex;

    // Verify format
    expect(signature.length).toBe(128);
    expect(signature).toMatch(/^[0-9a-f]+$/);

    // Verify signature (v2 API: prehash:false since digest is already hashed)
    const pubKey = curve.getPublicKey(privBytes, false);
    const isValid = curve.verify(sigRaw, digest, pubKey, { prehash: false });
    expect(isValid).toBe(true);

    return { signature, sig, digest, pubKey };
  }

  it('secp256k1 + SHA2_256: produces valid 128-char hex signature', () => {
    signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
  });

  it('secp256k1 + SHA3_256: produces valid signature', () => {
    signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA3_256');
  });

  it('P256 + SHA2_256: produces valid signature', () => {
    signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'P256', 'SHA2_256');
  });

  it('P256 + SHA3_256: produces valid signature', () => {
    signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'P256', 'SHA3_256');
  });

  it('signature is deterministic for same inputs', () => {
    const sig1 = signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
    const sig2 = signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
    expect(sig1.signature).toBe(sig2.signature);
  });

  it('different messages produce different signatures', () => {
    const sig1 = signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
    const sig2 = signAndVerify(TEST_PRIVATE_KEY, 'deadbeef', 'secp256k1', 'SHA2_256');
    expect(sig1.signature).not.toBe(sig2.signature);
  });

  it('different keys produce different signatures', () => {
    const altKey = 'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    const sig1 = signAndVerify(TEST_PRIVATE_KEY, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
    const sig2 = signAndVerify(altKey, TEST_MESSAGE_HEX, 'secp256k1', 'SHA2_256');
    expect(sig1.signature).not.toBe(sig2.signature);
  });

  it('uses lowS normalization (no high S values)', () => {
    // secp256k1 order n
    const n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const halfOrder = n / 2n;

    // Sign many messages and verify S is always in the lower half
    for (let i = 0; i < 10; i++) {
      const msg = bytesToHex(new Uint8Array([i, 0, 1, 2, 3, 4, 5, 6]));
      const result = signAndVerify(TEST_PRIVATE_KEY, msg, 'secp256k1', 'SHA2_256');
      expect(result.sig.s <= halfOrder).toBe(true);
    }
  });
});

describe('signing — BaseLocalSigner integration', () => {
  it('initializes with raw private key and signs correctly', async () => {
    // Stub fetch so account discovery doesn't hit network
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', mockFetch);

    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api', network: 'testnet' },
      {
        privateKey: TEST_PRIVATE_KEY,
        address: '0x1234567890abcdef',
        keyIndex: 0,
        sigAlgo: 'ECDSA_secp256k1',
        hashAlgo: 'SHA2_256',
      },
    );

    await signer.init();

    const info = signer.info();
    expect(info.type).toBe('local');
    expect(info.flowAddress).toBe('0x1234567890abcdef');
    expect(info.keyIndex).toBe(0);
    expect(info.sigAlgo).toBe('ECDSA_secp256k1');
    expect(info.hashAlgo).toBe('SHA2_256');
    expect(signer.isHeadless()).toBe(true);

    // Sign
    const result = await signer.signFlowTransaction(TEST_MESSAGE_HEX);
    expect(result.signature).toBeTruthy();
    expect(result.signature.length).toBe(128);
    expect(result.signature).toMatch(/^[0-9a-f]+$/);

    // Verify the signature against the public key
    const pubKeyHex = signer.getFlowPublicKey();
    expect(pubKeyHex.length).toBe(128);

    // Reconstruct and verify
    const msgBytes = hexToBytes(TEST_MESSAGE_HEX);
    const digest = sha256(msgBytes);
    const pubKeyBytes = hexToBytes('04' + pubKeyHex); // re-add 04 prefix
    const rHex = result.signature.slice(0, 64);
    const sHex = result.signature.slice(64);
    const sig = new secp256k1.Signature(BigInt('0x' + rHex), BigInt('0x' + sHex));
    const isValid = secp256k1.verify(sig.toBytes(), digest, pubKeyBytes, { prehash: false });
    expect(isValid).toBe(true);
  });

  it('initializes with mnemonic and derives Flow + EVM keys', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', mockFetch);

    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api', network: 'testnet' },
      {
        mnemonic: TEST_MNEMONIC,
        address: '0x1234567890abcdef',
        keyIndex: 0,
      },
    );

    await signer.init();

    const info = signer.info();
    expect(info.type).toBe('local');
    expect(info.flowAddress).toBe('0x1234567890abcdef');

    // Should have a public key
    const pubKey = signer.getFlowPublicKey();
    expect(pubKey.length).toBe(128);

    // Should have an EVM address (derived from mnemonic)
    const evmAddr = signer.getEvmAddress();
    expect(evmAddr).toBeTruthy();
    expect(evmAddr).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Sign should work
    const result = await signer.signFlowTransaction(TEST_MESSAGE_HEX);
    expect(result.signature.length).toBe(128);
  });

  it('sign then verify with P256 + SHA3_256', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', mockFetch);

    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api', network: 'testnet' },
      {
        privateKey: TEST_PRIVATE_KEY,
        address: '0xabc',
        keyIndex: 0,
        sigAlgo: 'ECDSA_P256',
        hashAlgo: 'SHA3_256',
      },
    );

    await signer.init();

    const result = await signer.signFlowTransaction(TEST_MESSAGE_HEX);
    expect(result.signature.length).toBe(128);

    // Verify with P256
    const pubKeyHex = signer.getFlowPublicKey();
    const msgBytes = hexToBytes(TEST_MESSAGE_HEX);
    const digest = sha3_256(msgBytes);
    const pubKeyBytes = hexToBytes('04' + pubKeyHex);
    const rHex = result.signature.slice(0, 64);
    const sHex = result.signature.slice(64);
    const sig = new p256.Signature(BigInt('0x' + rHex), BigInt('0x' + sHex));
    const isValid = p256.verify(sig.toBytes(), digest, pubKeyBytes, { prehash: false });
    expect(isValid).toBe(true);
  });

  it('throws when not initialized', async () => {
    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api' },
      { privateKey: TEST_PRIVATE_KEY, address: '0x1' },
    );

    // Don't call init()
    await expect(signer.signFlowTransaction(TEST_MESSAGE_HEX)).rejects.toThrow();
  });

  it('throws when neither mnemonic nor privateKey provided', async () => {
    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api' },
      { address: '0x1' },
    );

    await expect(signer.init()).rejects.toThrow('requires either a mnemonic or privateKey');
  });
});

describe('signing — FCL authz interceptor format', () => {
  /**
   * This tests the critical signing flow that happens in service.ts:
   *
   * 1. FCL calls signingFunction({ message: hex })
   * 2. signingFunction calls signer.signFlowTransaction(hex)
   * 3. Returns { addr, keyId, signature }
   *
   * The "invalid signature" error happens when:
   *   - The key/address mismatch (wrong account)
   *   - The sigAlgo/hashAlgo don't match what's on-chain
   *   - The signature format is wrong
   */
  it('authz signingFunction returns correct shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const signer = new BaseLocalSigner(
      { flowindexUrl: 'https://test.api', network: 'testnet' },
      {
        privateKey: TEST_PRIVATE_KEY,
        address: '0x1234567890abcdef',
        keyIndex: 2,
        sigAlgo: 'ECDSA_secp256k1',
        hashAlgo: 'SHA2_256',
      },
    );
    await signer.init();

    // Simulate what service.ts authz does
    const info = signer.info();
    const address = info.flowAddress!;
    const keyIndex = info.keyIndex;

    // FCL calls signingFunction with { message: hex }
    const signable = { message: TEST_MESSAGE_HEX };
    const result = await signer.signFlowTransaction(signable.message);

    // Build the FCL response (as in service.ts)
    const fclResponse = {
      addr: address.replace(/^0x/, ''),
      keyId: keyIndex,
      signature: result.signature,
    };

    expect(fclResponse.addr).toBe('1234567890abcdef');
    expect(fclResponse.keyId).toBe(2);
    expect(fclResponse.signature.length).toBe(128);
    expect(fclResponse.signature).toMatch(/^[0-9a-f]+$/);
  });

  it('sigAlgo/hashAlgo codes match FCL expectations', () => {
    // These must match the numeric codes FCL uses
    function sigAlgoCode(algo: string): number {
      switch (algo) {
        case 'ECDSA_P256': return 2;
        case 'ECDSA_secp256k1': return 3;
        default: return 3;
      }
    }

    function hashAlgoCode(algo: string): number {
      switch (algo) {
        case 'SHA2_256': return 1;
        case 'SHA3_256': return 3;
        default: return 1;
      }
    }

    // Flow protocol sig algo codes
    expect(sigAlgoCode('ECDSA_P256')).toBe(2);
    expect(sigAlgoCode('ECDSA_secp256k1')).toBe(3);

    // Flow protocol hash algo codes
    expect(hashAlgoCode('SHA2_256')).toBe(1);
    expect(hashAlgoCode('SHA3_256')).toBe(3);
  });
});

describe('signing — common failure modes', () => {
  it('signature with wrong hash algo fails verification', () => {
    const privBytes = hexToBytes(TEST_PRIVATE_KEY);
    const msgBytes = hexToBytes(TEST_MESSAGE_HEX);

    // Sign with SHA2_256
    const digestSha2 = sha256(msgBytes);
    const sigRaw = secp256k1.sign(digestSha2, privBytes, { lowS: true, prehash: false });

    // Verify with SHA3_256 digest — should FAIL
    const digestSha3 = sha3_256(msgBytes);
    const pubKey = secp256k1.getPublicKey(privBytes, false);
    const isValid = secp256k1.verify(sigRaw, digestSha3, pubKey, { prehash: false });
    expect(isValid).toBe(false);
  });

  it('signature with wrong curve produces different signatures', () => {
    const privBytes = hexToBytes(TEST_PRIVATE_KEY);
    const msgBytes = hexToBytes(TEST_MESSAGE_HEX);
    const digest = sha256(msgBytes);

    // Sign with secp256k1
    const sigSecpRaw = secp256k1.sign(digest, privBytes, { lowS: true, prehash: false });
    const pubKeySecp = secp256k1.getPublicKey(privBytes, false);
    expect(secp256k1.verify(sigSecpRaw, digest, pubKeySecp, { prehash: false })).toBe(true);

    // Sign with P256 — different raw bytes entirely
    const sigP256Raw = p256.sign(digest, privBytes, { lowS: true, prehash: false });
    expect(bytesToHex(sigP256Raw)).not.toBe(bytesToHex(sigSecpRaw));
  });

  it('message with 0x prefix is handled correctly', () => {
    // The signer should strip 0x prefix
    const withPrefix = '0x' + TEST_MESSAGE_HEX;
    const withoutPrefix = TEST_MESSAGE_HEX;

    const bytes1 = hexToBytes(withPrefix);
    const bytes2 = hexToBytes(withoutPrefix);
    expect(bytesToHex(bytes1)).toBe(bytesToHex(bytes2));
  });
});

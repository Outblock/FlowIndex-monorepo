# Wallet Mobile Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the three new packages (`wallet-core`, `wallet-ui`, `wallet-mobile`) and get a working mobile Dashboard screen that displays real token balances from FlowIndex API.

**Architecture:** Create `wallet-core` (shared hooks + crypto + API client extracted from `wallet/src/`), `wallet-ui` (HeroUI-based wallet business components), and `wallet-mobile` (Expo app). The mobile app imports from both packages, authenticates via `auth-core`, and displays real data on a Dashboard tab.

**Tech Stack:** Expo SDK 52+, HeroUI Native + Uniwind, HeroUI React + Tailwind v4, vitest, @noble/curves, @scure/bip39, @scure/bip32, zustand

**Spec:** `docs/superpowers/specs/2026-03-25-wallet-mobile-crossplatform-design.md`

**Scope:** Phase 1 only (Tasks 1-6 from spec). Subsequent phases (Core Features, Connectivity, Polish) will be separate plans.

---

## File Map

### New Package: `packages/wallet-core/`

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest — deps: @noble/curves, @noble/hashes, @scure/bip39, @scure/bip32, zustand, viem |
| `tsconfig.json` | TypeScript config |
| `tsup.config.ts` | Build config (same pattern as other packages) |
| `src/index.ts` | Barrel export |
| `src/api/client.ts` | Base fetch wrapper (extracted from `wallet/src/api/client.ts`) |
| `src/api/flow.ts` | FlowIndex API functions (extracted from `wallet/src/api/flow.ts`) |
| `src/api/types.ts` | API type definitions (extracted from `wallet/src/api/flow.ts` types) |
| `src/crypto/mnemonic.ts` | BIP-39 wrapper: generate, validate, toSeed |
| `src/crypto/hd-derive.ts` | BIP-32 HD derivation for secp256k1 + P256 scalar derivation |
| `src/crypto/signer.ts` | Unified signing interface (delegates to flow-passkey/flow-signer) |
| `src/crypto/encryption.ts` | AES-GCM encrypt/decrypt |
| `src/crypto/keychain.ts` | Platform-adaptive keychain (re-exports .web or .native) |
| `src/crypto/keychain.web.ts` | Web: AES-GCM encrypted localStorage |
| `src/crypto/keychain.native.ts` | Native: expo-secure-store + AsyncStorage |
| `src/hooks/useWallet.ts` | Wallet state hook (extracted from `wallet/src/hooks/useWallet.ts` + `WalletProvider.tsx`) |
| `src/hooks/useBalance.ts` | Token balance fetching (extracted from `wallet/src/pages/Dashboard.tsx`) |
| `src/hooks/useNetwork.ts` | Network switching + persistence |
| `src/store/wallet-store.ts` | Zustand store for wallet state |
| `src/store/settings-store.ts` | Zustand store for settings |
| `src/utils/address.ts` | normalizeAddress, formatShort (from `flow-ui/src/utils/address.ts`) |
| `src/utils/format.ts` | formatNumber, formatStorageBytes (from `flow-ui/src/utils/format.ts`) |
| `src/utils/time.ts` | formatRelativeTime, formatAbsoluteTime (from `flow-ui/src/utils/time.ts`) |
| `src/utils/tokens.ts` | getTokenLogoURL (from `flow-ui/src/utils/tokens.ts`) |
| `src/utils/activity.ts` | deriveActivityType, buildSummaryLine (from `flow-ui/src/utils/activity.ts`) |
| `src/utils/nft.ts` | resolveIPFS, getNFTThumbnail (from `flow-ui/src/utils/nft.ts`) |
| `tests/crypto/mnemonic.test.ts` | BIP-39 tests with known test vectors |
| `tests/crypto/hd-derive.test.ts` | BIP-32 derivation + P256 scalar validation tests |
| `tests/crypto/encryption.test.ts` | AES-GCM round-trip tests |
| `tests/utils/address.test.ts` | Address formatting tests |

### New Package: `packages/wallet-ui/`

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest — deps: @heroui/react, lucide-react |
| `tsconfig.json` | TypeScript config |
| `tsup.config.ts` | Build config |
| `tailwind-preset.js` | Shared design tokens extending HeroUI theme |
| `src/index.ts` | Barrel export |
| `src/lib/utils.ts` | cn() helper using clsx + tailwind-merge |
| `src/components/TokenIcon.tsx` | Token logo with chain badge + fallback |
| `src/components/NetworkBadge.tsx` | Mainnet/Testnet/Emulator chip |
| `src/components/UsdValue.tsx` | Formatted USD value display |
| `src/components/GlassCard.tsx` | Platform-adaptive frosted glass card |
| `src/components/GlassCard.web.tsx` | Web: CSS backdrop-blur |
| `src/components/GlassCard.native.tsx` | Native: expo-blur or opacity fallback |
| `src/components/AccountSwitcher.tsx` | Account dropdown with avatar + truncated address |
| `src/components/ImageWithFallback.tsx` | Image with loading + error states |

### New App: `wallet-mobile/`

| File | Responsibility |
|------|---------------|
| `package.json` | Expo app manifest |
| `app.json` | Expo static config |
| `app.config.ts` | Expo dynamic config (env vars) |
| `tsconfig.json` | TypeScript config |
| `metro.config.js` | Monorepo + Uniwind Metro config |
| `tailwind.config.js` | Extends wallet-ui/tailwind-preset |
| `global.css` | Tailwind directives |
| `eas.json` | EAS Build profiles |
| `app/_layout.tsx` | Root layout (providers, fonts, theme) |
| `app/(auth)/login.tsx` | Login / create wallet screen |
| `app/(auth)/import.tsx` | Import mnemonic / private key screen |
| `app/(tabs)/_layout.tsx` | Tab navigator layout |
| `app/(tabs)/index.tsx` | Dashboard (home) — balances + recent activity |
| `providers/index.tsx` | Compose AuthProvider + WalletProvider + QueryProvider |

### Modified Files

| File | Change |
|------|--------|
| `package.json` (root) | Add `"wallet-mobile"` to workspaces array |
| `nx.json` | Add wallet-mobile target defaults if needed |

---

## Task 1: Monorepo Configuration

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add wallet-mobile to root workspaces**

In `/Users/hao/clawd/agents/fw-cs/flowscan-ai/package.json`, add `"wallet-mobile"` to the workspaces array:

```json
{
  "workspaces": [
    "packages/*",
    "frontend",
    "runner",
    "simulate/frontend",
    "ai/chat/web",
    "wallet",
    "wallet-mobile",
    "videos"
  ]
}
```

- [ ] **Step 2: Verify workspace resolution**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && cat package.json | grep -A 12 workspaces`
Expected: wallet-mobile listed in workspaces

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add wallet-mobile to monorepo workspaces"
```

---

## Task 2: Create `wallet-core` Package — API Layer

Extract the API client and types from `wallet/src/api/` into a shared package.

**Files:**
- Create: `packages/wallet-core/package.json`
- Create: `packages/wallet-core/tsconfig.json`
- Create: `packages/wallet-core/tsup.config.ts`
- Create: `packages/wallet-core/src/index.ts`
- Create: `packages/wallet-core/src/api/types.ts`
- Create: `packages/wallet-core/src/api/client.ts`
- Create: `packages/wallet-core/src/api/flow.ts`
- Reference: `wallet/src/api/client.ts` (source to extract from)
- Reference: `wallet/src/api/flow.ts` (source to extract from)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@flowindex/wallet-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./api": { "import": "./dist/api/index.js", "types": "./dist/api/index.d.ts" },
    "./crypto": { "import": "./dist/crypto/index.js", "types": "./dist/crypto/index.d.ts" },
    "./hooks": { "import": "./dist/hooks/index.js", "types": "./dist/hooks/index.d.ts" },
    "./utils": { "import": "./dist/utils/index.js", "types": "./dist/utils/index.d.ts" }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@noble/curves": "^2.0.0",
    "@noble/hashes": "^2.0.0",
    "@scure/bip32": "^2.0.0",
    "@scure/bip39": "^2.0.0",
    "zustand": "^5.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.9.3",
    "vitest": "^3.0.0",
    "@types/react": "^19.0.0"
  },
  "nx": { "tags": ["package"] }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'expo-secure-store', '@react-native-async-storage/async-storage'],
});
```

**Note:** Start with only `src/index.ts` as entry. Add sub-path entries (`src/api/index.ts`, etc.) in later tasks as the modules are created, to avoid build failures from missing files.
```

- [ ] **Step 4: Extract API types from `wallet/src/api/flow.ts`**

Read `wallet/src/api/flow.ts` and create `packages/wallet-core/src/api/types.ts` with all the type definitions (ApiResponse, TokenInfo, VaultInfo, AccountData, FtHolding, NftCollection, NftItem, AccountTransaction, FtTransfer, etc.). Copy types exactly — do not rename.

- [ ] **Step 5: Extract API client from `wallet/src/api/client.ts`**

Create `packages/wallet-core/src/api/client.ts`:

```ts
export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

let clientOptions: ApiClientOptions = {
  baseUrl: '',
};

export function configureApiClient(options: ApiClientOptions) {
  clientOptions = { ...clientOptions, ...options };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${clientOptions.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...clientOptions.headers,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}
```

- [ ] **Step 6: Extract FlowIndex API functions from `wallet/src/api/flow.ts`**

Create `packages/wallet-core/src/api/flow.ts` with all API functions (`getAccount`, `getAccountFtHoldings`, `getNftCollections`, `getNftCollectionItems`, `getAccountTransactions`, `getTokenPrices`, `getAccountFtTransfers`). Import types from `./types` and `apiFetch` from `./client`. Copy the logic exactly from `wallet/src/api/flow.ts`.

- [ ] **Step 7: Create API barrel export**

Create `packages/wallet-core/src/api/index.ts`:

```ts
export { configureApiClient, apiFetch } from './client';
export type { ApiClientOptions } from './client';
export * from './flow';
export * from './types';
```

- [ ] **Step 8: Create package barrel export (initial)**

Create `packages/wallet-core/src/index.ts`:

```ts
export * from './api/index';
```

- [ ] **Step 9: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun install && bun run build`
Expected: Clean build, dist/ populated with .js and .d.ts files

- [ ] **Step 10: Commit**

```bash
git add packages/wallet-core/
git commit -m "feat(wallet-core): create package with API client extracted from wallet"
```

---

## Task 3: Create `wallet-core` — Utility Functions

Extract all utility functions from `flow-ui/src/utils/` into `wallet-core/src/utils/`.

**Files:**
- Create: `packages/wallet-core/src/utils/address.ts`
- Create: `packages/wallet-core/src/utils/format.ts`
- Create: `packages/wallet-core/src/utils/time.ts`
- Create: `packages/wallet-core/src/utils/tokens.ts`
- Create: `packages/wallet-core/src/utils/activity.ts`
- Create: `packages/wallet-core/src/utils/nft.ts`
- Create: `packages/wallet-core/src/utils/index.ts`
- Create: `packages/wallet-core/tests/utils/address.test.ts`
- Reference: `packages/flow-ui/src/utils/` (source to extract from)

- [ ] **Step 1: Copy utility files**

Copy these files from `packages/flow-ui/src/utils/` to `packages/wallet-core/src/utils/`:
- `address.ts` → `address.ts`
- `format.ts` → `format.ts`
- `time.ts` → `time.ts`
- `tokens.ts` → `tokens.ts`
- `activity.ts` → `activity.ts`
- `nft.ts` → `nft.ts`

Update imports: replace any `@flowindex/flow-ui` imports with local relative imports. Replace `../api/types` imports with `../api/types`. Any types used from flow-ui that are actually API types should reference `../api/types`.

- [ ] **Step 2: Create utils barrel export**

Create `packages/wallet-core/src/utils/index.ts`:

```ts
export * from './address';
export * from './format';
export * from './time';
export * from './tokens';
export * from './activity';
export * from './nft';
```

- [ ] **Step 3: Update package barrel export**

Update `packages/wallet-core/src/index.ts`:

```ts
export * from './api/index';
export * from './utils/index';
```

- [ ] **Step 4: Write address utility tests**

Create `packages/wallet-core/tests/utils/address.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeAddress, formatShort } from '../../src/utils/address';

describe('normalizeAddress', () => {
  it('lowercases and adds 0x prefix', () => {
    expect(normalizeAddress('0xABCD1234')).toBe('0xabcd1234');
  });

  it('adds 0x prefix if missing', () => {
    expect(normalizeAddress('abcd1234')).toBe('0xabcd1234');
  });

  it('handles empty string', () => {
    expect(normalizeAddress('')).toBe('0x');
  });
});

describe('formatShort', () => {
  it('truncates long addresses', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const result = formatShort(addr);
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(addr.length);
  });

  it('returns short addresses as-is', () => {
    expect(formatShort('0x1234')).toBe('0x1234');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/utils/address.test.ts`
Expected: All tests pass

- [ ] **Step 6: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git add packages/wallet-core/src/utils/ packages/wallet-core/tests/
git commit -m "feat(wallet-core): extract utility functions from flow-ui"
```

---

## Task 4: Create `wallet-core` — Crypto Module

**Files:**
- Create: `packages/wallet-core/src/crypto/mnemonic.ts`
- Create: `packages/wallet-core/src/crypto/hd-derive.ts`
- Create: `packages/wallet-core/src/crypto/encryption.ts`
- Create: `packages/wallet-core/src/crypto/keychain.ts`
- Create: `packages/wallet-core/src/crypto/keychain.web.ts`
- Create: `packages/wallet-core/src/crypto/keychain.native.ts`
- Create: `packages/wallet-core/src/crypto/index.ts`
- Create: `packages/wallet-core/tests/crypto/mnemonic.test.ts`
- Create: `packages/wallet-core/tests/crypto/hd-derive.test.ts`
- Create: `packages/wallet-core/tests/crypto/encryption.test.ts`

- [ ] **Step 1: Write mnemonic test**

Create `packages/wallet-core/tests/crypto/mnemonic.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/mnemonic.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mnemonic module**

Create `packages/wallet-core/src/crypto/mnemonic.ts`:

```ts
import { generateMnemonic as _generate, validateMnemonic as _validate, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export function generateMnemonic(strength: 128 | 256 = 128): string {
  return _generate(wordlist, strength);
}

export function validateMnemonic(mnemonic: string): boolean {
  return _validate(mnemonic, wordlist);
}

export async function mnemonicToSeed(mnemonic: string, passphrase?: string): Promise<Uint8Array> {
  return mnemonicToSeedSync(mnemonic, passphrase ?? '');
}
```

- [ ] **Step 4: Run mnemonic test to verify it passes**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/mnemonic.test.ts`
Expected: All tests pass

- [ ] **Step 5: Write HD derivation test**

Create `packages/wallet-core/tests/crypto/hd-derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveSecp256k1Key, deriveP256KeyFromPath, FLOW_BIP44_PATH } from '../../src/crypto/hd-derive';
import { p256 } from '@noble/curves/nist';
import { mnemonicToSeed } from '../../src/crypto/mnemonic';

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
    expect(scalar < p256.CURVE.n).toBe(true);
  });

  it('derives deterministic keys', async () => {
    const seed = await mnemonicToSeed(TEST_MNEMONIC);
    const key1 = deriveP256KeyFromPath(seed, FLOW_BIP44_PATH);
    const key2 = deriveP256KeyFromPath(seed, FLOW_BIP44_PATH);
    expect(Buffer.from(key1.privateKey).toString('hex'))
      .toBe(Buffer.from(key2.privateKey).toString('hex'));
  });
});
```

- [ ] **Step 6: Run HD test to verify it fails**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/hd-derive.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement HD derivation module**

Create `packages/wallet-core/src/crypto/hd-derive.ts`:

```ts
import { HDKey } from '@scure/bip32';
import { p256 } from '@noble/curves/nist';
import { secp256k1 } from '@noble/curves/secp256k1';

export const FLOW_BIP44_PATH = "m/44'/539'/0'/0/0";
export const EVM_BIP44_PATH = "m/44'/60'/0'/0/0";

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

  while (scalar === 0n || scalar >= p256.CURVE.n) {
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
```

- [ ] **Step 8: Run HD test to verify it passes**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/hd-derive.test.ts`
Expected: All tests pass

- [ ] **Step 9: Write encryption test**

Create `packages/wallet-core/tests/crypto/encryption.test.ts`:

```ts
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
```

- [ ] **Step 10: Run encryption test to verify it fails**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/encryption.test.ts`
Expected: FAIL — module not found

- [ ] **Step 11: Implement encryption module**

Create `packages/wallet-core/src/crypto/encryption.ts`:

```ts
/**
 * AES-256-GCM encryption/decryption using Web Crypto API.
 * Works in both browser and React Native (with crypto.subtle polyfill).
 */

export async function deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  // Encode as base64: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
```

- [ ] **Step 12: Run encryption test to verify it passes**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run tests/crypto/encryption.test.ts`
Expected: All tests pass

- [ ] **Step 13: Create keychain modules**

Create `packages/wallet-core/src/crypto/keychain.ts`:

```ts
/**
 * Platform-adaptive keychain.
 * Metro resolves .native.ts on RN; Vite resolves .web.ts on web.
 * This file is the fallback (web).
 */
export { KeychainWeb as Keychain } from './keychain.web';
```

Create `packages/wallet-core/src/crypto/keychain.web.ts`:

```ts
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
```

Create `packages/wallet-core/src/crypto/keychain.native.ts`:

```ts
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
```

- [ ] **Step 14: Create crypto barrel export**

Create `packages/wallet-core/src/crypto/index.ts`:

```ts
export { generateMnemonic, validateMnemonic, mnemonicToSeed } from './mnemonic';
export { deriveSecp256k1Key, deriveP256KeyFromPath, deriveEvmKey, FLOW_BIP44_PATH, EVM_BIP44_PATH } from './hd-derive';
export type { DerivedKey } from './hd-derive';
export { encrypt, decrypt, deriveKeyFromPassword } from './encryption';
// Keychain: consumers import from keychain.web.ts or keychain.native.ts via platform resolution
export { KeychainWeb } from './keychain.web';
export { KeychainNative } from './keychain.native';
```

- [ ] **Step 15: Update package barrel export**

Update `packages/wallet-core/src/index.ts`:

```ts
export * from './api/index';
export * from './crypto/index';
export * from './utils/index';
```

- [ ] **Step 16: Run all crypto tests**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run`
Expected: All tests pass

- [ ] **Step 17: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build`
Expected: Clean build

- [ ] **Step 18: Commit**

```bash
git add packages/wallet-core/src/crypto/ packages/wallet-core/tests/crypto/
git commit -m "feat(wallet-core): add crypto module — mnemonic, HD derivation, encryption, keychain"
```

---

## Task 5: Create `wallet-core` — Hooks (useBalance, useWallet, useNetwork)

**Files:**
- Create: `packages/wallet-core/src/store/wallet-store.ts`
- Create: `packages/wallet-core/src/store/settings-store.ts`
- Create: `packages/wallet-core/src/hooks/useBalance.ts`
- Create: `packages/wallet-core/src/hooks/useWallet.ts`
- Create: `packages/wallet-core/src/hooks/useNetwork.ts`
- Create: `packages/wallet-core/src/hooks/index.ts`
- Reference: `wallet/src/providers/WalletProvider.tsx`
- Reference: `wallet/src/pages/Dashboard.tsx` (balance fetching logic)

- [ ] **Step 1: Create wallet zustand store**

Create `packages/wallet-core/src/store/wallet-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

export interface WalletAccount {
  credentialId: string;
  flowAddress?: string;
  flowAddressTestnet?: string;
  evmAddress?: string;
  publicKeySec1Hex: string;
  authenticatorName?: string;
}

export interface WalletState {
  accounts: WalletAccount[];
  activeAccountId: string | null;
  loading: boolean;
}

export interface WalletActions {
  setAccounts: (accounts: WalletAccount[]) => void;
  setActiveAccount: (credentialId: string) => void;
  setLoading: (loading: boolean) => void;
}

export type WalletStore = WalletState & WalletActions;

export const createWalletStore = () =>
  createStore<WalletStore>((set) => ({
    accounts: [],
    activeAccountId: null,
    loading: true,
    setAccounts: (accounts) => set({ accounts }),
    setActiveAccount: (credentialId) => set({ activeAccountId: credentialId }),
    setLoading: (loading) => set({ loading }),
  }));
```

- [ ] **Step 2: Create settings zustand store**

Create `packages/wallet-core/src/store/settings-store.ts`:

```ts
import { createStore } from 'zustand/vanilla';

export type Network = 'mainnet' | 'testnet';

export interface SettingsState {
  network: Network;
}

export interface SettingsActions {
  setNetwork: (network: Network) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const createSettingsStore = (initialNetwork: Network = 'mainnet') =>
  createStore<SettingsStore>((set) => ({
    network: initialNetwork,
    setNetwork: (network) => set({ network }),
  }));
```

- [ ] **Step 3: Create useWallet hook**

Create `packages/wallet-core/src/hooks/useWallet.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import type { WalletStore, WalletAccount } from '../store/wallet-store';

/**
 * Hook to access wallet state. Requires a WalletStore to be provided
 * via context (see WalletProvider in the consuming app).
 */
export function useWalletFromStore(store: ReturnType<typeof import('../store/wallet-store').createWalletStore>) {
  const accounts = useStore(store, (s) => s.accounts);
  const activeAccountId = useStore(store, (s) => s.activeAccountId);
  const loading = useStore(store, (s) => s.loading);
  const setAccounts = useStore(store, (s) => s.setAccounts);
  const setActiveAccount = useStore(store, (s) => s.setActiveAccount);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.credentialId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  return {
    accounts,
    activeAccount,
    loading,
    setAccounts,
    switchAccount: setActiveAccount,
  };
}
```

- [ ] **Step 4: Create useNetwork hook**

Create `packages/wallet-core/src/hooks/useNetwork.ts`:

```ts
import { useStore } from 'zustand';
import type { Network } from '../store/settings-store';

export function useNetworkFromStore(store: ReturnType<typeof import('../store/settings-store').createSettingsStore>) {
  const network = useStore(store, (s) => s.network);
  const setNetwork = useStore(store, (s) => s.setNetwork);

  return { network, setNetwork };
}
```

- [ ] **Step 5: Create useBalance hook**

Create `packages/wallet-core/src/hooks/useBalance.ts` — extracted from Dashboard.tsx logic.

**IMPORTANT:** The Dashboard uses `account.vaults` (VaultInfo objects with symbol/name/logo) as the primary data source, NOT `FtHolding` (where `token` is a raw contract string like `A.1654653399040a61.FlowToken.Vault`). The hook must match this pattern.

```ts
import { useState, useEffect, useCallback } from 'react';
import { getAccount, getTokenPrices } from '../api/flow';
import type { AccountData, VaultInfo } from '../api/types';

export interface EnrichedHolding {
  symbol: string;
  name: string;
  balance: number;
  logoUrl: string;
  usdValue: number;
  identifier: string;
}

export interface BalanceState {
  account: AccountData | null;
  holdings: EnrichedHolding[];
  totalUsd: number;
  loading: boolean;
  error: string | null;
}

export function useBalance(address: string | undefined | null) {
  const [state, setState] = useState<BalanceState>({
    account: null,
    holdings: [],
    totalUsd: 0,
    loading: false,
    error: null,
  });

  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const [accountRes, pricesRes] = await Promise.allSettled([
        getAccount(address),
        getTokenPrices(),
      ]);

      const account = accountRes.status === 'fulfilled' ? accountRes.value : null;
      const prices = pricesRes.status === 'fulfilled' ? pricesRes.value : {};

      // Build enriched holdings from account.vaults (VaultInfo has symbol/name/logo)
      const flowBalance = account?.flowBalance ?? 0;
      const flowPrice = prices['FLOW'] ?? prices['flow'] ?? 0;

      const holdings: EnrichedHolding[] = [];

      // FLOW always first
      holdings.push({
        symbol: 'FLOW',
        name: 'Flow',
        balance: flowBalance,
        logoUrl: '',
        usdValue: flowBalance * flowPrice,
        identifier: 'FLOW',
      });

      // Other tokens from vaults
      const vaults = account?.vaults;
      if (vaults) {
        const others = Object.entries(vaults)
          .filter(([, v]) => v.symbol !== 'FLOW')
          .map(([, v]: [string, VaultInfo]) => {
            const balance = v.balance ?? 0;
            const symbol = v.symbol ?? '';
            const price = prices[symbol] ?? prices[symbol.toUpperCase()] ?? 0;
            return {
              symbol,
              name: v.name ?? symbol,
              balance,
              logoUrl: v.logo ?? '',
              usdValue: balance * price,
              identifier: v.token ?? v.path ?? symbol,
            };
          })
          .filter((v) => v.balance > 0)
          .sort((a, b) => b.usdValue - a.usdValue);

        holdings.push(...others);
      }

      const totalUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);

      setState({ account, holdings, totalUsd, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { ...state, refetch: fetchBalances };
}
```

- [ ] **Step 6: Create hooks barrel export**

Create `packages/wallet-core/src/hooks/index.ts`:

```ts
export { useWalletFromStore } from './useWallet';
export { useNetworkFromStore } from './useNetwork';
export { useBalance } from './useBalance';
export type { EnrichedHolding, BalanceState } from './useBalance';
```

- [ ] **Step 7: Update package barrel export**

Update `packages/wallet-core/src/index.ts`:

```ts
export * from './api/index';
export * from './crypto/index';
export * from './hooks/index';
export * from './utils/index';
export { createWalletStore } from './store/wallet-store';
export type { WalletAccount, WalletState, WalletStore } from './store/wallet-store';
export { createSettingsStore } from './store/settings-store';
export type { Network, SettingsState, SettingsStore } from './store/settings-store';
```

- [ ] **Step 8: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build`
Expected: Clean build

- [ ] **Step 9: Commit**

```bash
git add packages/wallet-core/src/store/ packages/wallet-core/src/hooks/ packages/wallet-core/src/index.ts
git commit -m "feat(wallet-core): add zustand stores and hooks — useWallet, useBalance, useNetwork"
```

---

## Task 6: Create `wallet-ui` Package

**Files:**
- Create: `packages/wallet-ui/package.json`
- Create: `packages/wallet-ui/tsconfig.json`
- Create: `packages/wallet-ui/tsup.config.ts`
- Create: `packages/wallet-ui/tailwind-preset.js`
- Create: `packages/wallet-ui/src/index.ts`
- Create: `packages/wallet-ui/src/lib/utils.ts`
- Create: `packages/wallet-ui/src/components/TokenIcon.tsx`
- Create: `packages/wallet-ui/src/components/NetworkBadge.tsx`
- Create: `packages/wallet-ui/src/components/UsdValue.tsx`
- Create: `packages/wallet-ui/src/components/AccountSwitcher.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@flowindex/wallet-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./tailwind-preset": "./tailwind-preset.js"
  },
  "files": ["dist", "tailwind-preset.js"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.0"
  },
  "peerDependencies": {
    "@heroui/react": ">=3.0.0-rc.0",
    "lucide-react": ">=0.300.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "devDependencies": {
    "@heroui/react": "^3.0.0-rc.1",
    "@types/react": "^19.0.0",
    "lucide-react": "^0.563.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.3"
  },
  "nx": { "tags": ["package"] }
}
```

- [ ] **Step 2: Create tsconfig.json and tsup.config.ts**

`packages/wallet-ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/wallet-ui/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@heroui/react', 'lucide-react'],
});
```

- [ ] **Step 3: Create tailwind-preset.js**

`packages/wallet-ui/tailwind-preset.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        wallet: {
          primary: '#00ef8b',
          'primary-foreground': '#000000',
          secondary: '#6366f1',
          bg: '#0a0a0a',
          card: '#1a1a1a',
          'card-hover': '#2a2a2a',
          muted: '#a1a1aa',
          border: '#27272a',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

- [ ] **Step 4: Create utils**

`packages/wallet-ui/src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create TokenIcon component**

`packages/wallet-ui/src/components/TokenIcon.tsx`:

```tsx
import { cn } from '../lib/utils';

export interface TokenIconProps {
  src?: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' };
const textSizeMap = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

export function TokenIcon({ src, symbol, size = 'md', className }: TokenIconProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={symbol}
        className={cn(sizeMap[size], 'rounded-full object-cover', className)}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeMap[size],
        textSizeMap[size],
        'rounded-full bg-wallet-card flex items-center justify-center font-medium text-wallet-muted',
        className,
      )}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}
```

- [ ] **Step 6: Create NetworkBadge component**

`packages/wallet-ui/src/components/NetworkBadge.tsx`:

```tsx
import { cn } from '../lib/utils';

export interface NetworkBadgeProps {
  network: 'mainnet' | 'testnet' | 'emulator';
  className?: string;
}

const networkStyles = {
  mainnet: 'bg-wallet-success/20 text-wallet-success',
  testnet: 'bg-wallet-warning/20 text-wallet-warning',
  emulator: 'bg-wallet-secondary/20 text-wallet-secondary',
};

export function NetworkBadge({ network, className }: NetworkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        networkStyles[network],
        className,
      )}
    >
      {network}
    </span>
  );
}
```

- [ ] **Step 7: Create UsdValue component**

`packages/wallet-ui/src/components/UsdValue.tsx`:

```tsx
import { cn } from '../lib/utils';

export interface UsdValueProps {
  value: number;
  className?: string;
  compact?: boolean;
}

export function UsdValue({ value, className, compact = false }: UsdValueProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    notation: compact && value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

  return <span className={cn('tabular-nums', className)}>{formatted}</span>;
}
```

- [ ] **Step 8: Create AccountSwitcher component**

`packages/wallet-ui/src/components/AccountSwitcher.tsx`:

```tsx
import { cn } from '../lib/utils';

export interface AccountSwitcherAccount {
  id: string;
  name?: string;
  address?: string;
}

export interface AccountSwitcherProps {
  accounts: AccountSwitcherAccount[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  className?: string;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 13) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function AccountSwitcher({ accounts, activeId, onSwitch, className }: AccountSwitcherProps) {
  const active = accounts.find((a) => a.id === activeId);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {accounts.map((account) => (
        <button
          key={account.id}
          onClick={() => onSwitch(account.id)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
            account.id === activeId
              ? 'bg-wallet-primary/10 text-wallet-primary'
              : 'hover:bg-wallet-card-hover text-wallet-muted',
          )}
        >
          <div className="w-8 h-8 rounded-full bg-wallet-card flex items-center justify-center text-sm">
            {(account.name ?? 'A').charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {account.name ?? 'Account'}
            </span>
            {account.address && (
              <span className="text-xs text-wallet-muted font-mono">
                {truncateAddress(account.address)}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Create barrel export**

`packages/wallet-ui/src/index.ts`:

```ts
export { cn } from './lib/utils';
export { TokenIcon } from './components/TokenIcon';
export type { TokenIconProps } from './components/TokenIcon';
export { NetworkBadge } from './components/NetworkBadge';
export type { NetworkBadgeProps } from './components/NetworkBadge';
export { UsdValue } from './components/UsdValue';
export type { UsdValueProps } from './components/UsdValue';
export { AccountSwitcher } from './components/AccountSwitcher';
export type { AccountSwitcherProps, AccountSwitcherAccount } from './components/AccountSwitcher';
```

- [ ] **Step 10: Install deps and verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install && cd packages/wallet-ui && bun run build`
Expected: Clean build

- [ ] **Step 11: Commit**

```bash
git add packages/wallet-ui/
git commit -m "feat(wallet-ui): create package with HeroUI-based wallet components and tailwind preset"
```

---

## Task 7: Create `wallet-mobile` Expo App Skeleton

**Files:**
- Create: `wallet-mobile/package.json`
- Create: `wallet-mobile/app.json`
- Create: `wallet-mobile/app.config.ts`
- Create: `wallet-mobile/tsconfig.json`
- Create: `wallet-mobile/metro.config.js`
- Create: `wallet-mobile/tailwind.config.js`
- Create: `wallet-mobile/global.css`
- Create: `wallet-mobile/eas.json`
- Create: `wallet-mobile/app/_layout.tsx`
- Create: `wallet-mobile/app/(tabs)/_layout.tsx`
- Create: `wallet-mobile/app/(tabs)/index.tsx`
- Create: `wallet-mobile/providers/index.tsx`

- [ ] **Step 1: Create Expo project with `create-expo-app`**

Run:
```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai
bunx create-expo-app wallet-mobile --template blank-typescript
```

This creates the skeleton. We will then customize the generated files.

**IMPORTANT:** After creation, ensure `wallet-mobile/package.json` has `"main": "expo-router/entry"` — this is required for Expo Router's file-based routing to work. Without it, the `app/` directory routes will not load. Also delete `App.tsx` if generated, since Expo Router uses `app/_layout.tsx` as the entry.

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile
bunx expo install expo-router expo-secure-store expo-local-authentication expo-camera expo-notifications expo-haptics react-native-reanimated react-native-safe-area-context react-native-screens react-native-gesture-handler @shopify/flash-list @react-native-async-storage/async-storage expo-status-bar
bun add @flowindex/wallet-core@workspace:* @flowindex/wallet-ui@workspace:*
bun add react-native-unistyles lucide-react-native
```

- [ ] **Step 3: Configure metro.config.js for monorepo**

Create/replace `wallet-mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure monorepo packages are not treated as external
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
```

- [ ] **Step 4: Configure app.config.ts**

Create `wallet-mobile/app.config.ts`:

```ts
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FlowIndex Wallet',
  slug: 'flowindex-wallet',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'flowindex-wallet',
  userInterfaceStyle: 'dark',
  splash: {
    backgroundColor: '#0a0a0a',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'io.flowindex.wallet',
    infoPlist: {
      NSFaceIDUsageDescription: 'Authenticate to access your wallet',
      NSCameraUsageDescription: 'Scan QR codes to connect with dApps',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0a0a0a',
    },
    package: 'io.flowindex.wallet',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-local-authentication',
    'expo-camera',
    'expo-notifications',
    'expo-haptics',
  ],
  experiments: {
    typedRoutes: true,
  },
});
```

- [ ] **Step 5: Create EAS config**

Create `wallet-mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 13.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 6: Create root layout**

Create `wallet-mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../providers';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      />
    </AppProviders>
  );
}
```

- [ ] **Step 7: Create tab layout**

Create `wallet-mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { Home, Clock, Image, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#27272a',
        },
        tabBarActiveTintColor: '#00ef8b',
        tabBarInactiveTintColor: '#a1a1aa',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nfts"
        options={{
          title: 'NFTs',
          tabBarIcon: ({ color, size }) => <Image size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 8: Create providers**

Create `wallet-mobile/providers/index.tsx`:

```tsx
import React, { useEffect, useMemo } from 'react';
import { configureApiClient } from '@flowindex/wallet-core';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://flowindex.io/api';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureApiClient({ baseUrl: API_BASE_URL });
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 9: Create Dashboard (home) tab placeholder**

Create `wallet-mobile/app/(tabs)/index.tsx`:

```tsx
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBalance } from '@flowindex/wallet-core';

// TODO: Get address from wallet store after auth is wired up
const DEMO_ADDRESS = '0x33f75ff0b830dcec';

export default function DashboardScreen() {
  const { holdings, totalUsd, loading, error } = useBalance(DEMO_ADDRESS);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
          FlowIndex Wallet
        </Text>

        {loading ? (
          <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={{ color: '#ef4444', marginTop: 20 }}>{error}</Text>
        ) : (
          <>
            <Text style={{ color: '#00ef8b', fontSize: 36, fontWeight: '700', marginTop: 20 }}>
              ${totalUsd.toFixed(2)}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginTop: 4, marginBottom: 24 }}>
              Total Balance
            </Text>

            {holdings.map((h) => (
              <View
                key={h.identifier}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#27272a',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#1a1a1a',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
                      {h.symbol.slice(0, 2)}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                      {h.name}
                    </Text>
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>
                      {h.balance.toFixed(4)} {h.symbol}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                  ${h.usdValue.toFixed(2)}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 10: Create placeholder tab screens**

Create `wallet-mobile/app/(tabs)/activity.tsx`:

```tsx
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ActivityScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>Activity — Coming Soon</Text>
      </View>
    </SafeAreaView>
  );
}
```

Create `wallet-mobile/app/(tabs)/nfts.tsx`:

```tsx
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NFTsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>NFTs — Coming Soon</Text>
      </View>
    </SafeAreaView>
  );
}
```

Create `wallet-mobile/app/(tabs)/settings.tsx`:

```tsx
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>Settings — Coming Soon</Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 11: Install all deps from monorepo root**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install`
Expected: Clean install with all workspace links resolved

- [ ] **Step 12: Verify Expo starts**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo start --clear`
Expected: Expo dev server starts. Metro bundles without errors. (Press `q` to quit after verifying)

- [ ] **Step 13: Commit**

```bash
git add wallet-mobile/
git commit -m "feat(wallet-mobile): create Expo app skeleton with tabs, dashboard, and wallet-core integration"
```

---

## Task 8: Integration Verification

Verify the full stack works end-to-end.

- [ ] **Step 1: Build all packages**

Run:
```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai
cd packages/wallet-core && bun run build && cd ..
cd wallet-ui && bun run build && cd ../..
```
Expected: Both packages build cleanly

- [ ] **Step 2: Run all wallet-core tests**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run`
Expected: All tests pass (mnemonic, HD derivation, encryption, address utils)

- [ ] **Step 3: Verify wallet-mobile uses wallet-core**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo start --clear`
Expected: App starts, Dashboard tab fetches and displays token balances from FlowIndex API for the demo address

- [ ] **Step 4: Verify existing wallet web still works**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet && bun run dev`
Expected: Web wallet starts without errors. No regressions from new packages.

- [ ] **Step 5: Commit integration verification**

```bash
git add -A
git commit -m "chore: verify phase 1 foundation — all packages build and integrate"
```

---

## Summary

After completing all 8 tasks, you will have:

1. **`packages/wallet-core`** — Shared API client, crypto module (BIP-39, BIP-32, P256, AES-GCM, keychain), zustand stores, React hooks (useBalance, useWallet, useNetwork), utility functions — all with tests
2. **`packages/wallet-ui`** — HeroUI-based wallet components (TokenIcon, NetworkBadge, UsdValue, AccountSwitcher) with shared Tailwind preset
3. **`wallet-mobile/`** — Expo app with tab navigation, Dashboard screen showing real token balances via wallet-core

**Next plan:** Phase 2 (Core Wallet Features) — auth flow, send, activity, NFTs, settings, passkey native support, web migration

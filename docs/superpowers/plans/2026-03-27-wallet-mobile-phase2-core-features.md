# Wallet Mobile Phase 2: Core Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native passkey authentication, FLOW token sending, and four content screens (Activity, NFTs, Settings, improved Dashboard) to the wallet-mobile Expo app so it becomes a fully functional non-custodial Flow wallet sharing passkey accounts with the web wallet.

**Architecture:** Platform-split `flow-passkey` WebAuthn (`.web.ts` / `.native.ts`) so passkeys work on iOS/Android via `react-native-passkeys`. Mobile-specific AuthProvider in `wallet-mobile/` uses `auth-core` JWT/passkey helpers with AsyncStorage for token persistence. Shared WalletProvider extracted to `wallet-core`. Cadence scripts shared via `wallet-core/cadence/`.

**Tech Stack:** Expo SDK 52+, react-native-passkeys, @noble/hashes, @onflow/fcl, @shopify/flash-list, AsyncStorage, wallet-core, wallet-ui

**Spec:** `docs/superpowers/specs/2026-03-26-wallet-mobile-phase2-design.md`

---

## File Map

### Modified Package: `packages/flow-passkey/`

| File | Change |
|------|--------|
| `src/webauthn.ts` | Rename to `src/webauthn.web.ts` (content unchanged) |
| `src/webauthn.native.ts` | NEW — same exports via `react-native-passkeys` |
| `src/signer.ts` | Refactor — replace inline `navigator.credentials.get()` with `getPasskeyAssertion()` |
| `src/encode.ts` | Replace `crypto.subtle.digest('SHA-256', ...)` with `@noble/hashes/sha2` (sync) |
| `package.json` | Add `@noble/hashes`, `react-native-passkeys` as optional peer dep |
| `tsup.config.ts` | Add `.web.ts` resolve extension for esbuild |

### Modified Package: `packages/auth-core/`

| File | Change |
|------|--------|
| `src/token-storage.ts` | NEW — common interface types |
| `src/token-storage.web.ts` | NEW — delegates to existing cookie.ts |
| `src/token-storage.native.ts` | NEW — AsyncStorage implementation |
| `src/index.ts` | Export token-storage |
| `package.json` | Add `@react-native-async-storage/async-storage` as optional peer dep |
| `tsup.config.ts` | Add `.web.ts` resolve extension |

### Modified Package: `packages/wallet-core/`

| File | Change |
|------|--------|
| `src/providers/WalletProvider.tsx` | NEW — extracted from `wallet/src/providers/WalletProvider.tsx` |
| `src/providers/index.ts` | NEW — barrel export |
| `src/cadence/scripts.ts` | NEW — moved from `wallet/src/cadence/scripts.ts` |
| `src/cadence/index.ts` | NEW — barrel export |
| `src/index.ts` | Add provider + cadence exports |
| `package.json` | Add `@flowindex/auth-core`, `@flowindex/evm-wallet` peer deps |

### Modified App: `wallet-mobile/`

| File | Change |
|------|--------|
| `providers/AuthProvider.tsx` | NEW — mobile passkey auth (AsyncStorage, no OAuth) |
| `providers/index.tsx` | MODIFY — add AuthProvider + WalletProvider |
| `app/_layout.tsx` | MODIFY — add auth redirect logic |
| `app/(auth)/_layout.tsx` | NEW — auth stack layout |
| `app/(auth)/login.tsx` | NEW — Create Wallet / Sign In screen |
| `app/(tabs)/index.tsx` | MODIFY — real auth, account switcher, send/receive buttons |
| `app/send/index.tsx` | NEW — multi-step FLOW send |
| `app/(tabs)/activity.tsx` | MODIFY — transaction history + FT transfers |
| `app/(tabs)/nfts.tsx` | MODIFY — collections + items with lazy loading |
| `app/(tabs)/settings.tsx` | MODIFY — account info, network toggle, sign out |
| `app.config.ts` | MODIFY — add associated domains plugin |
| `package.json` | Add new deps |

### Infrastructure

| File | Change |
|------|--------|
| `wallet-mobile/well-known/apple-app-site-association` | NEW — for Caddy to serve |
| `wallet-mobile/well-known/assetlinks.json` | NEW — for Caddy to serve |

---

## Task 1: Associated Domain Configuration

Deploy `.well-known` files so native passkeys can use `rpId: flowindex.io`.

**Files:**
- Create: `wallet-mobile/well-known/apple-app-site-association`
- Create: `wallet-mobile/well-known/assetlinks.json`

- [ ] **Step 1: Create apple-app-site-association**

```json
{
  "webcredentials": {
    "apps": ["TEAM_ID.io.flowindex.wallet"]
  }
}
```

Create at `wallet-mobile/well-known/apple-app-site-association` (no file extension). `TEAM_ID` is a placeholder — replace with actual Apple Team ID from EAS credentials after first build.

- [ ] **Step 2: Create assetlinks.json**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "io.flowindex.wallet",
      "sha256_cert_fingerprints": ["SHA256_FINGERPRINT"]
    }
  }
]
```

Create at `wallet-mobile/well-known/assetlinks.json`. `SHA256_FINGERPRINT` placeholder — replace after first EAS Build generates signing certificate.

- [ ] **Step 3: Add associated domains to app.config.ts**

In `wallet-mobile/app.config.ts`, add the `expo-apple-authentication` or associated domains config to the iOS section:

```typescript
ios: {
  bundleIdentifier: 'io.flowindex.wallet',
  supportsTablet: true,
  infoPlist: {
    NSFaceIDUsageDescription: 'Use Face ID to authenticate with your wallet',
  },
  associatedDomains: ['webcredentials:flowindex.io'],
},
```

- [ ] **Step 4: Commit**

```bash
git add wallet-mobile/well-known/ wallet-mobile/app.config.ts
git commit -m "chore: add associated domain config for native passkeys"
```

---

## Task 2: flow-passkey Native Adaptation — SHA-256

Replace `crypto.subtle.digest` with `@noble/hashes` so `sha256()` works on React Native (no Web Crypto API).

**Files:**
- Modify: `packages/flow-passkey/src/encode.ts`
- Modify: `packages/flow-passkey/package.json`

- [ ] **Step 1: Add @noble/hashes dependency**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun add @noble/hashes --cwd packages/flow-passkey
```

- [ ] **Step 2: Replace sha256 in encode.ts**

In `packages/flow-passkey/src/encode.ts`, replace the sha256 function:

Old:
```typescript
/**
 * SHA-256 hash using Web Crypto API.
 */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : new Uint8Array(bytes).slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}
```

New:
```typescript
import { sha256 as _sha256 } from '@noble/hashes/sha2';

/**
 * SHA-256 hash using @noble/hashes (works on web + React Native).
 */
export function sha256(bytes: Uint8Array): Uint8Array {
  return _sha256(bytes);
}
```

Add the import at the top of the file (after existing imports). Remove the old `sha256` function.

Note: This changes the return type from `Promise<Uint8Array>` to `Uint8Array`. All callers that `await sha256()` still work — awaiting a non-Promise returns the value.

- [ ] **Step 3: Update signer.ts to handle sync sha256**

In `packages/flow-passkey/src/signer.ts`, the line `const challenge = await sha256(...)` still works since `await` on a non-Promise is fine. No change needed — verify this compiles.

- [ ] **Step 4: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun run build
```

Expected: Build succeeds, `dist/` output contains the new sha256 implementation.

- [ ] **Step 5: Commit**

```bash
git add packages/flow-passkey/src/encode.ts packages/flow-passkey/package.json packages/flow-passkey/bun.lockb
git commit -m "refactor(flow-passkey): replace Web Crypto sha256 with @noble/hashes"
```

---

## Task 3: flow-passkey Native Adaptation — WebAuthn Platform Split

Split `webauthn.ts` into `.web.ts` / `.native.ts` so Metro resolves the native version on React Native.

**Files:**
- Rename: `packages/flow-passkey/src/webauthn.ts` → `packages/flow-passkey/src/webauthn.web.ts`
- Create: `packages/flow-passkey/src/webauthn.native.ts`
- Modify: `packages/flow-passkey/tsup.config.ts`
- Modify: `packages/flow-passkey/package.json`

- [ ] **Step 1: Rename webauthn.ts to webauthn.web.ts**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && mv packages/flow-passkey/src/webauthn.ts packages/flow-passkey/src/webauthn.web.ts
```

No content changes — the file is identical, just renamed. All imports of `./webauthn` will resolve to `.web.ts` via tsup's resolve extensions (configured next step).

- [ ] **Step 2: Update tsup.config.ts for .web.ts resolution**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@onflow/fcl', 'react-native-passkeys'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js', '.jsx'];
  },
});
```

- [ ] **Step 3: Create webauthn.native.ts**

```typescript
/**
 * Native WebAuthn credential management via react-native-passkeys.
 * Same exports as webauthn.web.ts — Metro resolves this file on React Native.
 */
import { Passkeys } from 'react-native-passkeys';
import type { PasskeyCredentialResult, PasskeyAssertionResult } from './types';
import { bytesToHex, bytesToBase64Url, base64UrlToBytes } from './utils';

export interface CreatePasskeyOptions {
  rpId: string;
  rpName: string;
  challenge: Uint8Array;
  userId: Uint8Array;
  userName: string;
  excludeCredentials?: Array<{ id: string; type: 'public-key' }>;
}

export interface GetAssertionOptions {
  rpId: string;
  challenge: Uint8Array;
  allowCredentials?: Array<{ id: string; type: 'public-key' }>;
  mediation?: string;
  signal?: AbortSignal;
}

/**
 * Create a new passkey credential via native passkey APIs.
 */
export async function createPasskeyCredential(options: CreatePasskeyOptions): Promise<PasskeyCredentialResult> {
  const { rpId, rpName, challenge, userId, userName, excludeCredentials } = options;

  const result = await Passkeys.create({
    rp: { id: rpId, name: rpName },
    user: {
      id: bytesToBase64Url(userId),
      name: userName,
      displayName: userName,
    },
    challenge: bytesToBase64Url(challenge),
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestation: 'none',
    excludeCredentials: excludeCredentials?.map(c => ({
      id: c.id,
      type: c.type,
    })),
  });

  // Extract SEC1 public key from attestation if available
  let publicKeySec1Hex = '';
  if (result.response.publicKey) {
    // Native returns base64url-encoded SPKI DER
    const spkiBytes = base64UrlToBytes(result.response.publicKey);
    if (spkiBytes.length >= 65) {
      const sec1 = spkiBytes.slice(spkiBytes.length - 65);
      if (sec1[0] === 0x04) {
        publicKeySec1Hex = bytesToHex(sec1);
      }
    }
  }

  return {
    credentialId: result.id,
    attestationResponse: result.response as unknown as AuthenticatorAttestationResponse,
    rawId: base64UrlToBytes(result.rawId),
    type: result.type,
    publicKeySec1Hex,
  };
}

/**
 * Get a passkey assertion via native passkey APIs.
 */
export async function getPasskeyAssertion(options: GetAssertionOptions): Promise<PasskeyAssertionResult> {
  const { rpId, challenge, allowCredentials } = options;

  const result = await Passkeys.get({
    rpId,
    challenge: bytesToBase64Url(challenge),
    userVerification: 'preferred',
    allowCredentials: allowCredentials?.map(c => ({
      id: c.id,
      type: c.type,
    })),
  });

  return {
    credentialId: result.id,
    authenticatorData: base64UrlToBytes(result.response.authenticatorData),
    clientDataJSON: base64UrlToBytes(result.response.clientDataJSON),
    signature: base64UrlToBytes(result.response.signature),
    rawId: base64UrlToBytes(result.rawId),
  };
}
```

- [ ] **Step 4: Add react-native-passkeys as optional peer dep**

In `packages/flow-passkey/package.json`, add to `peerDependencies` and `peerDependenciesMeta`:

```json
{
  "peerDependencies": {
    "@onflow/fcl": ">=1.0.0",
    "react-native-passkeys": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "@onflow/fcl": { "optional": true },
    "react-native-passkeys": { "optional": true }
  }
}
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun run build
```

Expected: Build succeeds. The `.web.ts` version is compiled for dist. Metro will resolve `.native.ts` for React Native consumers.

- [ ] **Step 6: Commit**

```bash
git add packages/flow-passkey/
git commit -m "feat(flow-passkey): add native passkey support via platform split"
```

---

## Task 4: flow-passkey — Refactor signer.ts

Remove inline `navigator.credentials.get()` from `signer.ts` — delegate to `getPasskeyAssertion()` from `./webauthn` so it works on both web and native.

**Files:**
- Modify: `packages/flow-passkey/src/signer.ts`

- [ ] **Step 1: Refactor signFlowTransaction**

Replace the entire `signFlowTransaction` function in `packages/flow-passkey/src/signer.ts`:

```typescript
/**
 * Flow transaction signing with passkeys — FLIP-264 compatible.
 */
import type { PasskeySignResult } from './types';
import { bytesToHex, hexToBytes } from './utils';
import { sha256, derToP256Raw, buildExtensionData, encodeMessageFromSignable } from './encode';
import { getPasskeyAssertion } from './webauthn';

/**
 * Options for signing a Flow transaction with a passkey.
 */
export interface SignTransactionOptions {
  /** Hex-encoded message to sign (from encodeMessageFromSignable). */
  messageHex: string;
  /** Base64url-encoded credential ID of the passkey to use. */
  credentialId: string;
  /** Relying party ID (domain) for the WebAuthn assertion. */
  rpId: string;
}

/**
 * Sign a Flow transaction using a passkey.
 *
 * 1. SHA-256 hashes the message bytes (FLIP-264: hash with account key's hashAlgo)
 * 2. Gets a WebAuthn assertion with the hash as challenge
 * 3. Converts the DER signature to raw P256 (r || s)
 * 4. Builds FLIP-264 extension data from authenticator/client data
 */
export async function signFlowTransaction(options: SignTransactionOptions): Promise<PasskeySignResult> {
  const { messageHex, credentialId, rpId } = options;

  // SHA-256 hash the message (now sync via @noble/hashes)
  const challenge = sha256(hexToBytes(messageHex));

  // Get assertion via platform-resolved webauthn module
  const assertion = await getPasskeyAssertion({
    rpId,
    challenge,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
  });

  // Convert DER signature to raw r||s (64 bytes)
  const rawSig = derToP256Raw(assertion.signature);
  const signature = bytesToHex(rawSig);

  // Build FLIP-264 extension data
  const extensionData = buildExtensionData(assertion.authenticatorData, assertion.clientDataJSON);

  return { signature, extensionData };
}

/**
 * Create an FCL-compatible authorization function using a passkey.
 */
export function createPasskeyAuthz(options: {
  address: string;
  keyIndex: number;
  credentialId: string;
  rpId: string;
}): (account: any) => any {
  const { address, keyIndex, credentialId, rpId } = options;
  const addr = address.replace(/^0x/, '');

  return (account: any) => ({
    ...account,
    addr,
    keyId: keyIndex,
    signingFunction: async (signable: any) => {
      const messageHex = encodeMessageFromSignable(signable, addr);
      const { signature, extensionData } = await signFlowTransaction({ messageHex, credentialId, rpId });
      return { addr, keyId: keyIndex, signature, extensionData };
    },
  });
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun run build
```

Expected: Build succeeds. `signer.ts` no longer references `navigator.credentials`.

- [ ] **Step 3: Verify no navigator.credentials references remain**

```bash
grep -r "navigator.credentials" packages/flow-passkey/src/
```

Expected: Only matches in `webauthn.web.ts` — none in `signer.ts` or `encode.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/flow-passkey/src/signer.ts
git commit -m "refactor(flow-passkey): delegate WebAuthn calls to platform-resolved module"
```

---

## Task 5: auth-core — Platform-Split Token Storage

Add `.web.ts` / `.native.ts` token storage so the mobile AuthProvider can persist JWT tokens via AsyncStorage.

**Files:**
- Create: `packages/auth-core/src/token-storage.ts`
- Create: `packages/auth-core/src/token-storage.web.ts`
- Create: `packages/auth-core/src/token-storage.native.ts`
- Modify: `packages/auth-core/src/index.ts`
- Modify: `packages/auth-core/package.json`
- Modify: `packages/auth-core/tsup.config.ts`

- [ ] **Step 1: Create token-storage.ts (shared types)**

```typescript
import type { StoredTokens } from './types';

/**
 * Platform-agnostic token storage interface.
 * Resolved via .web.ts / .native.ts by bundler.
 */
export type { StoredTokens };

// Re-export from platform-resolved module
export { loadTokens, saveTokens, removeTokens } from './token-storage';
```

Actually, this creates a circular reference. Instead, define the interface directly and let platform files implement it.

Create `packages/auth-core/src/token-storage.web.ts`:

```typescript
import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_wallet_tokens';

/**
 * Load stored tokens from localStorage.
 * Web version — used by wallet web app and mobile via platform resolution.
 */
export function loadTokens(): StoredTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed as StoredTokens;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save tokens to localStorage.
 */
export function saveTokens(tokens: StoredTokens): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

/**
 * Remove stored tokens.
 */
export function removeTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Create token-storage.native.ts**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_wallet_tokens';

/**
 * Load stored tokens from AsyncStorage.
 * React Native version — resolved by Metro.
 */
export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed as StoredTokens;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save tokens to AsyncStorage.
 */
export async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

/**
 * Remove stored tokens from AsyncStorage.
 */
export async function removeTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
```

Note: The native version returns Promises while web returns synchronously. Callers should always `await` these functions to handle both platforms.

- [ ] **Step 3: Add AsyncStorage as optional peer dep**

In `packages/auth-core/package.json`, add:

```json
{
  "peerDependencies": {
    "@react-native-async-storage/async-storage": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "@react-native-async-storage/async-storage": { "optional": true }
  }
}
```

- [ ] **Step 4: Update tsup.config.ts for .web.ts resolution**

Read the current tsup.config.ts for auth-core, then update:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@react-native-async-storage/async-storage'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js', '.jsx'];
  },
});
```

- [ ] **Step 5: Export token storage from index.ts**

Add to `packages/auth-core/src/index.ts`:

```typescript
// Platform-adaptive token storage (web: localStorage, native: AsyncStorage)
export { loadTokens, saveTokens, removeTokens } from './token-storage';
```

Note: The import `./token-storage` resolves to `token-storage.web.ts` for tsup (via resolveExtensions) and `token-storage.native.ts` for Metro.

- [ ] **Step 6: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/auth-core && bun run build
```

Expected: Build succeeds. Existing cookie.ts exports are unchanged — no regression for web consumers.

- [ ] **Step 7: Commit**

```bash
git add packages/auth-core/
git commit -m "feat(auth-core): add platform-split token storage for React Native"
```

---

## Task 6: wallet-core — Cadence Scripts

Move Cadence transaction scripts from `wallet/src/cadence/` to `wallet-core` so both web and mobile can share them.

**Files:**
- Create: `packages/wallet-core/src/cadence/scripts.ts`
- Create: `packages/wallet-core/src/cadence/index.ts`
- Modify: `packages/wallet-core/src/index.ts`
- Modify: `wallet/src/cadence/scripts.ts`

- [ ] **Step 1: Create cadence scripts in wallet-core**

Create `packages/wallet-core/src/cadence/scripts.ts`:

```typescript
/**
 * Cadence transaction scripts shared between web and mobile wallets.
 */

/**
 * FLOW token transfer transaction.
 * Uses Cadence 1.0 / Crescendo syntax with capabilities.
 */
export const FLOW_TRANSFER_TX = `
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}
    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault!")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }
    execute {
        let receiverRef = getAccount(to).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference to the recipient's Vault")
        receiverRef.deposit(from: <-self.sentVault)
    }
}
`.trim();

/**
 * FCL contract address aliases for mainnet.
 */
export const MAINNET_ALIASES: Record<string, string> = {
  '0xFungibleToken': '0xf233dcee88fe0abe',
  '0xFlowToken': '0x1654653399040a61',
};

/**
 * FCL contract address aliases for testnet.
 */
export const TESTNET_ALIASES: Record<string, string> = {
  '0xFungibleToken': '0x9a0766d93b6608b7',
  '0xFlowToken': '0x7e60df042a9c0868',
};
```

- [ ] **Step 2: Create cadence barrel export**

Create `packages/wallet-core/src/cadence/index.ts`:

```typescript
export { FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from './scripts';
```

- [ ] **Step 3: Update wallet-core index.ts**

Add to `packages/wallet-core/src/index.ts`:

```typescript
export * from './cadence/index';
```

- [ ] **Step 4: Update wallet-core tsup.config.ts exports**

Add the cadence subpath export to `packages/wallet-core/package.json` exports field:

```json
"./cadence": {
  "import": "./dist/cadence/index.js",
  "types": "./dist/cadence/index.d.ts"
}
```

- [ ] **Step 5: Update wallet/src/cadence/scripts.ts to re-export**

Replace `wallet/src/cadence/scripts.ts` with:

```typescript
/**
 * Re-export from shared wallet-core package.
 */
export { FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from '@flowindex/wallet-core/cadence';
```

- [ ] **Step 6: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build
```

Expected: Build succeeds with cadence exports.

- [ ] **Step 7: Commit**

```bash
git add packages/wallet-core/src/cadence/ packages/wallet-core/src/index.ts packages/wallet-core/package.json wallet/src/cadence/scripts.ts
git commit -m "refactor: move Cadence scripts to wallet-core for sharing"
```

---

## Task 7: wallet-core — Shared WalletProvider

Extract WalletProvider from `wallet/src/providers/WalletProvider.tsx` into `wallet-core` for mobile consumption. The web wallet keeps its existing provider unchanged — migrating it to the shared version happens in a later phase.

**Files:**
- Create: `packages/wallet-core/src/providers/WalletProvider.tsx`
- Create: `packages/wallet-core/src/providers/index.ts`
- Modify: `packages/wallet-core/src/index.ts`
- Modify: `packages/wallet-core/package.json`

- [ ] **Step 1: Create shared WalletProvider**

Create `packages/wallet-core/src/providers/WalletProvider.tsx`:

```typescript
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { WalletAccount } from '../store/wallet-store';

export type Network = 'mainnet' | 'testnet';

export interface WalletContextValue {
  activeAccount: WalletAccount | null;
  accounts: WalletAccount[];
  network: Network;
  loading: boolean;
  evmAddress: string | null;
  switchAccount: (credentialId: string) => void;
  switchNetwork: (network: Network) => void;
  refreshAccounts: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export interface WalletProviderProps {
  children: React.ReactNode;
  /** Accounts loaded from auth layer */
  accounts: WalletAccount[];
  /** Whether auth is still loading */
  authLoading: boolean;
  /** Callback to refresh accounts from server */
  onRefreshAccounts?: () => Promise<void>;
  /** Callback to compute EVM address from public key */
  computeEvmAddress?: (publicKeySec1Hex: string) => Promise<string | null>;
  /** Persist/load network preference */
  loadNetwork?: () => Network | Promise<Network>;
  saveNetwork?: (network: Network) => void | Promise<void>;
}

export function WalletProvider({
  children,
  accounts: externalAccounts,
  authLoading,
  onRefreshAccounts,
  computeEvmAddress,
  loadNetwork: loadNetworkFn,
  saveNetwork: saveNetworkFn,
}: WalletProviderProps) {
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [network, setNetwork] = useState<Network>('mainnet');
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load persisted network on mount
  useEffect(() => {
    if (!loadNetworkFn) return;
    const result = loadNetworkFn();
    if (result instanceof Promise) {
      result.then(setNetwork).catch(() => {});
    } else {
      setNetwork(result);
    }
  }, []);

  // Sync accounts from auth layer
  useEffect(() => {
    if (authLoading) return;

    if (!externalAccounts.length) {
      setActiveAccount(null);
      setLoading(false);
      return;
    }

    setActiveAccount((prev) => {
      if (prev) {
        const matched = externalAccounts.find((a) => a.credentialId === prev.credentialId);
        if (matched) return matched;
      }
      return externalAccounts[0];
    });
    setLoading(false);
  }, [externalAccounts, authLoading]);

  // Compute EVM address when active account changes
  useEffect(() => {
    if (!activeAccount?.publicKeySec1Hex || !computeEvmAddress) {
      setEvmAddress(null);
      return;
    }
    let cancelled = false;
    computeEvmAddress(activeAccount.publicKeySec1Hex).then((addr) => {
      if (!cancelled) setEvmAddress(addr);
    }).catch(() => {
      if (!cancelled) setEvmAddress(null);
    });
    return () => { cancelled = true; };
  }, [activeAccount?.publicKeySec1Hex, computeEvmAddress]);

  const switchAccount = useCallback((credentialId: string) => {
    const acct = externalAccounts.find((a) => a.credentialId === credentialId);
    if (acct) setActiveAccount(acct);
  }, [externalAccounts]);

  const switchNetwork = useCallback((net: Network) => {
    setNetwork(net);
    if (saveNetworkFn) {
      const result = saveNetworkFn(net);
      if (result instanceof Promise) result.catch(() => {});
    }
  }, [saveNetworkFn]);

  const refreshAccounts = useCallback(async () => {
    if (!onRefreshAccounts) return;
    setLoading(true);
    try {
      await onRefreshAccounts();
    } finally {
      setLoading(false);
    }
  }, [onRefreshAccounts]);

  const value: WalletContextValue = {
    activeAccount,
    accounts: externalAccounts,
    network,
    loading: loading || authLoading,
    evmAddress,
    switchAccount,
    switchNetwork,
    refreshAccounts,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
```

- [ ] **Step 2: Create providers barrel export**

Create `packages/wallet-core/src/providers/index.ts`:

```typescript
export { WalletProvider, WalletContext, useWallet } from './WalletProvider';
export type { WalletContextValue, WalletProviderProps, Network } from './WalletProvider';
```

- [ ] **Step 3: Update wallet-core index.ts**

Add to `packages/wallet-core/src/index.ts`:

```typescript
export * from './providers/index';
```

- [ ] **Step 4: Add react peer dep for JSX**

In `packages/wallet-core/package.json`, verify `react` is in `peerDependencies` (it already is from Phase 1). Also add the providers subpath export:

```json
"./providers": {
  "import": "./dist/providers/index.js",
  "types": "./dist/providers/index.d.ts"
}
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build
```

Expected: Build succeeds with provider exports.

- [ ] **Step 6: Commit**

```bash
git add packages/wallet-core/src/providers/ packages/wallet-core/src/index.ts packages/wallet-core/package.json
git commit -m "feat(wallet-core): add shared WalletProvider for mobile consumption"
```

---

## Task 8: wallet-mobile — Install Dependencies

Install all Phase 2 dependencies for the mobile app.

**Files:**
- Modify: `wallet-mobile/package.json`

- [ ] **Step 1: Install native passkey + auth deps**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && npx expo install react-native-passkeys @react-native-async-storage/async-storage
```

- [ ] **Step 2: Install FlashList for performant lists**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && npx expo install @shopify/flash-list
```

- [ ] **Step 3: Install FCL for transaction submission**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun add @onflow/fcl --cwd wallet-mobile
```

- [ ] **Step 4: Add workspace package deps**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun add @flowindex/flow-passkey@workspace:* @flowindex/auth-core@workspace:* @flowindex/evm-wallet@workspace:* --cwd wallet-mobile
```

- [ ] **Step 5: Install from root to link workspaces**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install
```

- [ ] **Step 6: Commit**

```bash
git add wallet-mobile/package.json bun.lockb
git commit -m "chore(wallet-mobile): add Phase 2 dependencies"
```

---

## Task 9: wallet-mobile — AuthProvider

Create the mobile-specific AuthProvider that handles passkey registration/login with AsyncStorage token persistence.

**Files:**
- Create: `wallet-mobile/providers/AuthProvider.tsx`
- Modify: `wallet-mobile/providers/index.tsx`

- [ ] **Step 1: Create AuthProvider**

Create `wallet-mobile/providers/AuthProvider.tsx`:

```typescript
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPasskeyAuthClient,
  userFromToken,
  isExpired,
  secondsUntilExpiry,
  refreshAccessToken,
  gotruePost,
} from '@flowindex/auth-core';
import type { AuthUser, PasskeyAccount, PasskeyInfo, StoredTokens } from '@flowindex/auth-core';
import { signFlowTransaction, createPasskeyAuthz } from '@flowindex/flow-passkey';

// --- Token persistence via AsyncStorage ---

const TOKEN_KEY = 'flowindex_wallet_tokens';

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

async function clearTokenStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

// --- Auth context ---

export interface MobileAuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  accounts: PasskeyAccount[];
  passkeys: PasskeyInfo[];
  passkeyLoading: boolean;

  register(walletName?: string): Promise<{ credentialId: string; publicKeySec1Hex: string }>;
  login(): Promise<void>;
  signOut(): Promise<void>;
  sign(messageHex: string, credentialId: string): Promise<{ signature: string; extensionData: string }>;
  getFlowAuthz(address: string, keyIndex: number, credentialId: string): (account: any) => any;
  provisionAccounts(credentialId: string): Promise<any>;
  pollProvisionTx(txId: string, network: 'mainnet' | 'testnet'): Promise<string>;
  saveProvisionedAddress(credentialId: string, network: string, address: string): Promise<void>;
  saveEvmAddress(credentialId: string, evmAddress: string): Promise<void>;
  refreshState(): Promise<void>;
}

export const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function useMobileAuth(): MobileAuthContextValue {
  const ctx = useContext(MobileAuthContext);
  if (!ctx) throw new Error('useMobileAuth must be used within MobileAuthProvider');
  return ctx;
}

const GOTRUE_URL = process.env.EXPO_PUBLIC_GOTRUE_URL || 'https://run.flowindex.io/auth/v1';
const PASSKEY_AUTH_URL = process.env.EXPO_PUBLIC_PASSKEY_AUTH_URL || 'https://run.flowindex.io/functions/v1/passkey-auth';
const RP_ID = 'flowindex.io';
const RP_NAME = 'FlowIndex';

export function MobileAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accounts, setAccounts] = useState<PasskeyAccount[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const passkeyClient = useRef(
    createPasskeyAuthClient({
      passkeyAuthUrl: PASSKEY_AUTH_URL,
      rpId: RP_ID,
      rpName: RP_NAME,
    }),
  ).current;

  // --- Token management ---

  const scheduleRefresh = useCallback((aToken: string, rToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const secs = secondsUntilExpiry(aToken);
    const delayMs = Math.max((secs - 60) * 1000, 5_000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const data = await refreshAccessToken(GOTRUE_URL, rToken);
        const u = userFromToken(data.access_token);
        await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
        setUser(u);
        setAccessToken(data.access_token);
        refreshTokenRef.current = data.refresh_token;
        scheduleRefresh(data.access_token, data.refresh_token);
      } catch {
        await clearTokenStorage();
        setUser(null);
        setAccessToken(null);
        refreshTokenRef.current = null;
      }
    }, delayMs);
  }, []);

  const applyTokenResponse = useCallback(
    async (data: { access_token: string; refresh_token: string }) => {
      const u = userFromToken(data.access_token);
      await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
      setUser(u);
      setAccessToken(data.access_token);
      refreshTokenRef.current = data.refresh_token;
      scheduleRefresh(data.access_token, data.refresh_token);
    },
    [scheduleRefresh],
  );

  // --- Restore session on mount ---

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = await loadTokens();
      if (!stored) {
        setLoading(false);
        return;
      }

      if (!isExpired(stored.accessToken)) {
        if (!cancelled) {
          const u = userFromToken(stored.accessToken);
          setUser(u);
          setAccessToken(stored.accessToken);
          refreshTokenRef.current = stored.refreshToken;
          scheduleRefresh(stored.accessToken, stored.refreshToken);
          setLoading(false);
        }
        return;
      }

      // Token expired — try refresh
      try {
        const data = await refreshAccessToken(GOTRUE_URL, stored.refreshToken);
        if (!cancelled) {
          await applyTokenResponse(data);
        }
      } catch {
        if (!cancelled) await clearTokenStorage();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // --- Passkey state ---

  const refreshPasskeyState = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? accessToken;
    if (!token) {
      setAccounts([]);
      setPasskeys([]);
      return;
    }

    try {
      const [passkeyList, accountList] = await Promise.all([
        passkeyClient.listPasskeys(token),
        passkeyClient.listAccounts(token),
      ]);
      setPasskeys(passkeyList);
      setAccounts(accountList);
    } catch {
      setPasskeys([]);
      setAccounts([]);
    }
  }, [accessToken, passkeyClient]);

  // Load passkey state when authenticated
  useEffect(() => {
    if (user && accessToken) {
      refreshPasskeyState(accessToken);
    }
  }, [user, accessToken]);

  // --- Auth actions ---

  const register = useCallback(async (walletName?: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    setPasskeyLoading(true);
    try {
      const result = await passkeyClient.register(accessToken, walletName);
      await refreshPasskeyState(accessToken);
      return result;
    } finally {
      setPasskeyLoading(false);
    }
  }, [accessToken, passkeyClient, refreshPasskeyState]);

  const login = useCallback(async () => {
    setPasskeyLoading(true);
    try {
      const { tokenHash } = await passkeyClient.login();
      if (tokenHash) {
        const data = await gotruePost(GOTRUE_URL, '/verify', {
          type: 'magiclink',
          token_hash: tokenHash,
        });
        await applyTokenResponse(data);
        await refreshPasskeyState(data.access_token);
      }
    } finally {
      setPasskeyLoading(false);
    }
  }, [passkeyClient, applyTokenResponse, refreshPasskeyState]);

  const signOut = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    await clearTokenStorage();
    setUser(null);
    setAccessToken(null);
    refreshTokenRef.current = null;
    setAccounts([]);
    setPasskeys([]);
  }, []);

  const sign = useCallback(async (messageHex: string, credentialId: string) => {
    return signFlowTransaction({ messageHex, credentialId, rpId: RP_ID });
  }, []);

  const getFlowAuthz = useCallback((address: string, keyIndex: number, credentialId: string) => {
    return createPasskeyAuthz({ address, keyIndex, credentialId, rpId: RP_ID });
  }, []);

  const value: MobileAuthContextValue = {
    user,
    accessToken,
    loading,
    accounts,
    passkeys,
    passkeyLoading,
    register,
    login,
    signOut,
    sign,
    getFlowAuthz,
    provisionAccounts: (cid) => {
      if (!accessToken) throw new Error('Not authenticated');
      return passkeyClient.provisionAccounts(accessToken, cid);
    },
    pollProvisionTx: (txId, network) => passkeyClient.pollProvisionTx(txId, network),
    saveProvisionedAddress: async (cid, network, addr) => {
      if (!accessToken) throw new Error('Not authenticated');
      await passkeyClient.saveProvisionedAddress(accessToken, cid, network, addr);
    },
    saveEvmAddress: async (cid, evmAddr) => {
      if (!accessToken) throw new Error('Not authenticated');
      await passkeyClient.saveEvmAddress(accessToken, cid, evmAddr);
    },
    refreshState: () => refreshPasskeyState(),
  };

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}
```

- [ ] **Step 2: Update providers/index.tsx**

Replace `wallet-mobile/providers/index.tsx`:

```typescript
import { configureApiClient } from '@flowindex/wallet-core';
import { WalletProvider } from '@flowindex/wallet-core';
import { MobileAuthProvider, useMobileAuth } from './AuthProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalletAccount, Network } from '@flowindex/wallet-core';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://flowindex.io/api';
configureApiClient({ baseUrl: API_URL });

const NETWORK_KEY = 'flowindex_wallet_network';

function loadNetwork(): Network {
  // Sync read not possible with AsyncStorage — default to mainnet.
  // Network is loaded async in WalletProvider via loadNetwork prop.
  return 'mainnet';
}

async function loadNetworkAsync(): Promise<Network> {
  try {
    const stored = await AsyncStorage.getItem(NETWORK_KEY);
    if (stored === 'mainnet' || stored === 'testnet') return stored;
  } catch { /* ignore */ }
  return 'mainnet';
}

async function saveNetwork(network: Network): Promise<void> {
  try {
    await AsyncStorage.setItem(NETWORK_KEY, network);
  } catch { /* ignore */ }
}

function WalletBridge({ children }: { children: React.ReactNode }) {
  const { accounts, loading: authLoading, refreshState } = useMobileAuth();

  // Map PasskeyAccount → WalletAccount
  const walletAccounts: WalletAccount[] = accounts.map((a) => ({
    credentialId: a.credentialId,
    flowAddress: a.flowAddress,
    flowAddressTestnet: a.flowAddressTestnet,
    evmAddress: a.evmAddress,
    publicKeySec1Hex: a.publicKeySec1Hex,
    authenticatorName: a.authenticatorName,
  }));

  return (
    <WalletProvider
      accounts={walletAccounts}
      authLoading={authLoading}
      onRefreshAccounts={refreshState}
      loadNetwork={loadNetworkAsync}
      saveNetwork={saveNetwork}
    >
      {children}
    </WalletProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MobileAuthProvider>
      <WalletBridge>
        {children}
      </WalletBridge>
    </MobileAuthProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add wallet-mobile/providers/
git commit -m "feat(wallet-mobile): add AuthProvider with passkey login + WalletProvider bridge"
```

---

## Task 10: wallet-mobile — Auth Navigation + Login Screen

Add auth/tab navigation split and the login screen with "Create Wallet" and "Sign In" buttons.

**Files:**
- Modify: `wallet-mobile/app/_layout.tsx`
- Create: `wallet-mobile/app/(auth)/_layout.tsx`
- Create: `wallet-mobile/app/(auth)/login.tsx`

- [ ] **Step 1: Update root layout for auth redirect**

Replace `wallet-mobile/app/_layout.tsx`:

```typescript
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../providers';
import { useMobileAuth } from '../providers/AuthProvider';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMobileAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="send/index" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Send FLOW', headerStyle: { backgroundColor: '#0a0a0a' }, headerTintColor: '#fff' }} />
        </Stack>
      </AuthGate>
    </AppProviders>
  );
}
```

- [ ] **Step 2: Create auth layout**

Create `wallet-mobile/app/(auth)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
```

- [ ] **Step 3: Create login screen**

Create `wallet-mobile/app/(auth)/login.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileAuth } from '../../providers/AuthProvider';

export default function LoginScreen() {
  const { register, login, passkeyLoading, provisionAccounts, pollProvisionTx, saveProvisionedAddress } = useMobileAuth();
  const [status, setStatus] = useState<string>('');

  const handleCreateWallet = async () => {
    try {
      setStatus('Creating passkey...');
      // First we need to log in to get a session, then register a passkey
      // For new users: login creates the GoTrue user via passkey-auth edge function
      const { tokenHash } = await (async () => {
        // Try login first — if user has synced passkeys from web, this works
        try {
          await login();
          return { tokenHash: null }; // login() already applied tokens
        } catch {
          // No existing passkey — need fresh registration flow
          // The passkey-auth edge function handles user creation
          throw new Error('NO_EXISTING_PASSKEY');
        }
      })().catch(() => ({ tokenHash: null }));

      // If login succeeded, we're done — AuthGate will redirect to tabs
      // If we need to create a new wallet, the user needs to sign up first
      // For now, show an alert explaining the flow
      setStatus('');
    } catch (e: any) {
      setStatus('');
      Alert.alert('Error', e.message || 'Failed to create wallet');
    }
  };

  const handleSignIn = async () => {
    try {
      setStatus('Authenticating...');
      await login();
      setStatus('');
      // AuthGate handles navigation
    } catch (e: any) {
      setStatus('');
      Alert.alert('Sign In Failed', e.message || 'Could not authenticate with passkey');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 60 }}>
        <Text style={{ color: '#00ef8b', fontSize: 40, fontWeight: '800', marginBottom: 8 }}>
          FlowIndex
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>
          Non-custodial Flow Wallet
        </Text>
      </View>

      {passkeyLoading || status ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color="#00ef8b" size="large" />
          {status ? <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{status}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={handleSignIn}
            style={{
              backgroundColor: '#00ef8b',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#0a0a0a', fontSize: 17, fontWeight: '700' }}>
              Sign In with Passkey
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCreateWallet}
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#27272a',
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
              Create New Wallet
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add wallet-mobile/app/_layout.tsx wallet-mobile/app/\(auth\)/
git commit -m "feat(wallet-mobile): add auth navigation + login screen"
```

---

## Task 11: wallet-mobile — Dashboard Improvements

Replace hardcoded demo address with real auth. Add account switcher, EVM address display, and send/receive action buttons.

**Files:**
- Modify: `wallet-mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Rewrite Dashboard with real auth**

Replace `wallet-mobile/app/(tabs)/index.tsx`:

```typescript
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWallet, useBalance } from '@flowindex/wallet-core';
import * as Clipboard from 'expo-clipboard';

function formatAddress(addr?: string | null): string {
  if (!addr) return '';
  const clean = addr.startsWith('0x') ? addr : `0x${addr}`;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { activeAccount, network, evmAddress } = useWallet();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const { holdings, totalUsd, loading, error, refetch } = useBalance(flowAddress ? `0x${flowAddress}` : '');

  const copyAddress = async (addr: string) => {
    await Clipboard.setStringAsync(addr.startsWith('0x') ? addr : `0x${addr}`);
  };

  if (!activeAccount) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#00ef8b" />}
      >
        {/* Header */}
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
          FlowIndex Wallet
        </Text>

        {/* Flow Address */}
        <Pressable onPress={() => flowAddress && copyAddress(flowAddress)}>
          <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 2 }}>
            Flow: {formatAddress(flowAddress)}
          </Text>
        </Pressable>

        {/* EVM Address */}
        {evmAddress && (
          <Pressable onPress={() => copyAddress(evmAddress)}>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 4 }}>
              EVM: {formatAddress(evmAddress)}
            </Text>
          </Pressable>
        )}

        {/* Total Balance */}
        {loading ? (
          <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={{ color: '#ef4444', marginTop: 20 }}>{error}</Text>
        ) : (
          <>
            <Text style={{ color: '#00ef8b', fontSize: 36, fontWeight: '700', marginTop: 20 }}>
              ${totalUsd.toFixed(2)}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginTop: 4, marginBottom: 16 }}>
              Total Balance
            </Text>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <Pressable
                onPress={() => router.push('/send')}
                style={{
                  flex: 1,
                  backgroundColor: '#00ef8b',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#0a0a0a', fontSize: 15, fontWeight: '700' }}>Send</Text>
              </Pressable>
              <Pressable
                onPress={() => flowAddress && copyAddress(flowAddress)}
                style={{
                  flex: 1,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#27272a',
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Receive</Text>
              </Pressable>
            </View>

            {/* Holdings List */}
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
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{h.name}</Text>
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

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/index.tsx
git commit -m "feat(wallet-mobile): dashboard with real auth, addresses, send/receive"
```

---

## Task 12: wallet-mobile — Send FLOW Screen

Multi-step flow: Form → Review → Signing → Result.

**Files:**
- Create: `wallet-mobile/app/send/index.tsx`

- [ ] **Step 1: Create Send screen**

Create `wallet-mobile/app/send/index.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWallet, useBalance, FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from '@flowindex/wallet-core';
import { useMobileAuth } from '../../providers/AuthProvider';
import * as fcl from '@onflow/fcl';

type Step = 'form' | 'review' | 'signing' | 'result';

export default function SendScreen() {
  const router = useRouter();
  const { activeAccount, network } = useWallet();
  const { getFlowAuthz } = useMobileAuth();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const { holdings } = useBalance(flowAddress ? `0x${flowAddress}` : '');
  const flowBalance = holdings.find((h) => h.symbol === 'FLOW')?.balance ?? 0;

  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  const isValidAddress = /^0x[0-9a-fA-F]{16}$/.test(recipient);
  const parsedAmount = parseFloat(amount) || 0;
  const hasEnough = parsedAmount > 0 && parsedAmount <= flowBalance;

  const handleReview = () => {
    if (!isValidAddress) {
      Alert.alert('Invalid Address', 'Enter a valid Flow address (0x + 16 hex chars)');
      return;
    }
    if (!hasEnough) {
      Alert.alert('Invalid Amount', parsedAmount <= 0 ? 'Enter a positive amount' : 'Insufficient balance');
      return;
    }
    setStep('review');
  };

  const handleSend = async () => {
    if (!activeAccount || !flowAddress) return;
    setStep('signing');
    setError('');

    try {
      // Configure FCL for the current network
      const accessNode = network === 'testnet'
        ? 'https://rest-testnet.onflow.org'
        : 'https://rest-mainnet.onflow.org';
      const aliases = network === 'testnet' ? TESTNET_ALIASES : MAINNET_ALIASES;

      fcl.config()
        .put('accessNode.api', accessNode)
        .put('flow.network', network);

      // Apply contract aliases
      for (const [alias, address] of Object.entries(aliases)) {
        fcl.config().put(`0x${alias.replace('0x', '')}`, address);
      }

      const authz = getFlowAuthz(flowAddress, 0, activeAccount.credentialId);

      const txId = await fcl.mutate({
        cadence: FLOW_TRANSFER_TX,
        args: (arg: any, t: any) => [
          arg(parsedAmount.toFixed(8), t.UFix64),
          arg(recipient, t.Address),
        ],
        proposer: authz,
        payer: authz,
        authorizations: [authz],
        limit: 1000,
      });

      setTxHash(txId);
      setStep('result');
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
      setStep('result');
    }
  };

  if (step === 'form') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }} edges={['bottom']}>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 6 }}>Recipient</Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              backgroundColor: '#1a1a1a',
              color: '#fff',
              borderRadius: 10,
              padding: 14,
              fontSize: 16,
              borderWidth: 1,
              borderColor: '#27272a',
              marginBottom: 20,
            }}
          />

          <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 6 }}>Amount (FLOW)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#52525b"
            keyboardType="decimal-pad"
            style={{
              backgroundColor: '#1a1a1a',
              color: '#fff',
              borderRadius: 10,
              padding: 14,
              fontSize: 16,
              borderWidth: 1,
              borderColor: '#27272a',
              marginBottom: 8,
            }}
          />
          <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 24 }}>
            Balance: {flowBalance.toFixed(4)} FLOW
          </Text>

          <Pressable
            onPress={handleReview}
            disabled={!isValidAddress || !hasEnough}
            style={{
              backgroundColor: isValidAddress && hasEnough ? '#00ef8b' : '#27272a',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: isValidAddress && hasEnough ? '#0a0a0a' : '#71717a', fontSize: 17, fontWeight: '700' }}>
              Review
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }} edges={['bottom']}>
        <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, gap: 16 }}>
            <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Sending</Text>
            <Text style={{ color: '#00ef8b', fontSize: 32, fontWeight: '700' }}>
              {parsedAmount.toFixed(4)} FLOW
            </Text>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>To</Text>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'monospace' }}>{recipient}</Text>
            </View>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>From</Text>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'monospace' }}>
                0x{flowAddress}
              </Text>
            </View>
            <View>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 4 }}>Network</Text>
              <Text style={{ color: '#fff', fontSize: 14 }}>
                {network === 'mainnet' ? 'Flow Mainnet' : 'Flow Testnet'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <Pressable
              onPress={() => setStep('form')}
              style={{
                flex: 1,
                backgroundColor: '#1a1a1a',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handleSend}
              style={{
                flex: 1,
                backgroundColor: '#00ef8b',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#0a0a0a', fontSize: 15, fontWeight: '700' }}>Confirm & Sign</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'signing') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" size="large" />
        <Text style={{ color: '#a1a1aa', fontSize: 16, marginTop: 16 }}>
          Signing transaction...
        </Text>
      </SafeAreaView>
    );
  }

  // Result step
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 }}>
      {txHash ? (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#00ef8b', fontSize: 24, fontWeight: '700' }}>Sent!</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>
            {parsedAmount.toFixed(4)} FLOW to {recipient.slice(0, 8)}...{recipient.slice(-4)}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, fontFamily: 'monospace' }}>
            Tx: {txHash.slice(0, 16)}...
          </Text>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#ef4444', fontSize: 24, fontWeight: '700' }}>Failed</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={() => router.back()}
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          marginTop: 32,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Done</Text>
      </Pressable>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/send/
git commit -m "feat(wallet-mobile): add Send FLOW screen with passkey signing"
```

---

## Task 13: wallet-mobile — Activity Page

Transaction history and FT transfers with FlashList infinite scroll.

**Files:**
- Modify: `wallet-mobile/app/(tabs)/activity.tsx`

- [ ] **Step 1: Implement Activity screen**

Replace `wallet-mobile/app/(tabs)/activity.tsx`:

```typescript
import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useWallet } from '@flowindex/wallet-core';
import { getAccountTransactions, getAccountFtTransfers } from '@flowindex/wallet-core/api';
import { deriveActivityType, buildSummaryLine, formatRelativeTime } from '@flowindex/wallet-core/utils';
import type { AccountTransaction, FtTransfer } from '@flowindex/wallet-core/api';

type Tab = 'transactions' | 'transfers';

export default function ActivityScreen() {
  const { activeAccount, network } = useWallet();
  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const [tab, setTab] = useState<Tab>('transactions');

  if (!flowAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#71717a' }}>No account</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {/* Tab Selector */}
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        <Pressable
          onPress={() => setTab('transactions')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: tab === 'transactions' ? '#00ef8b' : '#1a1a1a',
          }}
        >
          <Text style={{ color: tab === 'transactions' ? '#0a0a0a' : '#a1a1aa', fontWeight: '600', fontSize: 14 }}>
            All Transactions
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('transfers')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: tab === 'transfers' ? '#00ef8b' : '#1a1a1a',
          }}
        >
          <Text style={{ color: tab === 'transfers' ? '#0a0a0a' : '#a1a1aa', fontWeight: '600', fontSize: 14 }}>
            FT Transfers
          </Text>
        </Pressable>
      </View>

      {tab === 'transactions' ? (
        <TransactionList address={flowAddress} />
      ) : (
        <TransferList address={flowAddress} />
      )}
    </SafeAreaView>
  );
}

function TransactionList({ address }: { address: string }) {
  const [txs, setTxs] = useState<AccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 25;

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await getAccountTransactions(address, PAGE_SIZE, offset);
      if (append) {
        setTxs((prev) => [...prev, ...result.data]);
      } else {
        setTxs(result.data);
      }
      setHasMore(result.hasMore);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  // Initial load
  useState(() => { fetchPage(0, false); });

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPage(0, false);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchPage(txs.length, true);
    }
  };

  const renderItem = ({ item }: { item: AccountTransaction }) => {
    const badge = deriveActivityType(item);
    const summary = buildSummaryLine(item);

    return (
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
            {badge.label}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12 }}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        <Text style={{ color: '#a1a1aa', fontSize: 13 }} numberOfLines={1}>
          {summary}
        </Text>
      </View>
    );
  };

  if (loading && txs.length === 0) {
    return <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />;
  }

  return (
    <FlashList
      data={txs}
      renderItem={renderItem}
      keyExtractor={(item) => `${item.id}-${item.block_height}`}
      estimatedItemSize={70}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00ef8b" />}
      ListEmptyComponent={
        <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No transactions</Text>
      }
    />
  );
}

function TransferList({ address }: { address: string }) {
  const [transfers, setTransfers] = useState<FtTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 25;

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await getAccountFtTransfers(address, PAGE_SIZE, offset);
      if (append) {
        setTransfers((prev) => [...prev, ...result.data]);
      } else {
        setTransfers(result.data);
      }
      setHasMore(result.hasMore);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  useState(() => { fetchPage(0, false); });

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPage(0, false);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchPage(transfers.length, true);
    }
  };

  const renderItem = ({ item }: { item: FtTransfer }) => {
    const isSent = item.direction === 'sent';
    const counterparty = isSent ? item.receiver : item.sender;
    const shortAddr = counterparty ? `0x${counterparty.slice(0, 4)}...${counterparty.slice(-4)}` : '';

    return (
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ color: isSent ? '#ef4444' : '#00ef8b', fontSize: 14, fontWeight: '500' }}>
            {isSent ? 'Sent' : 'Received'}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12 }}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{shortAddr}</Text>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>
            {isSent ? '-' : '+'}{parseFloat(item.amount).toFixed(4)} {item.token?.split('.').pop() || 'FLOW'}
          </Text>
        </View>
      </View>
    );
  };

  if (loading && transfers.length === 0) {
    return <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />;
  }

  return (
    <FlashList
      data={transfers}
      renderItem={renderItem}
      keyExtractor={(item, index) => `${item.transaction_hash}-${index}`}
      estimatedItemSize={70}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00ef8b" />}
      ListEmptyComponent={
        <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No transfers</Text>
      }
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/activity.tsx
git commit -m "feat(wallet-mobile): add Activity page with transactions + FT transfers"
```

---

## Task 14: wallet-mobile — NFTs Page

Collection list with expandable items, grid layout, and lazy loading.

**Files:**
- Modify: `wallet-mobile/app/(tabs)/nfts.tsx`

- [ ] **Step 1: Implement NFTs screen**

Replace `wallet-mobile/app/(tabs)/nfts.tsx`:

```typescript
import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useWallet } from '@flowindex/wallet-core';
import { getNftCollections, getNftCollectionItems } from '@flowindex/wallet-core/api';
import { resolveIPFS } from '@flowindex/wallet-core/utils';
import type { NftCollection, NftItem } from '@flowindex/wallet-core/api';

export default function NftsScreen() {
  const { activeAccount, network } = useWallet();
  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const [collections, setCollections] = useState<NftCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, NftItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<Record<string, boolean>>({});

  const fetchCollections = useCallback(async () => {
    if (!flowAddress) return;
    try {
      const result = await getNftCollections(flowAddress);
      setCollections(result);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [flowAddress]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCollections();
  };

  const toggleCollection = async (collection: NftCollection) => {
    const key = collection.id;
    if (expandedId === key) {
      setExpandedId(null);
      return;
    }
    setExpandedId(key);

    if (!items[key]) {
      setItemsLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const result = await getNftCollectionItems(flowAddress!, collection.nft_type || key, 20, 0);
        setItems((prev) => ({ ...prev, [key]: result.data || result }));
      } catch { /* ignore */ }
      setItemsLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (!flowAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#71717a' }}>No account</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', padding: 16 }}>NFTs</Text>

      <FlashList
        data={collections}
        keyExtractor={(item) => item.id}
        estimatedItemSize={80}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00ef8b" />}
        renderItem={({ item: collection }) => (
          <View>
            <Pressable
              onPress={() => toggleCollection(collection)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#1a1a1a',
              }}
            >
              {collection.logo ? (
                <Image
                  source={{ uri: resolveIPFS(collection.logo) }}
                  style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a' }}
                />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#71717a', fontSize: 14, fontWeight: '600' }}>
                    {(collection.display_name || collection.name || '?').slice(0, 2)}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                  {collection.display_name || collection.name}
                </Text>
                <Text style={{ color: '#71717a', fontSize: 13 }}>
                  {collection.owned_count ?? collection.total_count ?? '?'} items
                </Text>
              </View>
              <Text style={{ color: '#71717a', fontSize: 18 }}>
                {expandedId === collection.id ? '▾' : '▸'}
              </Text>
            </Pressable>

            {expandedId === collection.id && (
              <View style={{ padding: 12, backgroundColor: '#111' }}>
                {itemsLoading[collection.id] ? (
                  <ActivityIndicator color="#00ef8b" style={{ padding: 20 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(items[collection.id] || []).map((nft) => (
                      <View
                        key={nft.id}
                        style={{
                          width: '48%',
                          backgroundColor: '#1a1a1a',
                          borderRadius: 10,
                          overflow: 'hidden',
                          marginBottom: 4,
                        }}
                      >
                        {nft.thumbnail ? (
                          <Image
                            source={{ uri: resolveIPFS(nft.thumbnail) }}
                            style={{ width: '100%', aspectRatio: 1, backgroundColor: '#0a0a0a' }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#52525b', fontSize: 18 }}>?</Text>
                          </View>
                        )}
                        <View style={{ padding: 8 }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                            {nft.name || `#${nft.nft_id}`}
                          </Text>
                          {nft.serial_number != null && (
                            <Text style={{ color: '#71717a', fontSize: 12 }}>#{nft.serial_number}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                    {(!items[collection.id] || items[collection.id].length === 0) && (
                      <Text style={{ color: '#71717a', padding: 12 }}>No items</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No NFTs found</Text>
        }
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/nfts.tsx
git commit -m "feat(wallet-mobile): add NFTs page with collections + item grid"
```

---

## Task 15: wallet-mobile — Settings Page

Account info, passkey display, network toggle, and sign out.

**Files:**
- Modify: `wallet-mobile/app/(tabs)/settings.tsx`

- [ ] **Step 1: Implement Settings screen**

Replace `wallet-mobile/app/(tabs)/settings.tsx`:

```typescript
import { View, Text, Pressable, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@flowindex/wallet-core';
import { useMobileAuth } from '../../providers/AuthProvider';
import Constants from 'expo-constants';

function SettingsRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  return (
    <Pressable
      onPress={copyable ? handleCopy : undefined}
      style={{
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
      }}
    >
      <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 14, fontFamily: copyable ? 'monospace' : undefined }} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { activeAccount, network, switchNetwork, evmAddress } = useWallet();
  const { passkeys, signOut } = useMobileAuth();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your passkey is stored securely and you can sign back in anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', padding: 16 }}>Settings</Text>

        {/* Account Section */}
        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          ACCOUNT
        </Text>
        {flowAddress && (
          <SettingsRow label="Flow Address" value={`0x${flowAddress}`} copyable />
        )}
        {evmAddress && (
          <SettingsRow label="EVM Address" value={evmAddress} copyable />
        )}
        {activeAccount?.publicKeySec1Hex && (
          <SettingsRow
            label="Public Key"
            value={`${activeAccount.publicKeySec1Hex.slice(0, 16)}...${activeAccount.publicKeySec1Hex.slice(-8)}`}
            copyable
          />
        )}

        {/* Passkey Section */}
        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
          PASSKEY
        </Text>
        {passkeys.length > 0 ? (
          passkeys.map((pk) => (
            <View key={pk.id} style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <Text style={{ color: '#fff', fontSize: 14 }}>
                {pk.authenticatorName || 'Passkey'}
              </Text>
              {pk.createdAt && (
                <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                  Created: {new Date(pk.createdAt).toLocaleDateString()}
                </Text>
              )}
              {pk.backedUp && (
                <Text style={{ color: '#00ef8b', fontSize: 12, marginTop: 2 }}>
                  Synced (backed up)
                </Text>
              )}
            </View>
          ))
        ) : (
          <Text style={{ color: '#71717a', paddingHorizontal: 16, paddingVertical: 14 }}>
            No passkeys found
          </Text>
        )}

        {/* Network Section */}
        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
          NETWORK
        </Text>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#1a1a1a',
        }}>
          <View>
            <Text style={{ color: '#fff', fontSize: 14 }}>
              {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 12 }}>
              {network === 'mainnet' ? 'Production network' : 'Testing network'}
            </Text>
          </View>
          <Switch
            value={network === 'testnet'}
            onValueChange={(val) => switchNetwork(val ? 'testnet' : 'mainnet')}
            trackColor={{ false: '#27272a', true: '#00ef8b' }}
            thumbColor="#fff"
          />
        </View>

        {/* About Section */}
        <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
          ABOUT
        </Text>
        <SettingsRow label="Version" value={Constants.expoConfig?.version || '0.0.1'} />

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          style={{
            marginHorizontal: 16,
            marginTop: 32,
            marginBottom: 40,
            backgroundColor: '#1a1a1a',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#ef4444',
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/settings.tsx
git commit -m "feat(wallet-mobile): add Settings page with account info + network toggle"
```

---

## Task 16: Build Verification + Integration

Verify all packages build, no type errors, and the mobile app starts.

**Files:** (no new files)

- [ ] **Step 1: Build flow-passkey**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun run build
```

Expected: Build succeeds.

- [ ] **Step 2: Build auth-core**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/auth-core && bun run build
```

Expected: Build succeeds.

- [ ] **Step 3: Build wallet-core**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build
```

Expected: Build succeeds with cadence + providers exports.

- [ ] **Step 4: Run wallet-core tests**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run test
```

Expected: All existing tests pass.

- [ ] **Step 5: TypeScript check wallet-mobile**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Verify web wallet still works**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet && bun run build
```

Expected: Build succeeds. No regressions from cadence script re-export or flow-passkey changes.

- [ ] **Step 7: Commit any fixes**

If any build/type issues found, fix and commit:

```bash
git add -A
git commit -m "fix: resolve Phase 2 build issues"
```

---

## Implementation Order Summary

| Task | Description | Can Parallel With |
|------|-------------|-------------------|
| 1 | Associated domain config | Any |
| 2 | flow-passkey SHA-256 replacement | Any |
| 3 | flow-passkey WebAuthn platform split | After 2 |
| 4 | flow-passkey signer.ts refactor | After 3 |
| 5 | auth-core token storage split | 2, 3 |
| 6 | wallet-core Cadence scripts | 2, 3, 5 |
| 7 | wallet-core shared WalletProvider | 2, 3, 5 |
| 8 | wallet-mobile install deps | After 3, 5, 6, 7 |
| 9 | wallet-mobile AuthProvider | After 8 |
| 10 | Login screen + auth navigation | After 9 |
| 11 | Dashboard improvements | After 10 |
| 12 | Send FLOW screen | After 10 |
| 13 | Activity page | After 10 |
| 14 | NFTs page | After 10 |
| 15 | Settings page | After 10 |
| 16 | Build verification | After all |

Tasks 12-15 can run in parallel after Task 10 completes.

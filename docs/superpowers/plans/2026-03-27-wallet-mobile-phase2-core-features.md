# Wallet Mobile Phase 2: Core Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native passkey auth, FLOW sending, and content screens (Activity, NFTs, Settings) to wallet-mobile so it becomes a fully functional non-custodial Flow wallet sharing passkey accounts with the web wallet.

**Architecture:** Adapt `flow-passkey` with `.web.ts`/`.native.ts` platform splits for WebAuthn calls. Add a mobile-specific AuthProvider that handles passkey register/login + JWT management via AsyncStorage. Extract WalletProvider from `wallet/` into `wallet-core` for mobile consumption. Build 5 screens on top of existing `wallet-core` API hooks.

**Tech Stack:** Expo SDK 52+, react-native-passkeys, @onflow/fcl, @noble/hashes, AsyncStorage, FlashList, wallet-core hooks

**Spec:** `docs/superpowers/specs/2026-03-26-wallet-mobile-phase2-design.md`

---

## File Map

### Modified Package: `packages/flow-passkey/src/`

| File | Responsibility |
|------|---------------|
| `webauthn.ts` → `webauthn.web.ts` | Rename — existing WebAuthn impl using `navigator.credentials` (no content change) |
| `webauthn.native.ts` | NEW — native passkey impl using `react-native-passkeys` |
| `signer.ts` | MODIFY — replace inline `navigator.credentials.get()` with `getPasskeyAssertion()` call |
| `encode.ts` | MODIFY — replace `crypto.subtle.digest` with `@noble/hashes` for SHA-256 |
| `package.json` | MODIFY — add `@noble/hashes` dependency |
| `tsup.config.ts` | MODIFY — exclude `.native.ts` from bundle |

### Modified Package: `packages/auth-core/src/`

| File | Responsibility |
|------|---------------|
| `cookie.ts` → `storage.web.ts` | Rename — existing localStorage/cookie token storage |
| `storage.native.ts` | NEW — AsyncStorage token storage for React Native |
| `storage.ts` | NEW — re-exports from platform file (default to web) |
| `index.ts` | MODIFY — update barrel exports |

### New in `packages/wallet-core/src/`

| File | Responsibility |
|------|---------------|
| `providers/WalletProvider.tsx` | Shared WalletProvider extracted from `wallet/src/providers/WalletProvider.tsx` |
| `providers/index.ts` | Barrel export |
| `hooks/useWallet.ts` | MODIFY — replace zustand-based `useWalletFromStore` with context-based `useWallet` |
| `cadence/scripts.ts` | NEW — FLOW_TRANSFER_TX + contract aliases (from `wallet/src/cadence/scripts.ts`) |
| `cadence/index.ts` | Barrel export |

### New in `wallet-mobile/`

| File | Responsibility |
|------|---------------|
| `providers/AuthProvider.tsx` | Mobile auth — passkey register/login + JWT management |
| `providers/WalletProviderMobile.tsx` | Wraps wallet-core WalletProvider with mobile-specific init |
| `providers/index.tsx` | MODIFY — compose AuthProvider + WalletProvider + API config |
| `app/(auth)/_layout.tsx` | Auth route group layout |
| `app/(auth)/login.tsx` | Login/register screen |
| `app/(tabs)/index.tsx` | MODIFY — use real auth, add account switcher |
| `app/(tabs)/activity.tsx` | REPLACE — full activity page |
| `app/(tabs)/nfts.tsx` | REPLACE — full NFTs page |
| `app/(tabs)/settings.tsx` | REPLACE — full settings page |
| `app/send/index.tsx` | NEW — send FLOW flow |
| `app/_layout.tsx` | MODIFY — add auth gate (redirect to login if not authenticated) |

---

## Task 1: flow-passkey — Platform Split for WebAuthn

**Files:**
- Rename: `packages/flow-passkey/src/webauthn.ts` → `packages/flow-passkey/src/webauthn.web.ts`
- Create: `packages/flow-passkey/src/webauthn.native.ts`
- Modify: `packages/flow-passkey/src/signer.ts`
- Modify: `packages/flow-passkey/src/encode.ts`
- Modify: `packages/flow-passkey/package.json`
- Modify: `packages/flow-passkey/tsup.config.ts`

- [ ] **Step 1: Rename webauthn.ts to webauthn.web.ts**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai
mv packages/flow-passkey/src/webauthn.ts packages/flow-passkey/src/webauthn.web.ts
```

No content changes. Metro resolves `.web.ts` for web builds, `.native.ts` for RN builds. Vite resolves `.web.ts` via conditions config (or plain `.ts` fallback — we'll add a re-export shim).

- [ ] **Step 2: Create webauthn.ts shim for non-platform-aware bundlers**

Create `packages/flow-passkey/src/webauthn.ts` — a thin re-export so tsup (which doesn't do platform resolution) and any non-RN consumer still works:

```typescript
/**
 * Default webauthn — re-exports the web implementation.
 * Metro overrides this with webauthn.native.ts on React Native.
 */
export { createPasskeyCredential, getPasskeyAssertion } from './webauthn.web';
export type { CreatePasskeyOptions, GetAssertionOptions } from './webauthn.web';
```

- [ ] **Step 3: Create webauthn.native.ts**

Create `packages/flow-passkey/src/webauthn.native.ts`:

```typescript
/**
 * Native passkey implementation using react-native-passkeys.
 * Metro resolves this file on React Native instead of webauthn.web.ts.
 */
import { Passkeys } from 'react-native-passkeys';
import type { PasskeyCredentialResult, PasskeyAssertionResult } from './types';
import { bytesToHex, base64UrlToBytes, bytesToBase64Url } from './utils';

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
      { alg: -7, type: 'public-key' },   // ES256 (P-256)
      { alg: -257, type: 'public-key' },  // RS256 fallback
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

  // Extract public key from attestation response
  let publicKeySec1Hex = '';
  if (result.response.publicKey) {
    // react-native-passkeys returns publicKey as base64url
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
    attestationResponse: {
      attestationObject: base64UrlToBytes(result.response.attestationObject),
      clientDataJSON: base64UrlToBytes(result.response.clientDataJSON),
      getPublicKey: () => publicKeySec1Hex ? base64UrlToBytes(result.response.publicKey!) : null,
    } as unknown as AuthenticatorAttestationResponse,
    rawId: base64UrlToBytes(result.rawId),
    type: result.type,
    publicKeySec1Hex,
  };
}

export async function getPasskeyAssertion(options: GetAssertionOptions): Promise<PasskeyAssertionResult> {
  const { rpId, challenge, allowCredentials } = options;

  const result = await Passkeys.get({
    rpId,
    challenge: bytesToBase64Url(challenge),
    allowCredentials: allowCredentials?.map(c => ({
      id: c.id,
      type: c.type,
    })),
    userVerification: 'preferred',
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

- [ ] **Step 4: Refactor signer.ts — use getPasskeyAssertion instead of inline navigator.credentials**

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

  // SHA-256 hash the message
  const challenge = sha256(hexToBytes(messageHex));

  // Get assertion via platform-adaptive WebAuthn
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

- [ ] **Step 5: Update encode.ts — replace crypto.subtle with @noble/hashes**

In `packages/flow-passkey/src/encode.ts`, replace the `sha256` function:

Replace:
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

With:
```typescript
import { sha256 as _sha256 } from '@noble/hashes/sha2';

/**
 * SHA-256 hash (synchronous, works on all platforms).
 */
export function sha256(bytes: Uint8Array): Uint8Array {
  return _sha256(bytes);
}
```

Also add the import at the top of the file (after the existing imports).

- [ ] **Step 6: Update package.json — add @noble/hashes dependency**

In `packages/flow-passkey/package.json`, add to `dependencies`:

```json
"@noble/hashes": "^2.0.0"
```

And add `react-native-passkeys` as optional peer dependency:

```json
"peerDependencies": {
  "@onflow/fcl": ">=1.0.0",
  "react-native-passkeys": ">=3.0.0"
},
"peerDependenciesMeta": {
  "@onflow/fcl": { "optional": true },
  "react-native-passkeys": { "optional": true }
}
```

- [ ] **Step 7: Update tsup.config.ts — exclude native file**

Replace `packages/flow-passkey/tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@onflow/fcl', 'react-native-passkeys'],
});
```

- [ ] **Step 8: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun install && bun run build`
Expected: Clean build. `dist/` contains compiled JS + .d.ts files. No `navigator.credentials` references in the compiled output (only in webauthn.web.ts which re-exports through webauthn.ts).

- [ ] **Step 9: Verify existing web wallet still works**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet && bun run build`
Expected: Clean build. The web wallet imports from `@flowindex/flow-passkey` which now goes through `webauthn.ts` → `webauthn.web.ts`. No behavior change.

- [ ] **Step 10: Commit**

```bash
git add packages/flow-passkey/
git commit -m "feat(flow-passkey): platform-split webauthn for native passkey support

- Rename webauthn.ts → webauthn.web.ts (no content change)
- Add webauthn.native.ts using react-native-passkeys
- Refactor signer.ts to use getPasskeyAssertion() instead of inline navigator.credentials
- Replace crypto.subtle sha256 with @noble/hashes (sync, cross-platform)"
```

---

## Task 2: auth-core — Platform Split for Token Storage

**Files:**
- Rename: `packages/auth-core/src/cookie.ts` → `packages/auth-core/src/storage.web.ts`
- Create: `packages/auth-core/src/storage.native.ts`
- Create: `packages/auth-core/src/storage.ts`
- Modify: `packages/auth-core/src/index.ts`
- Modify: `packages/auth-core/package.json`

- [ ] **Step 1: Rename cookie.ts to storage.web.ts**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai
mv packages/auth-core/src/cookie.ts packages/auth-core/src/storage.web.ts
```

No content changes.

- [ ] **Step 2: Create storage.ts shim**

Create `packages/auth-core/src/storage.ts`:

```typescript
/**
 * Default token storage — re-exports the web implementation.
 * Metro overrides this with storage.native.ts on React Native.
 */
export { loadStoredTokens, persistTokens, clearTokens } from './storage.web';
```

- [ ] **Step 3: Create storage.native.ts**

Create `packages/auth-core/src/storage.native.ts`:

```typescript
/**
 * Token storage for React Native using AsyncStorage.
 * Metro resolves this file instead of storage.web.ts on React Native.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredTokens } from './types';

const STORAGE_KEY = 'flowindex_auth_tokens';

export async function loadStoredTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) {
      return parsed as StoredTokens;
    }
    return null;
  } catch {
    return null;
  }
}

export async function persistTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken }));
  } catch { /* ignore */ }
}

export async function clearTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
```

**Note:** The native version makes `loadStoredTokens` async (returns `Promise<StoredTokens | null>`). The web version is sync but returns the same type — callers should `await` both for compatibility.

- [ ] **Step 4: Update auth-core index.ts**

In `packages/auth-core/src/index.ts`, update the cookie/storage export. Find the line that exports from `./cookie` and replace:

Replace:
```typescript
export { loadStoredTokens, persistTokens, clearTokens, loadTokensFromCookie } from './cookie';
```

With:
```typescript
export { loadStoredTokens, persistTokens, clearTokens } from './storage';
// Web-only: direct cookie access (not available on native)
export { loadTokensFromCookie } from './storage.web';
```

- [ ] **Step 5: Add AsyncStorage as optional peer dependency**

In `packages/auth-core/package.json`, add:

```json
"peerDependencies": {
  "@react-native-async-storage/async-storage": ">=1.0.0"
},
"peerDependenciesMeta": {
  "@react-native-async-storage/async-storage": { "optional": true }
}
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/auth-core && bun install && bun run build`
Expected: Clean build.

- [ ] **Step 7: Verify web wallet still works**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet && bun run build`
Expected: Clean build. Web wallet uses `storage.ts` → `storage.web.ts` → same behavior as old `cookie.ts`.

- [ ] **Step 8: Commit**

```bash
git add packages/auth-core/
git commit -m "feat(auth-core): platform-split token storage for React Native

- Rename cookie.ts → storage.web.ts (no content change)
- Add storage.native.ts using AsyncStorage
- Add storage.ts shim for default resolution"
```

---

## Task 3: wallet-core — Extract WalletProvider + Cadence Scripts

**Files:**
- Create: `packages/wallet-core/src/providers/WalletProvider.tsx`
- Create: `packages/wallet-core/src/providers/index.ts`
- Create: `packages/wallet-core/src/cadence/scripts.ts`
- Create: `packages/wallet-core/src/cadence/index.ts`
- Modify: `packages/wallet-core/src/hooks/useWallet.ts`
- Modify: `packages/wallet-core/src/hooks/index.ts`
- Modify: `packages/wallet-core/src/index.ts`
- Modify: `packages/wallet-core/package.json`

- [ ] **Step 1: Create Cadence scripts**

Create `packages/wallet-core/src/cadence/scripts.ts`:

```typescript
/**
 * Cadence transaction scripts for wallet operations.
 */

export const FLOW_TRANSFER_TX = `
import "FungibleToken"
import "FlowToken"

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault!")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        let receiverRef = getAccount(to)
            .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference to the recipient's Vault")
        receiverRef.deposit(from: <-self.sentVault)
    }
}
`;

export const MAINNET_ALIASES: Record<string, string> = {
  FungibleToken: '0xf233dcee88fe0abe',
  FlowToken: '0x1654653399040a61',
};

export const TESTNET_ALIASES: Record<string, string> = {
  FungibleToken: '0x9a0766d93b6608b7',
  FlowToken: '0x7e60df042a9c0868',
};
```

- [ ] **Step 2: Create Cadence barrel export**

Create `packages/wallet-core/src/cadence/index.ts`:

```typescript
export { FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from './scripts';
```

- [ ] **Step 3: Create shared WalletProvider**

Create `packages/wallet-core/src/providers/WalletProvider.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Network } from '../store/settings-store';

/**
 * Passkey-linked Flow account.
 * Matches the PasskeyAccount type from auth-core.
 */
export interface WalletAccount {
  credentialId: string;
  flowAddress?: string;
  flowAddressTestnet?: string;
  evmAddress?: string;
  publicKeySec1Hex: string;
  authenticatorName?: string;
}

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

const WalletContext = createContext<WalletContextValue | null>(null);

export interface WalletProviderProps {
  children: React.ReactNode;
  /** Initial accounts to populate (from auth layer). */
  accounts: WalletAccount[];
  /** Callback to re-fetch accounts from the server. */
  onRefreshAccounts?: () => Promise<WalletAccount[]>;
  /** Initial network. */
  initialNetwork?: Network;
  /** Callback when network changes (for persistence). */
  onNetworkChange?: (network: Network) => void;
  /** Callback when active account changes (for persistence). */
  onActiveAccountChange?: (credentialId: string) => void;
  /** Initial active account credential ID. */
  initialActiveAccountId?: string | null;
}

export function WalletProvider({
  children,
  accounts: initialAccounts,
  onRefreshAccounts,
  initialNetwork = 'mainnet',
  onNetworkChange,
  onActiveAccountChange,
  initialActiveAccountId,
}: WalletProviderProps) {
  const [accounts, setAccounts] = useState<WalletAccount[]>(initialAccounts);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    initialActiveAccountId ?? initialAccounts[0]?.credentialId ?? null,
  );
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [loading, setLoading] = useState(false);

  // Sync accounts when prop changes
  useEffect(() => {
    setAccounts(initialAccounts);
    if (!activeAccountId && initialAccounts.length > 0) {
      setActiveAccountId(initialAccounts[0].credentialId);
    }
  }, [initialAccounts]);

  const activeAccount = useMemo(
    () => accounts.find(a => a.credentialId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  const evmAddress = activeAccount?.evmAddress ?? null;

  const switchAccount = useCallback((credentialId: string) => {
    setActiveAccountId(credentialId);
    onActiveAccountChange?.(credentialId);
  }, [onActiveAccountChange]);

  const switchNetwork = useCallback((n: Network) => {
    setNetwork(n);
    onNetworkChange?.(n);
  }, [onNetworkChange]);

  const refreshAccounts = useCallback(async () => {
    if (!onRefreshAccounts) return;
    setLoading(true);
    try {
      const fresh = await onRefreshAccounts();
      setAccounts(fresh);
    } finally {
      setLoading(false);
    }
  }, [onRefreshAccounts]);

  const value = useMemo<WalletContextValue>(() => ({
    activeAccount,
    accounts,
    network,
    loading,
    evmAddress,
    switchAccount,
    switchNetwork,
    refreshAccounts,
  }), [activeAccount, accounts, network, loading, evmAddress, switchAccount, switchNetwork, refreshAccounts]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
```

- [ ] **Step 4: Create providers barrel export**

Create `packages/wallet-core/src/providers/index.ts`:

```typescript
export { WalletProvider, useWallet } from './WalletProvider';
export type { WalletProviderProps, WalletContextValue, WalletAccount } from './WalletProvider';
```

- [ ] **Step 5: Update hooks/useWallet.ts**

Replace `packages/wallet-core/src/hooks/useWallet.ts` — re-export the context-based hook instead of the zustand-based one:

```typescript
/**
 * Re-export useWallet from providers for convenience.
 * This replaces the old zustand-based useWalletFromStore.
 */
export { useWallet } from '../providers/WalletProvider';
export type { WalletContextValue, WalletAccount } from '../providers/WalletProvider';
```

- [ ] **Step 6: Update hooks/index.ts**

Replace `packages/wallet-core/src/hooks/index.ts`:

```typescript
export { useWallet } from './useWallet';
export type { WalletContextValue, WalletAccount } from './useWallet';
export { useNetworkFromStore } from './useNetwork';
export { useBalance } from './useBalance';
export type { EnrichedHolding, BalanceState } from './useBalance';
```

- [ ] **Step 7: Update wallet-core index.ts**

Replace `packages/wallet-core/src/index.ts`:

```typescript
export * from './api/index';
export * from './crypto/index';
export * from './hooks/index';
export * from './utils/index';
export * from './providers/index';
export * from './cadence/index';
export { createWalletStore } from './store/wallet-store';
export type { WalletState, WalletStore } from './store/wallet-store';
export { createSettingsStore } from './store/settings-store';
export type { Network, SettingsState, SettingsStore } from './store/settings-store';
```

- [ ] **Step 8: Add react-dom as optional peer dep**

In `packages/wallet-core/package.json`, add to `peerDependencies`:

```json
"react-dom": ">=18.0.0"
```

And in `peerDependenciesMeta`:

```json
"react-dom": { "optional": true }
```

- [ ] **Step 9: Verify build**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build`
Expected: Clean build.

- [ ] **Step 10: Commit**

```bash
git add packages/wallet-core/
git commit -m "feat(wallet-core): add shared WalletProvider and Cadence scripts

- Extract WalletProvider from wallet/ into shared package
- Replace zustand-based useWalletFromStore with context-based useWallet
- Add FLOW_TRANSFER_TX cadence script + contract aliases"
```

---

## Task 4: wallet-mobile — Auth Provider + Login Screen

**Files:**
- Create: `wallet-mobile/providers/AuthProvider.tsx`
- Create: `wallet-mobile/providers/WalletProviderMobile.tsx`
- Modify: `wallet-mobile/providers/index.tsx`
- Create: `wallet-mobile/app/(auth)/_layout.tsx`
- Create: `wallet-mobile/app/(auth)/login.tsx`
- Modify: `wallet-mobile/app/_layout.tsx`
- Modify: `wallet-mobile/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile
bunx expo install react-native-passkeys
bun add @flowindex/auth-core@workspace:* @flowindex/flow-passkey@workspace:*
```

- [ ] **Step 2: Create AuthProvider**

Create `wallet-mobile/providers/AuthProvider.tsx`:

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createPasskeyAuthClient } from '@flowindex/auth-core/passkey-client';
import { refreshAccessToken } from '@flowindex/auth-core/gotrue';
import { parseJwt, isExpired, secondsUntilExpiry } from '@flowindex/auth-core/jwt';
import type { StoredTokens, AuthUser, PasskeyAccount } from '@flowindex/auth-core/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKENS_KEY = 'flowindex_auth_tokens';
const GOTRUE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1`
  : 'https://run.flowindex.io/auth/v1';
const PASSKEY_AUTH_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/passkey-auth`
  : 'https://run.flowindex.io/functions/v1/passkey-auth';
const RP_ID = 'flowindex.io';
const RP_NAME = 'FlowIndex Wallet';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  accounts: PasskeyAccount[];
}

interface AuthContextValue extends AuthState {
  register: (walletName?: string) => Promise<PasskeyAccount[]>;
  login: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccounts: () => Promise<PasskeyAccount[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    loading: true,
    accounts: [],
  });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passkeyClient = createPasskeyAuthClient({
    passkeyAuthUrl: PASSKEY_AUTH_URL,
    rpId: RP_ID,
    rpName: RP_NAME,
  });

  // Persist tokens to AsyncStorage
  const saveTokens = useCallback(async (tokens: StoredTokens) => {
    await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  }, []);

  const clearStoredTokens = useCallback(async () => {
    await AsyncStorage.removeItem(TOKENS_KEY);
  }, []);

  // Schedule token refresh
  const scheduleRefresh = useCallback((accessToken: string, refreshToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const secsLeft = secondsUntilExpiry(accessToken);
    const delay = Math.max((secsLeft - 60) * 1000, 5000); // Refresh 60s before expiry
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const data = await refreshAccessToken(GOTRUE_URL, refreshToken);
        const newTokens = { accessToken: data.access_token, refreshToken: data.refresh_token };
        await saveTokens(newTokens);
        const user = parseJwt(newTokens.accessToken);
        setState(s => ({ ...s, accessToken: newTokens.accessToken, user }));
        scheduleRefresh(newTokens.accessToken, newTokens.refreshToken);
      } catch {
        // Refresh failed — force re-login
        await clearStoredTokens();
        setState({ user: null, accessToken: null, loading: false, accounts: [] });
      }
    }, delay);
  }, [saveTokens, clearStoredTokens]);

  // Load saved tokens on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TOKENS_KEY);
        if (!raw) { setState(s => ({ ...s, loading: false })); return; }
        const tokens: StoredTokens = JSON.parse(raw);
        if (isExpired(tokens.accessToken)) {
          // Try refresh
          const data = await refreshAccessToken(GOTRUE_URL, tokens.refreshToken);
          const newTokens = { accessToken: data.access_token, refreshToken: data.refresh_token };
          await saveTokens(newTokens);
          const user = parseJwt(newTokens.accessToken);
          const accounts = await passkeyClient.listAccounts(newTokens.accessToken);
          setState({ user, accessToken: newTokens.accessToken, loading: false, accounts });
          scheduleRefresh(newTokens.accessToken, newTokens.refreshToken);
        } else {
          const user = parseJwt(tokens.accessToken);
          const accounts = await passkeyClient.listAccounts(tokens.accessToken);
          setState({ user, accessToken: tokens.accessToken, loading: false, accounts });
          scheduleRefresh(tokens.accessToken, tokens.refreshToken);
        }
      } catch {
        await clearStoredTokens();
        setState({ user: null, accessToken: null, loading: false, accounts: [] });
      }
    })();
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  // Exchange tokenHash for JWT via GoTrue magiclink verify
  const exchangeTokenHash = useCallback(async (tokenHash: string): Promise<StoredTokens> => {
    const res = await fetch(`${GOTRUE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    });
    if (!res.ok) throw new Error('Token exchange failed');
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }, []);

  const register = useCallback(async (walletName?: string): Promise<PasskeyAccount[]> => {
    // For registration, we need an existing JWT. On first use, do a passwordless signup first.
    // If no user yet, create an anonymous/passwordless account via passkey login flow.
    // The passkey-auth edge function handles creating a GoTrue user if needed.

    // Step 1: Login with passkey (creates user if needed on server side)
    const loginResult = await passkeyClient.login();
    const tokens = await exchangeTokenHash(loginResult.tokenHash);
    await saveTokens(tokens);

    // Step 2: Register a named passkey for this user
    await passkeyClient.register(tokens.accessToken, walletName);

    // Step 3: Provision Flow accounts
    const accounts = await passkeyClient.listAccounts(tokens.accessToken);
    const user = parseJwt(tokens.accessToken);
    setState({ user, accessToken: tokens.accessToken, loading: false, accounts });
    scheduleRefresh(tokens.accessToken, tokens.refreshToken);
    return accounts;
  }, [passkeyClient, exchangeTokenHash, saveTokens, scheduleRefresh]);

  const login = useCallback(async () => {
    const loginResult = await passkeyClient.login();
    const tokens = await exchangeTokenHash(loginResult.tokenHash);
    await saveTokens(tokens);
    const user = parseJwt(tokens.accessToken);
    const accounts = await passkeyClient.listAccounts(tokens.accessToken);
    setState({ user, accessToken: tokens.accessToken, loading: false, accounts });
    scheduleRefresh(tokens.accessToken, tokens.refreshToken);
  }, [passkeyClient, exchangeTokenHash, saveTokens, scheduleRefresh]);

  const signOut = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    await clearStoredTokens();
    setState({ user: null, accessToken: null, loading: false, accounts: [] });
  }, [clearStoredTokens]);

  const refreshAccounts = useCallback(async (): Promise<PasskeyAccount[]> => {
    if (!state.accessToken) return [];
    const accounts = await passkeyClient.listAccounts(state.accessToken);
    setState(s => ({ ...s, accounts }));
    return accounts;
  }, [state.accessToken, passkeyClient]);

  return (
    <AuthContext.Provider value={{ ...state, register, login, signOut, refreshAccounts }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Create WalletProviderMobile**

Create `wallet-mobile/providers/WalletProviderMobile.tsx`:

```tsx
import React from 'react';
import { WalletProvider } from '@flowindex/wallet-core';
import type { WalletAccount } from '@flowindex/wallet-core';
import { useAuth } from './AuthProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NETWORK_KEY = 'flowindex_network';
const ACTIVE_ACCOUNT_KEY = 'flowindex_active_account';

export function WalletProviderMobile({ children }: { children: React.ReactNode }) {
  const { accounts, refreshAccounts } = useAuth();
  const [initialNetwork, setInitialNetwork] = React.useState<'mainnet' | 'testnet'>('mainnet');
  const [initialActiveId, setInitialActiveId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  // Load persisted preferences
  React.useEffect(() => {
    (async () => {
      const [network, activeId] = await Promise.all([
        AsyncStorage.getItem(NETWORK_KEY),
        AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY),
      ]);
      if (network === 'testnet') setInitialNetwork('testnet');
      if (activeId) setInitialActiveId(activeId);
      setReady(true);
    })();
  }, []);

  const onNetworkChange = React.useCallback(async (n: 'mainnet' | 'testnet') => {
    await AsyncStorage.setItem(NETWORK_KEY, n);
  }, []);

  const onActiveAccountChange = React.useCallback(async (id: string) => {
    await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
  }, []);

  const onRefresh = React.useCallback(async () => {
    return (await refreshAccounts()) as unknown as WalletAccount[];
  }, [refreshAccounts]);

  if (!ready) return null;

  return (
    <WalletProvider
      accounts={accounts as unknown as WalletAccount[]}
      onRefreshAccounts={onRefresh}
      initialNetwork={initialNetwork}
      onNetworkChange={onNetworkChange}
      onActiveAccountChange={onActiveAccountChange}
      initialActiveAccountId={initialActiveId}
    >
      {children}
    </WalletProvider>
  );
}
```

- [ ] **Step 4: Update providers/index.tsx**

Replace `wallet-mobile/providers/index.tsx`:

```tsx
import React, { useEffect } from 'react';
import { configureApiClient } from '@flowindex/wallet-core';
import { AuthProvider } from './AuthProvider';
import { WalletProviderMobile } from './WalletProviderMobile';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://flowindex.io/api';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    configureApiClient({ baseUrl: API_BASE_URL });
  }, []);

  return (
    <AuthProvider>
      <WalletProviderMobile>
        {children}
      </WalletProviderMobile>
    </AuthProvider>
  );
}

export { useAuth } from './AuthProvider';
```

- [ ] **Step 5: Create auth layout**

Create `wallet-mobile/app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }} />
  );
}
```

- [ ] **Step 6: Create login screen**

Create `wallet-mobile/app/(auth)/login.tsx`:

```tsx
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../providers';

export default function LoginScreen() {
  const { register, login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleCreate = async () => {
    setLoading(true);
    setStatus('Creating wallet...');
    try {
      const accounts = await register('FlowIndex Wallet');
      if (accounts.length > 0) {
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', 'No accounts were created. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setStatus('Signing in...');
    try {
      await login();
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: '#00ef8b', fontSize: 32, fontWeight: '800', marginBottom: 8 }}>
          FlowIndex
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 16, marginBottom: 48 }}>
          Non-custodial Flow wallet
        </Text>

        {loading ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color="#00ef8b" />
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{status}</Text>
          </View>
        ) : (
          <View style={{ width: '100%', gap: 16 }}>
            <View
              style={{
                backgroundColor: '#00ef8b',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <Text
                onPress={handleCreate}
                style={{
                  color: '#000',
                  fontSize: 17,
                  fontWeight: '600',
                  textAlign: 'center',
                  paddingVertical: 16,
                }}
              >
                Create Wallet
              </Text>
            </View>

            <View
              style={{
                backgroundColor: '#1a1a1a',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#27272a',
                overflow: 'hidden',
              }}
            >
              <Text
                onPress={handleSignIn}
                style={{
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: '600',
                  textAlign: 'center',
                  paddingVertical: 16,
                }}
              >
                Sign In with Passkey
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 7: Update root layout with auth gate**

Replace `wallet-mobile/app/_layout.tsx`:

```tsx
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppProviders, useAuth } from '../providers';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
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
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0a' },
          }}
        />
      </AuthGate>
    </AppProviders>
  );
}
```

- [ ] **Step 8: Verify Expo starts**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install && cd wallet-mobile && bunx expo start --clear`
Expected: Expo dev server starts. Note: passkey won't work in Expo Go — need EAS Build dev client for real device testing.

- [ ] **Step 9: Commit**

```bash
git add wallet-mobile/ packages/wallet-core/
git commit -m "feat(wallet-mobile): add auth provider + login screen with native passkey

- AuthProvider manages passkey register/login + JWT lifecycle via AsyncStorage
- WalletProviderMobile wraps wallet-core WalletProvider with persistence
- Login screen with Create Wallet and Sign In buttons
- Auth gate redirects unauthenticated users to login"
```

---

## Task 5: Dashboard — Wire to Real Auth

**Files:**
- Modify: `wallet-mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace Dashboard with auth-aware version**

Replace `wallet-mobile/app/(tabs)/index.tsx`:

```tsx
import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useWallet, useBalance } from '@flowindex/wallet-core';
import { Copy, Check, ArrowUpRight, ExternalLink } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

export default function DashboardScreen() {
  const { activeAccount, network } = useWallet();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : undefined;
  const { holdings, totalUsd, loading, error, refetch } = useBalance(displayAddress);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const copyAddress = useCallback(async () => {
    if (!displayAddress) return;
    await Clipboard.setStringAsync(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayAddress]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const explorerBase = network === 'testnet' ? 'https://testnet.flowindex.io' : 'https://flowindex.io';

  if (!activeAccount) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#00ef8b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ef8b" />}
      >
        {/* Header */}
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
          {activeAccount.authenticatorName ?? 'Wallet'}
        </Text>
        <Pressable onPress={copyAddress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 13, fontFamily: 'monospace' }}>
            {displayAddress ? `${displayAddress.slice(0, 8)}...${displayAddress.slice(-4)}` : '—'}
          </Text>
          {copied ? <Check size={14} color="#00ef8b" /> : <Copy size={14} color="#a1a1aa" />}
        </Pressable>

        {/* Total Balance */}
        <Text style={{ color: '#00ef8b', fontSize: 36, fontWeight: '700' }}>
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
              flex: 1, backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <ArrowUpRight size={18} color="#000" />
            <Text style={{ color: '#000', fontSize: 16, fontWeight: '600' }}>Send</Text>
          </Pressable>
          <Pressable
            onPress={copyAddress}
            style={{
              flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderWidth: 1, borderColor: '#27272a',
            }}
          >
            <Copy size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Receive</Text>
          </Pressable>
        </View>

        {/* Holdings */}
        {loading && !refreshing ? (
          <ActivityIndicator color="#00ef8b" style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={{ color: '#ef4444', marginTop: 20 }}>{error}</Text>
        ) : (
          holdings.map((h) => (
            <View
              key={h.identifier}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#27272a',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a',
                  alignItems: 'center', justifyContent: 'center',
                }}>
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
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Install expo-clipboard**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo install expo-clipboard
```

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/
git commit -m "feat(wallet-mobile): wire dashboard to real auth + add send/receive buttons"
```

---

## Task 6: Send FLOW Screen

**Files:**
- Create: `wallet-mobile/app/send/index.tsx`

- [ ] **Step 1: Create send screen**

Create `wallet-mobile/app/send/index.tsx`:

```tsx
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWallet, useBalance } from '@flowindex/wallet-core';
import { createPasskeyAuthz } from '@flowindex/flow-passkey';
import { FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from '@flowindex/wallet-core';
import { ArrowLeft, Fingerprint, Check, ExternalLink } from 'lucide-react-native';
import * as fcl from '@onflow/fcl';

type Step = 'form' | 'review' | 'signing' | 'success' | 'error';

export default function SendScreen() {
  const { activeAccount, network } = useWallet();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : '';
  const { holdings } = useBalance(displayAddress);
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const flowHolding = holdings.find(h => h.symbol === 'FLOW');
  const availableBalance = Math.max((flowHolding?.balance ?? 0) - 0.001, 0);
  const amountNum = parseFloat(amount) || 0;

  const aliases = network === 'testnet' ? TESTNET_ALIASES : MAINNET_ALIASES;
  const accessNode = network === 'testnet'
    ? 'https://rest-testnet.onflow.org'
    : 'https://rest-mainnet.onflow.org';
  const explorerBase = network === 'testnet' ? 'https://testnet.flowindex.io' : 'https://flowindex.io';

  const isValidRecipient = /^0x[0-9a-fA-F]{16}$/.test(recipient);
  const isSelf = recipient.toLowerCase() === displayAddress.toLowerCase();
  const canReview = isValidRecipient && !isSelf && amountNum > 0 && amountNum <= availableBalance;

  const handleSend = async () => {
    if (!activeAccount || !address) return;
    setStep('signing');

    try {
      // Configure FCL
      fcl.config()
        .put('accessNode.api', accessNode)
        .put('flow.network', network);

      // Apply contract aliases
      for (const [name, addr] of Object.entries(aliases)) {
        fcl.config().put(`0x${name}`, addr);
      }

      // Build and send transaction
      const rpId = 'flowindex.io';
      const authz = createPasskeyAuthz({
        address: displayAddress,
        keyIndex: 0,
        credentialId: activeAccount.credentialId,
        rpId,
      });

      const txId = await fcl.mutate({
        cadence: FLOW_TRANSFER_TX,
        args: (arg: any, t: any) => [
          arg(parseFloat(amount).toFixed(8), t.UFix64),
          arg(recipient, t.Address),
        ],
        proposer: authz,
        payer: authz,
        authorizations: [authz],
        limit: 9999,
      });

      setTxHash(txId);
      setStep('success');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStep('error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Pressable onPress={() => step === 'form' ? router.back() : setStep('form')}>
            <ArrowLeft size={24} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Send FLOW</Text>
        </View>

        <View style={{ flex: 1, padding: 16 }}>
          {step === 'form' && (
            <View style={{ gap: 20 }}>
              <View>
                <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 8 }}>Recipient</Text>
                <TextInput
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder="0x..."
                  placeholderTextColor="#52525b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
                    color: '#fff', fontSize: 16, fontFamily: 'monospace',
                    borderWidth: 1, borderColor: '#27272a',
                  }}
                />
                {recipient && !isValidRecipient && (
                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>Invalid Flow address</Text>
                )}
                {isSelf && (
                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>Cannot send to yourself</Text>
                )}
              </View>

              <View>
                <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 8 }}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.0"
                  placeholderTextColor="#52525b"
                  keyboardType="decimal-pad"
                  style={{
                    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
                    color: '#fff', fontSize: 24, fontWeight: '600',
                    borderWidth: 1, borderColor: '#27272a',
                  }}
                />
                <Text style={{ color: '#a1a1aa', fontSize: 12, marginTop: 4 }}>
                  Available: {availableBalance.toFixed(4)} FLOW (0.001 reserved)
                </Text>
              </View>

              <Pressable
                disabled={!canReview}
                onPress={() => setStep('review')}
                style={{
                  backgroundColor: canReview ? '#00ef8b' : '#27272a',
                  borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12,
                }}
              >
                <Text style={{ color: canReview ? '#000' : '#52525b', fontSize: 17, fontWeight: '600' }}>
                  Review
                </Text>
              </Pressable>
            </View>
          )}

          {step === 'review' && (
            <View style={{ gap: 20 }}>
              <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#a1a1aa' }}>From</Text>
                  <Text style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13 }}>
                    {displayAddress.slice(0, 8)}...{displayAddress.slice(-4)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#a1a1aa' }}>To</Text>
                  <Text style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13 }}>
                    {recipient.slice(0, 8)}...{recipient.slice(-4)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#a1a1aa' }}>Amount</Text>
                  <Text style={{ color: '#00ef8b', fontSize: 18, fontWeight: '700' }}>{amount} FLOW</Text>
                </View>
              </View>

              <Pressable
                onPress={handleSend}
                style={{
                  backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 16,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Fingerprint size={20} color="#000" />
                <Text style={{ color: '#000', fontSize: 17, fontWeight: '600' }}>Confirm & Sign</Text>
              </Pressable>
            </View>
          )}

          {step === 'signing' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <ActivityIndicator size="large" color="#00ef8b" />
              <Text style={{ color: '#a1a1aa', fontSize: 16 }}>Signing with passkey...</Text>
            </View>
          )}

          {step === 'success' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32, backgroundColor: '#00ef8b20',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={32} color="#00ef8b" />
              </View>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Sent!</Text>
              <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>
                {amount} FLOW sent to {recipient.slice(0, 8)}...{recipient.slice(-4)}
              </Text>
              <Text style={{ color: '#a1a1aa', fontSize: 12, fontFamily: 'monospace' }}>
                Tx: {txHash.slice(0, 16)}...
              </Text>
              <Pressable onPress={() => { setStep('form'); setRecipient(''); setAmount(''); }}>
                <Text style={{ color: '#00ef8b', fontSize: 16, marginTop: 12 }}>Done</Text>
              </Pressable>
            </View>
          )}

          {step === 'error' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <Text style={{ color: '#ef4444', fontSize: 20, fontWeight: '700' }}>Failed</Text>
              <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>{errorMsg}</Text>
              <Pressable onPress={() => setStep('review')}>
                <Text style={{ color: '#00ef8b', fontSize: 16, marginTop: 12 }}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Install @onflow/fcl**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bun add @onflow/fcl
```

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/
git commit -m "feat(wallet-mobile): add Send FLOW screen with passkey signing"
```

---

## Task 7: Activity Screen

**Files:**
- Replace: `wallet-mobile/app/(tabs)/activity.tsx`

- [ ] **Step 1: Replace activity placeholder**

Replace `wallet-mobile/app/(tabs)/activity.tsx`:

```tsx
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@flowindex/wallet-core';
import { getAccountTransactions, getAccountFtTransfers } from '@flowindex/wallet-core';
import { deriveActivityType, buildSummaryLine, formatRelativeTime } from '@flowindex/wallet-core';
import type { AccountTransaction, FtTransfer } from '@flowindex/wallet-core';
import { ArrowUpRight, ArrowDownLeft, Clock, ExternalLink } from 'lucide-react-native';
import * as Linking from 'expo-linking';

type Tab = 'all' | 'ft';
const PAGE_SIZE = 20;

export default function ActivityScreen() {
  const { activeAccount, network } = useWallet();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : undefined;
  const explorerBase = network === 'testnet' ? 'https://testnet.flowindex.io' : 'https://flowindex.io';

  const [tab, setTab] = useState<Tab>('all');
  const [txs, setTxs] = useState<AccountTransaction[]>([]);
  const [ftTransfers, setFtTransfers] = useState<FtTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchTxs = useCallback(async (offset = 0) => {
    if (!displayAddress) return;
    setLoading(true);
    try {
      const res = await getAccountTransactions(displayAddress, PAGE_SIZE, offset);
      if (offset === 0) setTxs(res.transactions);
      else setTxs(prev => [...prev, ...res.transactions]);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }, [displayAddress]);

  const fetchFt = useCallback(async (offset = 0) => {
    if (!displayAddress) return;
    setLoading(true);
    try {
      const res = await getAccountFtTransfers(displayAddress, PAGE_SIZE, offset);
      if (offset === 0) setFtTransfers(res.transfers);
      else setFtTransfers(prev => [...prev, ...res.transfers]);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }, [displayAddress]);

  useEffect(() => {
    setHasMore(true);
    if (tab === 'all') fetchTxs(0);
    else fetchFt(0);
  }, [tab, displayAddress]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    if (tab === 'all') fetchTxs(txs.length);
    else fetchFt(ftTransfers.length);
  };

  const renderTx = ({ item }: { item: AccountTransaction }) => {
    const activity = deriveActivityType(item);
    const summary = buildSummaryLine(item);
    return (
      <Pressable
        onPress={() => Linking.openURL(`${explorerBase}/tx/${item.txHash}`)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#27272a',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock size={16} color="#a1a1aa" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
              {summary}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 12, marginTop: 2 }}>
              {formatRelativeTime(item.blockTime)}
            </Text>
          </View>
        </View>
        <ExternalLink size={14} color="#52525b" />
      </Pressable>
    );
  };

  const renderFt = ({ item }: { item: FtTransfer }) => {
    const isSend = item.direction === 'out' || item.classifier === 'sender';
    const Icon = isSend ? ArrowUpRight : ArrowDownLeft;
    const color = isSend ? '#ef4444' : '#22c55e';
    const prefix = isSend ? '-' : '+';
    return (
      <Pressable
        onPress={() => Linking.openURL(`${explorerBase}/tx/${item.txHash}`)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#27272a',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={16} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>
              {isSend ? 'Sent' : 'Received'} {item.tokenSymbol ?? ''}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 12, marginTop: 2 }}>
              {formatRelativeTime(item.blockTime)}
            </Text>
          </View>
        </View>
        <Text style={{ color, fontSize: 14, fontWeight: '600' }}>
          {prefix}{parseFloat(item.amount ?? '0').toFixed(4)}
        </Text>
      </Pressable>
    );
  };

  if (!displayAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>No account selected</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', padding: 16, paddingBottom: 8 }}>Activity</Text>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
        {(['all', 'ft'] as Tab[]).map(t => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
              backgroundColor: tab === t ? '#00ef8b20' : '#1a1a1a',
            }}
          >
            <Text style={{ color: tab === t ? '#00ef8b' : '#a1a1aa', fontSize: 14, fontWeight: '500' }}>
              {t === 'all' ? 'All' : 'FT Transfers'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'all' ? (
        <FlashList
          data={txs}
          renderItem={renderTx}
          keyExtractor={item => item.txHash}
          estimatedItemSize={65}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            loading ? <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} /> :
            <Text style={{ color: '#a1a1aa', textAlign: 'center', marginTop: 40 }}>No transactions yet</Text>
          }
        />
      ) : (
        <FlashList
          data={ftTransfers}
          renderItem={renderFt}
          keyExtractor={item => `${item.txHash}-${item.eventIndex}`}
          estimatedItemSize={65}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            loading ? <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} /> :
            <Text style={{ color: '#a1a1aa', textAlign: 'center', marginTop: 40 }}>No transfers yet</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/activity.tsx
git commit -m "feat(wallet-mobile): add Activity screen with transactions + FT transfers"
```

---

## Task 8: NFTs Screen

**Files:**
- Replace: `wallet-mobile/app/(tabs)/nfts.tsx`

- [ ] **Step 1: Replace NFTs placeholder**

Replace `wallet-mobile/app/(tabs)/nfts.tsx`:

```tsx
import { View, Text, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@flowindex/wallet-core';
import { getNftCollections, getNftCollectionItems } from '@flowindex/wallet-core';
import type { NftCollection, NftItem } from '@flowindex/wallet-core';
import { resolveIPFS } from '@flowindex/wallet-core';
import { ChevronRight, ChevronDown, ImageIcon, Layers } from 'lucide-react-native';

export default function NFTsScreen() {
  const { activeAccount, network } = useWallet();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : undefined;

  const [collections, setCollections] = useState<NftCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, NftItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);

  useEffect(() => {
    if (!displayAddress) return;
    setLoading(true);
    getNftCollections(displayAddress)
      .then(setCollections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [displayAddress]);

  const toggleCollection = useCallback(async (nftType: string) => {
    if (expandedType === nftType) {
      setExpandedType(null);
      return;
    }
    setExpandedType(nftType);
    if (!items[nftType] && displayAddress) {
      setLoadingItems(nftType);
      try {
        const result = await getNftCollectionItems(displayAddress, nftType, 50, 0);
        setItems(prev => ({ ...prev, [nftType]: result }));
      } catch { /* ignore */ }
      setLoadingItems(null);
    }
  }, [expandedType, items, displayAddress]);

  if (!displayAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>No account selected</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', padding: 16, paddingBottom: 8 }}>NFTs</Text>

      {loading ? (
        <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />
      ) : collections.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={48} color="#27272a" />
          <Text style={{ color: '#a1a1aa', marginTop: 12, fontSize: 16 }}>No NFTs found</Text>
        </View>
      ) : (
        <FlashList
          data={collections}
          keyExtractor={item => item.nftType}
          estimatedItemSize={60}
          renderItem={({ item: collection }) => (
            <View>
              {/* Collection Row */}
              <Pressable
                onPress={() => toggleCollection(collection.nftType)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#27272a',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Layers size={18} color="#a1a1aa" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                      {collection.collectionName ?? collection.nftType.split('.').pop() ?? 'Collection'}
                    </Text>
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{collection.count} items</Text>
                  </View>
                </View>
                {expandedType === collection.nftType
                  ? <ChevronDown size={20} color="#a1a1aa" />
                  : <ChevronRight size={20} color="#a1a1aa" />}
              </Pressable>

              {/* Expanded Items Grid */}
              {expandedType === collection.nftType && (
                <View style={{ padding: 12, backgroundColor: '#111' }}>
                  {loadingItems === collection.nftType ? (
                    <ActivityIndicator color="#00ef8b" style={{ marginVertical: 20 }} />
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(items[collection.nftType] ?? []).map(nft => {
                        const thumb = nft.thumbnail ? resolveIPFS(nft.thumbnail) : null;
                        return (
                          <View
                            key={nft.tokenId ?? nft.serialNumber ?? Math.random().toString()}
                            style={{
                              width: '48%', backgroundColor: '#1a1a1a', borderRadius: 12,
                              overflow: 'hidden', marginBottom: 4,
                            }}
                          >
                            {thumb ? (
                              <Image
                                source={{ uri: thumb }}
                                style={{ width: '100%', aspectRatio: 1, backgroundColor: '#27272a' }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={{
                                width: '100%', aspectRatio: 1, backgroundColor: '#27272a',
                                alignItems: 'center', justifyContent: 'center',
                              }}>
                                <ImageIcon size={24} color="#52525b" />
                              </View>
                            )}
                            <View style={{ padding: 8 }}>
                              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                                {nft.name ?? `#${nft.tokenId ?? nft.serialNumber ?? '?'}`}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/nfts.tsx
git commit -m "feat(wallet-mobile): add NFTs screen with collections and item grid"
```

---

## Task 9: Settings Screen

**Files:**
- Replace: `wallet-mobile/app/(tabs)/settings.tsx`

- [ ] **Step 1: Replace settings placeholder**

Replace `wallet-mobile/app/(tabs)/settings.tsx`:

```tsx
import { View, Text, Pressable, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { useWallet } from '@flowindex/wallet-core';
import { useAuth } from '../../providers';
import { useState, useCallback } from 'react';
import { Copy, Check, LogOut, Globe, Shield, Fingerprint } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';

export default function SettingsScreen() {
  const { activeAccount, network, switchNetwork, evmAddress } = useWallet();
  const { signOut, accounts } = useAuth();
  const address = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const displayAddress = address ? `0x${address}` : '—';

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = useCallback(async (text: string, field: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const CopyRow = ({ label, value, field }: { label: string; value: string; field: string }) => (
    <Pressable
      onPress={() => copy(value, field)}
      style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#27272a',
      }}
    >
      <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%' }}>
        <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'monospace' }} numberOfLines={1}>
          {value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value}
        </Text>
        {copiedField === field ? <Check size={14} color="#00ef8b" /> : <Copy size={14} color="#52525b" />}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 }}>Settings</Text>

        {/* Account Section */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Shield size={16} color="#a1a1aa" />
            <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
              Account
            </Text>
          </View>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16 }}>
            <CopyRow label="Flow Address" value={displayAddress} field="flow" />
            {evmAddress && <CopyRow label="EVM Address" value={evmAddress} field="evm" />}
            {activeAccount?.publicKeySec1Hex && (
              <CopyRow label="Public Key" value={activeAccount.publicKeySec1Hex} field="pubkey" />
            )}
          </View>
        </View>

        {/* Passkey Section */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Fingerprint size={16} color="#a1a1aa" />
            <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
              Passkey
            </Text>
          </View>
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
              {activeAccount?.authenticatorName ?? 'Passkey'}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} linked
            </Text>
          </View>
        </View>

        {/* Network Section */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Globe size={16} color="#a1a1aa" />
            <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
              Network
            </Text>
          </View>
          <View style={{
            backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <View>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
              </Text>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 2 }}>
                {network === 'mainnet' ? 'Production network' : 'Test network'}
              </Text>
            </View>
            <Switch
              value={network === 'testnet'}
              onValueChange={(v) => switchNetwork(v ? 'testnet' : 'mainnet')}
              trackColor={{ false: '#27272a', true: '#eab30840' }}
              thumbColor={network === 'testnet' ? '#eab308' : '#a1a1aa'}
            />
          </View>
        </View>

        {/* About */}
        <View style={{ marginBottom: 24 }}>
          <View style={{
            backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: 'row', justifyContent: 'space-between',
          }}>
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Version</Text>
            <Text style={{ color: '#fff', fontSize: 14 }}>
              {Constants.expoConfig?.version ?? '0.1.0'}
            </Text>
          </View>
        </View>

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          style={{
            backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderWidth: 1, borderColor: '#ef444430',
          }}
        >
          <LogOut size={18} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Sign Out</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Install expo-constants if not present**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo install expo-constants
```

- [ ] **Step 3: Commit**

```bash
git add wallet-mobile/app/\(tabs\)/settings.tsx
git commit -m "feat(wallet-mobile): add Settings screen with account info, network switch, sign out"
```

---

## Task 10: Integration Build + Verify

- [ ] **Step 1: Install all deps from root**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai && bun install
```

- [ ] **Step 2: Build flow-passkey**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/flow-passkey && bun run build
```
Expected: Clean build.

- [ ] **Step 3: Build auth-core**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/auth-core && bun run build
```
Expected: Clean build.

- [ ] **Step 4: Build wallet-core**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun run build
```
Expected: Clean build.

- [ ] **Step 5: Run wallet-core tests**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/packages/wallet-core && bun vitest run
```
Expected: All tests pass.

- [ ] **Step 6: Verify web wallet still builds**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet && bun run build
```
Expected: Clean build. No regressions from the platform splits or WalletProvider extraction.

- [ ] **Step 7: Verify Expo starts**

```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-ai/wallet-mobile && bunx expo start --clear
```
Expected: Metro bundles without errors. App loads login screen (since no stored tokens).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: verify phase 2 integration — all packages build, tests pass, no web regressions"
```

---

## Summary

After completing all 10 tasks:

1. **flow-passkey** — Platform-split WebAuthn (`webauthn.web.ts` / `webauthn.native.ts`), refactored signer, cross-platform SHA-256
2. **auth-core** — Platform-split token storage (`storage.web.ts` / `storage.native.ts`)
3. **wallet-core** — Shared WalletProvider, Cadence scripts, context-based useWallet hook
4. **wallet-mobile** — AuthProvider + login screen, Dashboard with real auth, Send FLOW, Activity, NFTs, Settings

**Before real-device testing:** Deploy `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` to `flowindex.io` (Task 1 in spec — not in this plan as it's infrastructure, not code).

**Next plan:** Phase 3 (Connectivity) — WalletConnect, FCL deep links, seed phrase import, EVM transactions, web wallet migration.

# Wallet Mobile Phase 2: Core Features — Design Spec

## Summary

Add native passkey authentication, transaction sending, and four content screens to the wallet-mobile Expo app. After Phase 2, the mobile wallet is a fully functional non-custodial Flow wallet that shares passkey accounts with the existing web wallet via iCloud Keychain / Google Password Manager sync.

## Goals

1. Native passkey registration and login on iOS + Android, sharing `rpId: flowindex.io` with the web wallet
2. Replace hardcoded demo address with real auth — all screens use the authenticated user's Flow address
3. Send FLOW tokens (passkey-signed Cadence transactions)
4. Activity page (transaction history + FT transfers with pagination)
5. NFTs page (collections + items with lazy loading)
6. Settings page (passkey info, network switch, logout)
7. Display derived EVM smart wallet address (read-only, no EVM transactions)

## Non-Goals

- Seed phrase / private key import (Phase 3+)
- WalletConnect / FCL deep links (Phase 3)
- Web wallet migration from flow-ui to wallet-ui (Phase 3)
- EVM transaction sending (Phase 3)
- Push notifications, QR scanning (Phase 3)
- Multi-token transfers (only FLOW in Phase 2)
- Passkey add/remove from Settings (Phase 3)

---

## Architecture

### Passkey Native Adaptation

The existing `packages/flow-passkey/` package is mostly pure TypeScript. Only two call sites touch `navigator.credentials`:

1. `webauthn.ts` — `createPasskeyCredential()` and `getPasskeyAssertion()`
2. `signer.ts` — `signFlowTransaction()` directly calls `navigator.credentials.get()`

**Strategy:** Platform-split `webauthn.ts` and refactor `signer.ts` to go through the abstraction.

#### File Changes in `packages/flow-passkey/src/`

| File | Change |
|------|--------|
| `webauthn.ts` | Rename to `webauthn.web.ts` (content unchanged) |
| `webauthn.native.ts` | New — implements same exports using `react-native-passkeys` |
| `signer.ts` | Refactor — replace inline `navigator.credentials.get()` with call to `getPasskeyAssertion()` from `./webauthn` |
| `encode.ts` | Replace `crypto.subtle.digest('SHA-256', ...)` with `@noble/hashes/sha2` (works on both platforms) |
| `types.ts` | No change (pure types) |
| `utils.ts` | No change (pure byte/hex conversion) |
| `index.ts` | No change |

Metro resolves `.native.ts` on React Native, Vite resolves `.web.ts` on web. The consuming code (`signer.ts`, `wallet-mobile`, `wallet/`) imports from `./webauthn` without platform suffix.

#### `webauthn.native.ts` Implementation

Uses `react-native-passkeys` to call iOS `AuthenticationServices` / Android `CredentialManager`. Returns the same `PasskeyCredentialResult` and `PasskeyAssertionResult` types as the web version. The native library returns base64url-encoded fields which are converted to `Uint8Array` to match the existing type contract.

#### `signer.ts` Refactor

Current `signFlowTransaction()` inlines a `navigator.credentials.get()` call. Refactor to:

```typescript
import { getPasskeyAssertion } from './webauthn';

export async function signFlowTransaction(options: SignTransactionOptions): Promise<PasskeySignResult> {
  const messageBytes = hexToBytes(options.messageHex);
  const hash = sha256(messageBytes);

  const assertion = await getPasskeyAssertion({
    rpId: options.rpId,
    challenge: hash,
    allowCredentials: [{ id: options.credentialId, type: 'public-key' }],
  });

  const rawSig = derToP256Raw(assertion.signature);
  const extensionData = buildExtensionData(assertion.authenticatorData, assertion.clientDataJSON);

  return {
    signature: bytesToHex(rawSig),
    extensionData,
  };
}
```

All downstream logic (DER→P256, FLIP-264 extensionData, RLP encoding) remains unchanged — pure TypeScript.

#### `encode.ts` SHA-256 Change

Replace:
```typescript
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}
```

With:
```typescript
import { sha256 as _sha256 } from '@noble/hashes/sha2';

export function sha256(bytes: Uint8Array): Uint8Array {
  return _sha256(bytes);
}
```

This also simplifies the API from async to sync. Callers in `signer.ts` that `await sha256()` still work (awaiting a non-promise returns the value).

---

### Associated Domain Configuration

For native passkeys to use `rpId: flowindex.io`, the domain must declare trust for the mobile apps.

**iOS** — Deploy to `https://flowindex.io/.well-known/apple-app-site-association`:
```json
{
  "webcredentials": {
    "apps": ["<TeamID>.io.flowindex.wallet"]
  }
}
```

**Android** — Deploy to `https://flowindex.io/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.flowindex.wallet",
    "sha256_cert_fingerprints": ["<signing-cert-sha256>"]
  }
}]
```

The signing cert fingerprint comes from EAS Build credentials. These files are served by the existing Caddy config on the frontend VM.

---

### Auth Flow

Mobile uses passkey as the sole authentication method. No OAuth/magiclink.

#### Registration (New User)

1. User taps "Create Wallet" on login screen
2. `createPasskeyCredential()` fires → system passkey UI (Face ID / fingerprint)
3. Credential created → POST attestation to `passkey-auth/register/finish`
4. Server validates, returns public key (SEC1 hex)
5. Call account creation API (Lilico/FlowIndex) with public key → get Flow address
6. Store account data in AsyncStorage
7. Navigate to Dashboard

#### Login (Returning / Cross-Device Sync)

1. User taps "Sign In" on login screen
2. `getPasskeyAssertion()` fires → system passkey UI (may show synced passkeys from iCloud/Google)
3. Assertion verified → POST to `passkey-auth/login/finish` → get `tokenHash`
4. Exchange `tokenHash` via GoTrue `/verify` → JWT tokens
5. Fetch associated accounts from backend
6. Store tokens + accounts in AsyncStorage
7. Navigate to Dashboard

#### Token Storage

`auth-core` currently uses `localStorage`. Add platform split:

| File | Platform | Storage |
|------|----------|---------|
| `token-storage.web.ts` | Web | localStorage (existing behavior) |
| `token-storage.native.ts` | React Native | AsyncStorage |

Both export the same interface: `getTokens()`, `setTokens()`, `clearTokens()`.

---

### Provider Architecture

```
wallet-mobile/providers/index.tsx

<AuthProvider>              ← JWT token management + passkey state
  <WalletProvider>          ← accounts, activeAccount, network, evmAddress
    <QueryProvider>         ← API client config
      <Stack />             ← Expo Router
    </QueryProvider>
  </WalletProvider>
</AuthProvider>
```

#### AuthProvider (Mobile-specific)

Simplified version of `auth-ui`'s AuthProvider. No OAuth flows, no redirect handling. Only:
- Load JWT from AsyncStorage on mount
- Auto-refresh before expiry
- Expose `passkey.register()`, `passkey.login()`, `passkey.sign()`
- Expose `signOut()` (clear tokens + navigate to login)

Lives in `wallet-mobile/providers/AuthProvider.tsx` — not in a shared package, because the web version has OAuth/magiclink concerns that mobile doesn't need.

#### WalletProvider (Shared)

Extract from `wallet/src/providers/WalletProvider.tsx` into `wallet-core/src/providers/WalletProvider.tsx`. In Phase 2, only mobile consumes the shared provider. The web wallet continues using its existing `WalletProvider` unchanged — migrating the web wallet to the shared provider happens in a later phase to avoid regressions.

Provides:
- `activeAccount: PasskeyAccount | null`
- `accounts: PasskeyAccount[]`
- `network: 'mainnet' | 'testnet'`
- `evmAddress: string | null`
- `switchAccount(credentialId)`
- `switchNetwork(network)`
- `refreshAccounts()`

The existing `wallet-core` zustand stores (`wallet-store.ts`, `settings-store.ts`) become the backing state for this provider. The hooks `useWalletFromStore` and `useNetworkFromStore` are replaced by a simpler `useWallet()` context hook.

---

### Screen Implementations

#### Login Screen (`app/(auth)/login.tsx`)

Two buttons: "Create Wallet" and "Sign In". No other auth options.
- Create → `passkey.register()` → provision account → Dashboard
- Sign In → `passkey.login()` → fetch accounts → Dashboard
- Loading states during passkey ceremony and account provisioning
- Error handling with retry

#### Dashboard (Modify `app/(tabs)/index.tsx`)

Replace hardcoded `DEMO_ADDRESS` with `activeAccount.flowAddress` from WalletProvider. Add:
- AccountSwitcher at top (if multiple accounts)
- EVM address display (derived via `getSmartWalletAddress()` from `evm-wallet` package)
- Send / Receive action buttons
- Pull-to-refresh via `refetch()`

#### Send (`app/send/index.tsx`)

Multi-step flow matching web wallet:

| Step | UI | Logic |
|------|-----|-------|
| 1. Form | Recipient input + amount input + token selector (FLOW only) | Validate address format, check balance |
| 2. Review | Summary card with from/to/amount/fee | Confirm before signing |
| 3. Signing | Loading spinner | `fcl.mutate()` + `createPasskeyAuthz()` → native passkey prompt |
| 4. Result | Success (tx hash + explorer link) or Error (message + retry) | — |

**FCL dependency:** `@onflow/fcl` is used for transaction submission. If FCL doesn't work in RN (HTTP/protobuf issues), fallback to Flow REST API: sign the transaction envelope locally, POST to `https://rest-mainnet.onflow.org/v1/transactions`.

**Cadence script:** Reuse `FLOW_TRANSFER_TX` from `wallet/src/cadence/scripts.ts`. Move to `wallet-core/src/cadence/scripts.ts` for sharing.

#### Activity (`app/(tabs)/activity.tsx`)

- Two tabs: "All Transactions" / "FT Transfers" (matching web wallet)
- FlashList with `onEndReached` for infinite scroll pagination
- Each row: icon (from `deriveActivityType()`), summary (from `buildSummaryLine()`), relative time, explorer link
- FT transfers show direction (Sent/Received), amount, counterparty address
- Pull-to-refresh

#### NFTs (`app/(tabs)/nfts.tsx`)

- Collection list (FlashList)
- Tap collection → expand inline to show items (lazy-loaded via `getNftCollectionItems()`)
- Item cards: thumbnail (with IPFS resolution), name, serial number
- Tap item → bottom sheet modal with full metadata
- FlashList with `numColumns={2}` for grid layout

#### Settings (`app/(tabs)/settings.tsx`)

| Section | Content |
|---------|---------|
| Account | Flow address (with copy), EVM address (with copy), public key |
| Passkey | Credential name, creation date (read-only display, no add/remove in Phase 2) |
| Network | Mainnet ↔ Testnet toggle switch |
| About | App version |
| Actions | Sign Out button → clear tokens, navigate to login |

---

### New Dependencies

| Package | Purpose | Risk |
|---------|---------|------|
| `react-native-passkeys` | Native passkey API (iOS/Android) | Requires EAS Build custom dev client; no Expo Go |
| `@noble/hashes` | SHA-256 in flow-passkey (replace Web Crypto) | Already in wallet-core deps, zero risk |
| `@onflow/fcl` | Transaction submission + signing | RN compatibility unverified; fallback to REST API |

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `react-native-passkeys` + Expo compatibility | High — auth blocked | First task: install, build with EAS, test on real device |
| FCL in React Native | High — Send flow blocked | Fallback: use Flow REST API for tx submission |
| Associated domain setup | High — passkey won't work without it | Deploy `.well-known` files before testing passkey |
| `crypto.subtle` not available in RN | Low — only sha256 in encode.ts | Replace with `@noble/hashes` (one-line change) |
| rpId cross-platform sync | Medium — affects web↔mobile sharing | Test early with real devices on both platforms |

---

## Implementation Order

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Associated domain config (`.well-known` files on flowindex.io) | None — deploy first |
| 2 | flow-passkey native adaptation (webauthn split + signer refactor + sha256) | None |
| 3 | Verify passkey on real device (EAS Build + test create/assert) | Tasks 1, 2 |
| 4 | Auth provider + token storage for mobile | Task 2 |
| 5 | WalletProvider extraction to wallet-core | None (can parallel with 2-3) |
| 6 | Login screen (register + sign in) | Tasks 3, 4, 5 |
| 7 | Dashboard improvements (real auth, account switcher, EVM address) | Task 6 |
| 8 | Send FLOW (Cadence script + passkey signing) | Task 6 |
| 9 | Activity page | Task 6 |
| 10 | NFTs page | Task 6 |
| 11 | Settings page | Task 6 |
| 12 | Integration testing on real devices | All above |

Tasks 2 and 5 can run in parallel. Tasks 8-11 can run in parallel after Task 6 completes.

---

## Testing Strategy

### Passkey (Critical Path)
- Real device testing mandatory (passkeys don't work in simulators)
- Test registration → login → transaction signing end-to-end
- Test cross-device sync: create on web → login on mobile (and vice versa)
- Test with both iOS (Face ID) and Android (fingerprint)

### Screens
- Component tests for wallet-ui components (vitest + react-native-testing-library)
- Manual testing of all flows on both platforms

### Transaction Signing
- Test FLOW transfer on testnet first
- Verify transaction appears on FlowIndex explorer
- Test insufficient balance / invalid recipient error handling

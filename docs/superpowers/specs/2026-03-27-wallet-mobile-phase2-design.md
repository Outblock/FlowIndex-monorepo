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

Metro resolves `.native.ts` on React Native, Vite resolves `.web.ts` on web. The consuming code imports from `./webauthn` without platform suffix.

#### SHA-256 Change

Replace `crypto.subtle.digest` in `encode.ts` with synchronous `@noble/hashes/sha2`. This also simplifies the API from async to sync.

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

---

### Auth Flow

Mobile uses passkey as the sole authentication method. No OAuth/magiclink.

#### Registration (New User)

1. User taps "Create Wallet" on login screen
2. `createPasskeyCredential()` fires → system passkey UI (Face ID / fingerprint)
3. Credential created → POST attestation to `passkey-auth/register/finish`
4. Server validates, returns public key (SEC1 hex)
5. Fetch associated accounts from backend
6. Store tokens + accounts in AsyncStorage
7. Navigate to Dashboard

#### Login (Returning / Cross-Device Sync)

1. User taps "Sign In" on login screen
2. `getPasskeyAssertion()` fires → system passkey UI (may show synced passkeys)
3. Assertion verified → POST to `passkey-auth/login/finish` → get `tokenHash`
4. Exchange `tokenHash` via GoTrue `/verify` → JWT tokens
5. Fetch associated accounts from backend
6. Store tokens + accounts in AsyncStorage
7. Navigate to Dashboard

#### Token Storage

`auth-core` currently uses `localStorage`. Add platform split:

| File | Platform | Storage |
|------|----------|---------|
| `storage.web.ts` | Web | localStorage + cookie (existing behavior) |
| `storage.native.ts` | React Native | AsyncStorage |

---

### Provider Architecture

```
<AuthProvider>              ← JWT token management + passkey register/login
  <WalletProvider>          ← accounts, activeAccount, network, evmAddress
    <Stack />               ← Expo Router
  </WalletProvider>
</AuthProvider>
```

#### AuthProvider (Mobile-specific)

Simplified version of `auth-ui`'s AuthProvider. No OAuth flows, no redirect handling. Only:
- Load JWT from AsyncStorage on mount
- Auto-refresh before expiry
- Expose `register()`, `login()`, `signOut()`

Lives in `wallet-mobile/providers/AuthProvider.tsx`.

#### WalletProvider (Shared)

Extract from `wallet/src/providers/WalletProvider.tsx` into `wallet-core/src/providers/WalletProvider.tsx`. In Phase 2, only mobile consumes the shared provider. The web wallet continues using its existing `WalletProvider` unchanged — migrating the web wallet to the shared provider happens in a later phase to avoid regressions.

---

### Screen Implementations

#### Dashboard (Modify existing)
- Replace hardcoded demo address with `activeAccount.flowAddress`
- Add Send / Receive action buttons
- Add EVM address display
- Pull-to-refresh

#### Send FLOW (New)
Multi-step flow: Form → Review → Signing (passkey prompt) → Success/Error.
Uses FCL + `createPasskeyAuthz()`. Only FLOW transfers in Phase 2.

#### Activity (New)
- Two tabs: All Transactions / FT Transfers
- FlashList with infinite scroll pagination
- Transaction summary via `deriveActivityType()` + `buildSummaryLine()`

#### NFTs (New)
- Collection list with expandable items
- Lazy-loaded items per collection
- Grid layout with FlashList
- IPFS image resolution

#### Settings (New)
- Account info (Flow + EVM addresses, public key)
- Passkey info (read-only)
- Network switch (mainnet ↔ testnet)
- Sign out

---

### New Dependencies

| Package | Purpose | Risk |
|---------|---------|------|
| `react-native-passkeys` | Native passkey API | Requires EAS Build custom dev client |
| `@noble/hashes` | SHA-256 in flow-passkey | Already in wallet-core deps, zero risk |
| `@onflow/fcl` | Transaction submission | RN compatibility unverified; fallback to REST API |

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `react-native-passkeys` + Expo | High | First task: install, build with EAS, test on device |
| FCL in React Native | High | Fallback: use Flow REST API for tx submission |
| Associated domain setup | High | Deploy `.well-known` files before testing |
| `crypto.subtle` in RN | Low | Replace with `@noble/hashes` |
| rpId cross-platform sync | Medium | Test early with real devices |

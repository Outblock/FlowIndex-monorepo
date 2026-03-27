# Wallet Mobile Phase 3: dApp Interaction — Design Spec

## Summary

Add FCL deep link handling and WalletConnect v2 support to wallet-mobile, enabling the mobile wallet to authenticate, sign transactions, and sign messages for both Flow Cadence dApps (via FCL universal links) and Flow EVM dApps (via WalletConnect). A shared approval UI handles signing requests from both channels.

## Goals

1. FCL authn/authz/sign via universal links — Cadence dApps can use the mobile wallet from any browser
2. WalletConnect v2 as Web3Wallet — EVM dApps (wagmi/viem) can connect and send signing requests
3. Shared approval UI for transaction and message signing across both protocols
4. QR code scanner for WalletConnect pairing
5. Sessions management screen (view/disconnect active WC sessions)
6. Extract EVM smart wallet signing from dev-wallet into reusable `evm-wallet` package

## Non-Goals

- In-app dApp browser (WebView + JS bridge, like FRW) — Phase 4
- FCL Wallet Discovery Service registration — Phase 4
- Cadence script security audit / risk scoring — Phase 4
- EVM calldata decode (function name + parameter display) — Phase 4
- Seed phrase / private key import — separate phase
- Web wallet migration to wallet-ui — separate phase

---

## Architecture

```
dApp (Flow Cadence)                    dApp (Flow EVM / wagmi)
       │                                       │
  fcl.authenticate()                    WalletConnect v2
       │                                       │
  Universal Link                        WC Relay Server
  wallet.flowindex.io/fcl/*                     │
       │                                       │
       ▼                                       ▼
┌─────────────────────────────────────────────────┐
│              wallet-mobile                       │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ FCL Handler  │    │ WalletConnect Handler │  │
│  │ (deep link   │    │ (@walletconnect/      │  │
│  │  routes)     │    │  web3wallet)           │  │
│  └──────┬───────┘    └──────────┬────────────┘  │
│         │                       │                │
│         ▼                       ▼                │
│  ┌─────────────────────────────────────────┐    │
│  │    Pending Request Store (zustand)      │    │
│  └──────────────────┬──────────────────────┘    │
│                     │                            │
│                     ▼                            │
│  ┌─────────────────────────────────────────┐    │
│  │        Approval UI Layer                │    │
│  │  approve/[id].tsx  +  sign/[id].tsx     │    │
│  └──────────────────┬──────────────────────┘    │
│                     │                            │
│                     ▼                            │
│         flow-passkey (Cadence signing)           │
│         evm-wallet (EVM smart wallet signing)    │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

**Universal links over custom URL schemes.** Universal links (`wallet.flowindex.io/fcl/*`) are more reliable than `flowindex-wallet://` custom schemes — they work even if the app isn't installed (falls back to web), and Apple/Google verify domain ownership.

**No in-app WebView browser.** Unlike FRW which embeds dApps in a WebView and intercepts FCL messages via JS bridge, we use deep links from external browsers. This is simpler, avoids WebView security concerns, and lets users use their preferred browser. In-app browser is Phase 4.

**WalletConnect via JS SDK, not native.** FRW uses native Swift ReownWalletKit / Kotlin WalletConnect SDK. We use `@walletconnect/web3wallet` + `@walletconnect/react-native-compat` (pure JS). This works in Expo managed workflow without ejecting.

**Shared approval UI.** Both FCL and WC requests route through the same `approve/[id].tsx` and `sign/[id].tsx` screens. A `PendingRequest` store normalizes requests from both sources into a common format.

---

## Deep Link Infrastructure

### Domain

**`wallet.flowindex.io`** — dedicated subdomain for mobile wallet universal links. Separate from `flowindex.io` (which has webcredentials for passkey) to avoid iOS "Open in App" prompts on the main site.

### Associated Domains

`app.config.ts` adds applinks:
```typescript
associatedDomains: [
  'webcredentials:flowindex.io',      // existing — passkey
  'applinks:wallet.flowindex.io',     // new — universal links
]
```

**iOS** — `wallet.flowindex.io/.well-known/apple-app-site-association`:
```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "444MY26W7F.io.flowindex.wallet",
      "paths": ["/fcl/*", "/wc"]
    }]
  }
}
```

**Android** — `wallet.flowindex.io/.well-known/assetlinks.json`:
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

### URL Scheme

| URL | Purpose |
|-----|---------|
| `wallet.flowindex.io/fcl/authn?callback=<url>&nonce=<hex>` | FCL authentication |
| `wallet.flowindex.io/fcl/authz?callback=<url>&signable=<base64url>` | FCL transaction authorization |
| `wallet.flowindex.io/fcl/sign?callback=<url>&message=<hex>` | FCL message signing |
| `wallet.flowindex.io/wc?uri=<wc_uri>` | WalletConnect pairing |

### Expo Router Linking

Expo Router handles universal links automatically via file-based routing. The `app/fcl/` and `app/wc/` directories map directly to the URL paths.

---

## FCL Deep Link Handler

### How FCL dApps Interact

1. dApp calls `fcl.authenticate()` with wallet discovery pointing to `wallet.flowindex.io/fcl/authn`
2. Browser opens the universal link → iOS/Android intercepts → opens wallet-mobile
3. Expo Router routes to `app/fcl/authn.tsx`
4. User approves → wallet builds FCL response → redirects back to callback URL

### Three FCL Operations

#### authn (Authentication)

**Input:** `?callback=<url>&nonce=<hex>&appName=<name>&appIcon=<url>`

**Approval screen:** "Connect to {appName}?" showing dApp name + domain.

**Response:** Build `FclAuthnResponse` containing:
- Flow address (`0x...`)
- Services array: authn service (self-identification), authz service (deep link to `/fcl/authz`), user-signature service (deep link to `/fcl/sign`)

**Return:** Redirect to `callback?response=<base64url_encoded_json>`

The `FclAuthnResponse` builder is extracted from web wallet's `fcl/services.ts` into `wallet-core` for sharing.

#### authz (Transaction Authorization)

**Input:** `?callback=<url>&signable=<base64url_encoded_signable>`

**Approval screen:** Transaction details — Cadence script preview, arguments, proposer/payer/authorizers.

**Signing:** Decode signable → `encodeMessageFromSignable()` → `signFlowTransaction()` via passkey.

**Return:** Redirect to `callback?signature=<hex>&extensionData=<hex>&address=<hex>&keyId=<n>`

#### sign (Message Signing)

**Input:** `?callback=<url>&message=<hex>`

**Approval screen:** Message content (decoded to UTF-8 if printable, raw hex otherwise).

**Signing:** Prepend domain tag `FLOW-V0.0-user` → SHA-256 → passkey assertion → DER→P256 → extensionData.

**Return:** Redirect to `callback?signature=<hex>&extensionData=<hex>&address=<hex>&keyId=<n>`

### Route Files

```
wallet-mobile/app/fcl/
├── _layout.tsx        ← Modal presentation (slide up)
├── authn.tsx          ← Authentication approval
├── authz.tsx          ← Transaction approval
└── sign.tsx           ← Message signing approval
```

---

## WalletConnect Handler

### Library

`@walletconnect/web3wallet` + `@walletconnect/react-native-compat` — official WC v2 SDK with React Native compatibility layer. Pure JS, works in Expo managed workflow.

**Project ID:** `39d7c0c723726953bc312950113463b4` (existing, from web wallet).

### Initialization

A `WalletConnectProvider` wraps the app and manages the Web3Wallet lifecycle:

```typescript
const web3wallet = await Web3Wallet.init({
  core: new Core({ projectId: WC_PROJECT_ID }),
  metadata: {
    name: 'FlowIndex Wallet',
    description: 'Non-custodial Flow wallet',
    url: 'https://wallet.flowindex.io',
    icons: ['https://flowindex.io/logo.png'],
    redirect: { native: 'flowindex-wallet://', universal: 'https://wallet.flowindex.io' },
  },
});
```

### Flow

**1. Pairing**
- User scans QR code (expo-camera) or taps deep link `wallet.flowindex.io/wc?uri=wc:xxx`
- Call `web3wallet.pair({ uri })` → establishes encrypted channel via relay

**2. Session Proposal** (`session_proposal` event)
- Show approval screen: dApp name/icon, requested chains + methods
- Approve → `web3wallet.approveSession({ id, namespaces })` with Flow EVM accounts
- Reject → `web3wallet.rejectSession({ id, reason })`

**Supported namespaces:**
```typescript
{
  eip155: {
    chains: ['eip155:747', 'eip155:545'],  // Flow EVM mainnet + testnet
    methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
    events: ['chainChanged', 'accountsChanged'],
    accounts: [`eip155:747:${evmAddress}`, `eip155:545:${evmAddress}`],
  }
}
```

**3. Session Request** (`session_request` event)
- Dispatch based on method:
  - `eth_sendTransaction` → approve/[id].tsx (show tx details)
  - `personal_sign` → sign/[id].tsx (show message)
  - `eth_signTypedData_v4` → sign/[id].tsx (show typed data)
- User approves → sign with passkey via evm-wallet → `web3wallet.respondSessionRequest()`
- User rejects → `web3wallet.respondSessionRequest()` with error

### EVM Signing Path

For `eth_sendTransaction`, the wallet constructs a UserOperation:
1. Build UserOp from tx params (to, value, data) using CoinbaseSmartWallet factory
2. Get paymaster sponsorship (if available)
3. Sign UserOp hash with passkey (WebAuthn assertion → ERC-1271 signature format)
4. Submit via bundler RPC (`https://bundler.flowindex.io/{chainId}/rpc`)
5. Return tx hash

For `personal_sign` and `eth_signTypedData_v4`:
1. Sign with passkey (WebAuthn assertion)
2. Format as ERC-1271 compatible signature for smart wallet verification
3. Return signature

These functions are extracted from `~/outblock/passkey/utils/smartWallet.ts` into `packages/evm-wallet/src/`.

### Route Files

```
wallet-mobile/app/wc/
├── index.tsx          ← Pairing handler (receives URI from deep link)
├── scan.tsx           ← QR code scanner (expo-camera)
```

---

## Shared Approval UI

### Pending Request Store

A zustand store normalizes requests from both FCL and WalletConnect:

```typescript
interface PendingRequest {
  id: string;
  type: 'fcl_authn' | 'fcl_authz' | 'fcl_sign' | 'wc_session' | 'wc_request';
  dapp: { name: string; url: string; icon?: string };
  payload: any;
  callback: string;       // redirect URL (FCL) or WC topic (WC)
  chainType: 'cadence' | 'evm';
  method?: string;        // WC method (eth_sendTransaction, etc.)
  createdAt: number;
}
```

FCL handler and WC handler both write to this store, then navigate to the approval route. On approve/reject, the handler reads from the store and sends the response via the appropriate channel (redirect for FCL, WC relay for WalletConnect).

### Approval Routes

```
wallet-mobile/app/
├── approve/[id].tsx     ← Transaction approval (FCL authz + WC eth_sendTransaction)
├── sign/[id].tsx        ← Message signing (FCL sign + WC personal_sign/signTypedData)
```

**approve/[id].tsx shows:**
- dApp info bar (icon, name, URL)
- Chain badge (Flow Cadence / Flow EVM)
- Transaction details:
  - Cadence: script preview (collapsible), arguments
  - EVM: to address, value, data (raw hex)
- Approve button (green, with Fingerprint icon — triggers passkey)
- Reject button (outlined)
- Signing loading state

**sign/[id].tsx shows:**
- dApp info bar
- Message content:
  - Raw hex for non-printable
  - UTF-8 decoded for printable messages
  - Structured display for EIP-712 typed data
- Approve / Reject buttons

### Connect Screen

A new tab or section in Settings for managing WC sessions:

```
wallet-mobile/app/(tabs)/connect.tsx   ← new 5th tab (replaces placeholder)
```

Shows:
- Active WC sessions list (dApp name, icon, connected chain, connected since)
- Tap session → disconnect option
- "Scan QR" button → navigates to `wc/scan.tsx`
- "Paste Link" option for manual WC URI input

---

## EVM Signing Extraction

### Current State

`~/outblock/passkey/utils/smartWallet.ts` has ~800 lines of ERC-4337 logic inline in the dev-wallet. Key functions to extract into `packages/evm-wallet/src/`:

| Function | Purpose |
|----------|---------|
| `sendTransactionWithPasskey()` | Build UserOp → sign with passkey → submit to bundler |
| `signMessageWithPasskey()` | ERC-1271 message signing via passkey |
| `signTypedDataWithPasskey()` | EIP-712 signing via passkey |
| `getSmartWalletAddress()` | Already in evm-wallet — no change |
| `isSmartWalletDeployed()` | Check if smart wallet is deployed |
| `deploySmartWallet()` | Deploy via factory on first use |

These functions take a `credentialId` + `rpId` and use `flow-passkey`'s `getPasskeyAssertion()` internally for signing — which already works on native thanks to Phase 2's platform split.

### New File

```
packages/evm-wallet/src/
├── smart-wallet-signing.ts    ← extracted functions
├── index.ts                   ← update exports
```

---

## New Dependencies

| Package | Purpose | Risk |
|---------|---------|------|
| `@walletconnect/web3wallet` | WC v2 wallet SDK | Established library, tested in RN |
| `@walletconnect/react-native-compat` | RN polyfills for WC | Official WC package |
| `@walletconnect/core` | WC core (peer dep) | Required by web3wallet |

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| WalletConnect SDK bundle size in RN | Medium — large dependency tree | Tree-shake, lazy import on first WC use |
| Universal links not triggering on iOS | High — FCL flow broken | Test on real device early; fallback to custom scheme |
| FCL callback format mismatch | Medium — dApp can't parse response | Test with reference FCL dApp; follow FCL spec exactly |
| Smart wallet not deployed on first WC request | Medium — tx fails | Auto-deploy on first `eth_sendTransaction` (same as dev-wallet) |
| WC relay latency | Low — affects UX | Show loading states during pairing/request |

---

## Implementation Order

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Deep link infra — associated domains for `wallet.flowindex.io`, Expo linking config | None (infra) |
| 2 | Pending request store (zustand) | None |
| 3 | Approval UI — approve/[id].tsx + sign/[id].tsx | Task 2 |
| 4 | FCL response builder — extract from web wallet's fcl/services.ts to wallet-core | None |
| 5 | FCL deep link routes — authn, authz, sign | Tasks 1, 2, 3, 4 |
| 6 | EVM signing extraction — smartWallet.ts → evm-wallet package | None (can parallel) |
| 7 | WalletConnect provider — Web3Wallet init, session management | Task 6 |
| 8 | WC pairing route + QR scanner | Task 7 |
| 9 | WC session request handling → approval UI | Tasks 3, 6, 7 |
| 10 | Connect screen (sessions list + disconnect) | Task 7 |
| 11 | Integration testing | All above |

Tasks 1, 2, 4, 6 can run in parallel. Tasks 3 depends on 2. Tasks 5 depends on 1+2+3+4. Tasks 7-10 depend on 6.

---

## Testing Strategy

### FCL Deep Links
- Test with a reference FCL dApp (e.g., flow-playground or a custom test page)
- Verify authn → connect → authz → sign full flow
- Test on both iOS and Android real devices (universal links don't work in simulator)
- Test callback redirect back to browser

### WalletConnect
- Test with a wagmi-based dApp on Flow EVM testnet
- Verify: pair → approve session → send transaction → sign message
- Test session persistence across app restarts
- Test disconnect from both sides (wallet and dApp)

### EVM Signing
- Test UserOp construction + bundler submission on testnet
- Test ERC-1271 signature verification on-chain
- Test auto-deploy of smart wallet on first use

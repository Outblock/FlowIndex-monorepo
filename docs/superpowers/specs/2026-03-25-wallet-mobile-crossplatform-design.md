# FlowIndex Wallet — Mobile + Cross-Platform Design

## Summary

Add a mobile app (iOS + Android) to the FlowIndex Wallet with full feature parity to the existing web wallet. Build a new cross-platform UI component library (`wallet-ui`) shared between web and mobile. Use Expo managed workflow with custom dev client for mobile. Keep everything in the existing monorepo.

## Goals

1. Ship iOS + Android wallet app with the same feature set as `wallet/` web
2. Maximize code reuse across web and mobile — shared business logic, shared UI where practical
3. Replace `flow-ui` dependency in wallet with a new `wallet-ui` package designed for cross-platform from day one
4. Maintain the existing web wallet throughout — no regressions

## Non-Goals

- Replacing the FlowIndex `frontend/` main site UI
- Supporting tablets or desktop native apps (first pass)
- Multi-chain beyond Flow Cadence + Flow EVM

---

## Architecture

### Monorepo Structure

```
flowscan-ai/
├── packages/
│   ├── auth-core/          # JWT, passkey client, token refresh (existing)
│   ├── auth-ui/            # AuthProvider, useAuth, LoginModal (existing)
│   ├── evm-wallet/         # EVM signing, address derivation (existing)
│   ├── flow-passkey/       # WebAuthn + FLIP-264 (existing)
│   ├── flow-signer/        # BIP-39/secp256k1 signing (existing)
│   ├── wallet-sdk/         # External dApp integration SDK (existing)
│   ├── wallet-ui/          # NEW — cross-platform UI components
│   └── wallet-core/        # NEW — shared wallet business logic + hooks
├── wallet/                 # Web wallet (Vite SPA, existing — migrate to wallet-ui)
├── wallet-mobile/          # NEW — Expo mobile app
│   └── (wallet/bundler/)    # ERC-4337 bundler/paymaster (subdirectory of wallet/)
│   └── (wallet/extension/) # Chrome extension (subdirectory of wallet/)
├── frontend/               # FlowIndex main site (unchanged)
└── ...
```

### Package Dependency Graph

```
wallet-mobile (Expo)  ──┐                    ┌──▶ HeroUI Native + Uniwind (mobile)
                        ├──▶ wallet-ui ─────┤
wallet (Vite SPA)  ────┘   (business       └──▶ HeroUI React + Tailwind v4 (web)
                             components)
                        ┌──▶ wallet-core (shared hooks + state)
wallet-mobile  ────────┤
wallet (Vite SPA)  ────┤──▶ auth-core
                        ├──▶ evm-wallet
                        ├──▶ flow-passkey
                        └──▶ flow-signer
```

---

## New Package: `wallet-ui`

Cross-platform wallet component library, built on top of HeroUI. Replaces `flow-ui`.

`wallet-ui` is **not** a from-scratch component library — it's a thin wrapper layer that:
1. Re-exports HeroUI components with wallet-specific defaults and variants
2. Provides wallet business components (TokenIcon, AccountSwitcher, etc.)
3. Holds shared design tokens (colors, spacing, typography)

For primitives (Button, Card, Dialog, etc.), apps can import HeroUI directly. `wallet-ui` adds value where wallet-specific customization or cross-platform abstraction is needed.

### Tech Stack

| Layer | Web | Mobile | Notes |
|-------|-----|--------|-------|
| Component library | **HeroUI React** (v3) | **HeroUI Native** | 75 web / 37 native components, compound component pattern |
| Styling | **Tailwind CSS v4** | **Uniwind** (Tailwind v4 for RN) | Both Tailwind-based, same class names |
| Accessibility | React Aria (built into HeroUI) | Built into HeroUI Native | |
| Icons | **lucide-react** | **lucide-react-native** | Already used in project |
| Animations | **motion** (Framer Motion) | **react-native-reanimated** | Platform-specific, wrapped in wallet-ui where needed |

### HeroUI Component Coverage

HeroUI provides most UI primitives out of the box on both platforms:

**Available on both HeroUI React + Native (~37 shared):**

Button, Card, Input, Checkbox, Radio, Switch, Tabs, Avatar, Badge, Chip, Divider, Modal, Drawer, Popover, Tooltip, Dropdown, Select, Autocomplete, Listbox, Progress, Circular Progress, Skeleton, Spinner, Accordion, Alert, Breadcrumbs, Link, Navbar, Pagination, Snippet, Spacer, User, Image, Calendar, DatePicker, DateRangePicker, TimeInput

**Web-only (HeroUI React, no native equivalent yet):**

Table, RangeCalendar, NumberInput, Form (validation), and some layout utilities

For web-only components used on mobile, `wallet-ui` provides native alternatives (e.g., FlashList-based table for mobile).

### Wallet Business Components (wallet-ui's unique value)

These are the components `wallet-ui` provides on top of HeroUI:

| Component | Description | Platform Notes |
|-----------|-------------|----------------|
| TokenIcon | Token logo with chain badge + fallback | Universal — HeroUI Avatar + Image |
| UsdValue | Animated USD value display | Universal |
| ActivityRow | Transaction row (status, amount, counterparty) | Universal — HeroUI Card + Listbox item |
| AccountSwitcher | Account list with avatar, name, truncated address | Universal — HeroUI Dropdown + User |
| NetworkBadge | Mainnet/Testnet/Emulator chip | Universal — HeroUI Chip |
| TokenList | Scrollable token balance list | Web: HeroUI Table / Mobile: FlashList |
| NFTGrid | NFT gallery grid | Web: CSS grid / Mobile: FlashList numColumns |
| SendForm | Amount input + recipient + token selector | Universal — HeroUI Input + Select |
| GlassCard | Frosted glass hero card for dashboard | Platform-adaptive (backdrop-blur handling) |
| ImageWithFallback | Image with loading + error fallback | Universal — HeroUI Image wrapper |
| VerifiedBadge | Contract/token verified indicator | Universal — HeroUI Chip |
| EVMBridgeBadge | EVM bridge status badge | Universal — HeroUI Chip |
| ApproveSheet | Transaction approval UI | Web: HeroUI Modal / Mobile: Bottom Sheet |
| SignSheet | Message signing UI | Web: HeroUI Modal / Mobile: Bottom Sheet |

### Directory Structure

```
packages/wallet-ui/
├── package.json
├── tsconfig.json
├── tailwind-preset.js              # Shared design tokens (extends HeroUI theme)
├── src/
│   ├── index.ts
│   ├── tokens/
│   │   ├── colors.ts               # Wallet color palette (oklch, extends HeroUI)
│   │   ├── spacing.ts              # Spacing overrides
│   │   └── typography.ts           # Font config
│   ├── components/                  # Wallet business components
│   │   ├── TokenIcon.tsx
│   │   ├── UsdValue.tsx
│   │   ├── ActivityRow.tsx
│   │   ├── AccountSwitcher.tsx
│   │   ├── NetworkBadge.tsx
│   │   ├── TokenList.tsx
│   │   ├── TokenList.web.tsx        # HeroUI Table-based
│   │   ├── TokenList.native.tsx     # FlashList-based
│   │   ├── NFTGrid.tsx
│   │   ├── NFTGrid.web.tsx
│   │   ├── NFTGrid.native.tsx
│   │   ├── SendForm.tsx
│   │   ├── GlassCard.tsx
│   │   ├── GlassCard.web.tsx
│   │   ├── GlassCard.native.tsx
│   │   ├── ImageWithFallback.tsx
│   │   ├── VerifiedBadge.tsx
│   │   ├── EVMBridgeBadge.tsx
│   │   ├── ApproveSheet.tsx
│   │   ├── ApproveSheet.web.tsx
│   │   ├── ApproveSheet.native.tsx
│   │   ├── SignSheet.tsx
│   │   ├── SignSheet.web.tsx
│   │   └── SignSheet.native.tsx
│   └── lib/
│       └── utils.ts                 # cn() helper, shared utilities
```

Only components that **need** platform-specific rendering have `.web.tsx` / `.native.tsx` splits. Most wallet-ui components are universal because they compose HeroUI primitives that already handle platform differences.

Platform-specific files use React Native's `.web.tsx` / `.native.tsx` resolution — Metro and Vite both support this pattern.

---

## New Package: `wallet-core`

Shared wallet business logic and React hooks, platform-agnostic.

```
packages/wallet-core/
├── package.json
├── src/
│   ├── index.ts
│   ├── hooks/
│   │   ├── useWallet.ts        # Current wallet state, account list
│   │   ├── useBalance.ts       # Token balances (Flow + EVM)
│   │   ├── useNFTs.ts          # NFT fetching
│   │   ├── useActivity.ts      # Transaction history
│   │   ├── useSend.ts          # Send transaction flow
│   │   ├── useNetwork.ts       # Network switching
│   │   └── useWalletConnect.ts # WalletConnect session management
│   ├── store/
│   │   ├── wallet-store.ts     # Wallet state (zustand or similar)
│   │   └── settings-store.ts   # User preferences
│   ├── api/
│   │   ├── flowindex.ts        # FlowIndex API client
│   │   └── types.ts            # Shared API types
│   └── crypto/
│       ├── keychain.ts         # Platform-adaptive secure storage
│       ├── keychain.web.ts     # Web: encrypted localStorage
│       ├── keychain.native.ts  # Native: expo-secure-store
│       ├── mnemonic.ts         # @scure/bip39 wrapper
│       ├── hd-derive.ts        # BIP-32 + P256 derivation
│       ├── signer.ts           # Unified signing interface
│       └── encryption.ts       # AES-GCM encrypt/decrypt
```

### Crypto Stack

All pure JS, no WASM, no native modules needed:

| Need | Library | Import |
|------|---------|--------|
| P256 signing | `@noble/curves` | `p256` from `@noble/curves/nist` |
| secp256k1 signing | `@noble/curves` | `secp256k1` from `@noble/curves/secp256k1` |
| SHA2-256 | `@noble/hashes` | `sha256` from `@noble/hashes/sha2` |
| SHA3-256 (NIST) | `@noble/hashes` | `sha3_256` from `@noble/hashes/sha3` |
| Keccak-256 (EVM) | `@noble/hashes` | `keccak_256` from `@noble/hashes/sha3` |
| BIP-39 mnemonic | `@scure/bip39` | `generateMnemonic`, `mnemonicToSeed` |
| BIP-32 HD derivation | `@scure/bip32` | `HDKey` (secp256k1 paths) |
| Random bytes | `expo-crypto` (native) / `crypto.getRandomValues` (web) | polyfill loaded at entry |

P256 HD derivation: derive 32-byte entropy via secp256k1 BIP-32 path (`m/44'/539'/0'/0/0`), use as P256 private key scalar. Standard multi-curve wallet approach.

---

## Mobile App: `wallet-mobile`

### Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | **Expo SDK latest stable** (52+) managed workflow |
| Builds | **EAS Build** with custom dev client |
| Router | **Expo Router v4** (file-based routing) |
| UI Components | **HeroUI Native** (37 components, Tailwind v4) |
| Styling | **Uniwind** (Tailwind v4 bindings for RN, by Unistyles team) |
| Navigation | Expo Router tabs + stack |
| Animations | **react-native-reanimated** v3 |
| Lists | **@shopify/flash-list** |
| Biometrics | **expo-local-authentication** |
| Secure storage | **expo-secure-store** (iOS Keychain / Android Keystore) |
| Camera/QR | **expo-camera** |
| Push | **expo-notifications** |
| Haptics | **expo-haptics** |
| WalletConnect | **@walletconnect/react-native-compat** + `@walletconnect/web3wallet` |

### Directory Structure

```
wallet-mobile/
├── app.json                    # Expo config
├── app/
│   ├── _layout.tsx             # Root layout (providers, theme)
│   ├── (auth)/
│   │   ├── login.tsx           # Login / create wallet
│   │   └── import.tsx          # Import mnemonic / private key
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Tab navigator
│   │   ├── index.tsx           # Dashboard (home)
│   │   ├── activity.tsx        # Transaction history
│   │   ├── nfts.tsx            # NFT gallery
│   │   └── settings.tsx        # Settings
│   ├── send/
│   │   └── index.tsx           # Send flow
│   ├── approve/
│   │   └── [id].tsx            # Transaction approval
│   ├── sign/
│   │   └── [id].tsx            # Message signing
│   ├── walletconnect/
│   │   ├── scan.tsx            # QR scanner
│   │   └── session.tsx         # WC session management
│   └── ai/
│       └── index.tsx           # AI chat (if ported)
├── components/                 # Mobile-only layout components
│   ├── TabBar.tsx
│   └── Header.tsx
├── providers/
│   └── index.tsx               # Compose all providers
├── package.json
├── tsconfig.json
├── tailwind.config.js          # Extends wallet-ui/tailwind-preset
├── metro.config.js             # Monorepo + NativeWind config
├── app.config.ts               # Expo config (dynamic)
└── eas.json                    # EAS Build profiles
```

### Feature Parity Matrix

| Feature | Web (`wallet/`) | Mobile (`wallet-mobile/`) | Shared Code |
|---------|----------------|--------------------------|-------------|
| Dashboard / balances | ✅ | ✅ | wallet-core hooks + wallet-ui components |
| Send tokens | ✅ | ✅ | wallet-core `useSend` + wallet-ui `SendForm` |
| NFT gallery | ✅ | ✅ | wallet-core `useNFTs` + wallet-ui `NFTGrid` |
| Activity history | ✅ | ✅ | wallet-core `useActivity` + wallet-ui `ActivityRow` |
| Settings | ✅ | ✅ | wallet-core `useNetwork` + wallet-ui primitives |
| WalletConnect | ✅ | ✅ | wallet-core `useWalletConnect` |
| Passkey signing | WebAuthn API | Passkey API (iOS 16+ / Android 14+) | flow-passkey (platform-adaptive) |
| Mnemonic wallet | ✅ | ✅ | wallet-core crypto + flow-signer |
| Private key wallet | ✅ | ✅ | wallet-core crypto |
| Biometric auth | N/A | expo-local-authentication | Mobile-only |
| QR scan | N/A | expo-camera | Mobile-only |
| Push notifications | N/A | expo-notifications | Mobile-only |
| Deep links | URL params | Expo deep links | Platform-specific |
| FCL authn/authz | ✅ popup | ✅ in-app webview or deep link | Partial share |
| AI chat | ✅ | ✅ | wallet-core API + wallet-ui components |
| Chrome extension | ✅ | N/A | Extension-only |
| Auto-sign (dev) | ✅ | ❌ (not needed on mobile) | Web-only |
| FCL dApp authn | ✅ popup service | ✅ deep link / in-app browser | flow-passkey + wallet-core |
| FCL dApp authz | ✅ popup service | ✅ approval screen via deep link | wallet-core signing + wallet-ui Approve |
| FCL sign message | ✅ popup service | ✅ sign screen via deep link | wallet-core signing + wallet-ui Sign |
| ERC-4337 smart accounts | ✅ | ✅ | wallet-core + bundler service |

### FCL Integration on Mobile

On web, the wallet acts as an FCL discovery wallet service via popup windows. On mobile, the flow changes:

1. **dApp in mobile browser** → deep link to wallet-mobile → approve/sign → deep link back
2. **dApp in in-app browser** (future) → direct JS bridge communication
3. **WalletConnect** → serves as the transport layer between dApp and mobile wallet

The mobile app registers as a universal link handler (e.g., `https://wallet.flowindex.io/fcl/*`) and an app scheme (`flowindex-wallet://`). FCL requests arrive as deep links with encoded parameters, routed to `approve/[id].tsx` or `sign/[id].tsx`.

### ERC-4337 Account Abstraction

The existing `wallet/bundler/` service handles UserOperation bundling and paymaster signing. The mobile app is a client — it constructs UserOperations using `wallet-core` and submits to the bundler service over HTTP. No bundler code runs on-device.

---

## Web Wallet Migration Plan

The existing `wallet/` (Vite SPA) migrates from `flow-ui` to `wallet-ui` incrementally:

1. Add `@heroui/react`, `wallet-ui`, and `wallet-core` as workspace dependencies
2. Configure HeroUI React + Tailwind CSS v4 in wallet's Vite/Tailwind config
3. Configure Vite to resolve `.web.tsx` files from wallet-ui
4. Migrate one page at a time: Dashboard → Send → NFTs → Activity → Settings
5. Remove `flow-ui` dependency from wallet once all pages migrated
6. Extract shared hooks from `wallet/src/hooks/` into `wallet-core`

This is **not a rewrite** — the page structure, routing (react-router-dom), and Vite build stay the same. Component imports change from `@flowindex/flow-ui` to `@heroui/react` + `@flowindex/wallet-ui`.

---

## Expo Configuration

### Monorepo Metro Config

```js
// wallet-mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withUnistyles } = require('react-native-unistyles/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch monorepo packages
config.watchFolders = [monorepoRoot];

// Resolve from monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Uniwind (Tailwind v4 bindings) is configured via HeroUI Native setup
module.exports = withUnistyles(config);
```

### Expo Config Plugins Needed

| Plugin | Purpose |
|--------|---------|
| `expo-secure-store` | Keychain/Keystore access |
| `expo-local-authentication` | Face ID / fingerprint |
| `expo-camera` | QR code scanning |
| `expo-notifications` | Push notifications |
| `expo-haptics` | Haptic feedback |

All of these work with Expo managed workflow — no eject needed.

### Passkey on Mobile

iOS 16+ and Android 14+ support platform passkeys natively. The `flow-passkey` package needs a platform-adaptive layer:

```
packages/flow-passkey/
├── src/
│   ├── index.ts
│   ├── webauthn.ts             # Existing — navigator.credentials API
│   ├── passkey.native.ts       # NEW — react-native-passkey or expo-passkeys
│   └── types.ts                # Shared types
```

The signing logic (CBOR decode, P256 signature normalization) stays shared. Only the credential creation/assertion API differs per platform.

---

## Design Tokens

HeroUI provides a built-in theming system with oklch color variables. `wallet-ui/tailwind-preset.js` extends HeroUI's theme with wallet-specific overrides:

```js
// wallet-ui/tailwind-preset.js
const { heroui } = require('@heroui/react');  // web
// For native, Uniwind uses the same token format

module.exports = {
  plugins: [
    heroui({
      themes: {
        dark: {
          colors: {
            primary: { DEFAULT: '#00ef8b', foreground: '#000' },  // Flow green
            secondary: { DEFAULT: '#6366f1' },
            background: '#0a0a0a',
            content1: '#1a1a1a',  // Card background
            content2: '#2a2a2a',
          },
        },
        light: {
          colors: {
            primary: { DEFAULT: '#00c472', foreground: '#fff' },
            secondary: { DEFAULT: '#4f46e5' },
          },
        },
      },
    }),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

Both `wallet/tailwind.config.cjs` and `wallet-mobile/tailwind.config.js` extend this preset. HeroUI's design tokens (border radius, spacing, shadows) are inherited automatically.

---

## Monorepo Configuration

Add `wallet-mobile` to the root `package.json` workspaces:

```jsonc
// package.json (root)
{
  "workspaces": [
    "packages/*",
    "frontend",
    "runner",
    "simulate/frontend",
    "ai/chat/web",
    "wallet",
    "wallet-mobile",   // NEW
    "videos"
  ]
}
```

`packages/wallet-ui` and `packages/wallet-core` are covered by the existing `"packages/*"` glob.

### React Version Strategy

The existing `wallet/` uses React 19.2.0. Expo SDK 52 ships with React 18 by default but supports React 19 via the New Architecture (Fabric). Strategy:

- **wallet-mobile** uses React 18 initially (Expo default, most stable)
- **wallet-ui** and **wallet-core** target React 18+ (use no React 19-only APIs)
- Upgrade to React 19 when Expo stabilizes full New Architecture support
- `wallet/` (web) continues on React 19 — no regression

---

## Testing Strategy

### Crypto & Signing (Critical)

- **Unit tests** for all `wallet-core/crypto/` modules using vitest
- Test vectors from NIST (P256), Bitcoin (secp256k1, BIP-32/39), and Flow SDK test cases
- Property-based tests for sign/verify roundtrips
- P256 scalar validation: verify derived 32-byte values are valid P256 private keys (< curve order)

### UI Components

- **Component tests** for `wallet-ui` using react-native-testing-library
- Snapshot tests for both web and native renders
- Storybook (optional) for visual development and review

### Mobile E2E

- **Maestro** for mobile E2E tests (simpler than Detox, works with Expo)
- Core flows: create wallet → view dashboard → send token → approve transaction
- Run on EAS Build CI

### Web E2E

- Continue existing Playwright setup in `wallet/`
- Add tests for wallet-ui migrated pages

---

## CI/CD & Distribution

### EAS Build Pipeline

```
PR opened → lint + type-check + unit tests (all packages)
           → EAS Build (development profile) for review
           → Maestro E2E on simulator

Main merge → EAS Build (preview profile)
           → TestFlight (iOS) + Play Console internal testing (Android)

Release tag → EAS Build (production profile)
            → App Store + Play Store submission
            → EAS Update for OTA JS bundle updates
```

### App Signing

- iOS certificates and provisioning profiles managed via EAS credentials
- Android keystore stored in EAS Secrets (encrypted)
- No local signing keys committed to repo

### Nx Integration

Add `wallet-mobile` to Nx project graph:

```jsonc
// wallet-mobile/project.json
{
  "tags": ["app", "mobile"],
  "targets": {
    "lint": { "command": "cd wallet-mobile && npx expo lint" },
    "test": { "command": "cd wallet-mobile && vitest run" },
    "build:dev": { "command": "cd wallet-mobile && eas build --profile development" }
  }
}
```

---

## Security Considerations

### Web Keychain Limitations

`keychain.web.ts` uses encrypted localStorage (AES-GCM with a user-derived key). This is vulnerable to XSS — any JS running in the same origin can read localStorage. Mitigations:

- **Passkey-based signing is the preferred web path** — private keys never leave the secure element
- Strict Content Security Policy (CSP) headers to prevent XSS
- For mnemonic/private key wallets on web, the encrypted storage is a pragmatic tradeoff (same approach as MetaMask)
- Document this tradeoff clearly in user-facing security docs

### Mobile Secure Storage

- **expo-secure-store** has a ~2KB value size limit per item on some platforms
- Strategy: store a master encryption key in Secure Store, store encrypted wallet data (which can be larger) in AsyncStorage
- Biometric auth gates access to the master key

### P256 HD Derivation

When deriving P256 keys from BIP-32 secp256k1 paths:

- The 32-byte derived value must be validated as a valid P256 scalar (1 < k < P256 order n)
- Probability of invalid scalar is ~2^-224 (negligible) but implementation must include the check
- If invalid, increment derivation index and retry

### Multi-Device Sync

Not in scope for v1. Users must back up their mnemonic. Each device is independent. Future: encrypted cloud backup via iCloud Keychain / Google Backup.

---

## flow-ui → wallet-ui Component Gap Analysis

Components in `flow-ui` that must have a `wallet-ui` equivalent:

| flow-ui Component | Replacement | Notes |
|---|---|---|
| button, card, input, badge, avatar, tabs, switch, separator, label | **HeroUI** (direct) | Use HeroUI React (web) / HeroUI Native (mobile) directly |
| dialog, select, dropdown-menu, popover | **HeroUI** (direct) | Modal, Select, Dropdown, Popover all available in HeroUI |
| table | **HeroUI Table** (web) / FlashList (mobile) | HeroUI Table is web-only; wallet-ui provides TokenList wrapper |
| textarea | **HeroUI Textarea** | Available on both platforms |
| command (cmdk) | **HeroUI Autocomplete** or custom | Autocomplete covers most use cases |
| input-otp | **wallet-ui custom** | Not in HeroUI; port from flow-ui or use input-otp lib |
| calendar | **HeroUI Calendar/DatePicker** | Available on both platforms |
| TokenIcon, UsdValue, ActivityRow, AccountSwitcher, NetworkBadge | **wallet-ui** components | Built on HeroUI primitives |
| ImageWithFallback | **HeroUI Image** or **wallet-ui** wrapper | HeroUI Image has fallback support |
| VerifiedBadge, EVMBridgeBadge | **wallet-ui** (HeroUI Chip) | Simple wrappers around HeroUI Chip |
| GlassCard | **wallet-ui** component | Platform-adaptive (backdrop-blur) |

### Utility Functions Migration

Non-component exports from `flow-ui` → `wallet-core`:

| Utility | Destination |
|---|---|
| `normalizeAddress`, `formatShort` | `wallet-core/utils/address.ts` |
| `getTokenLogoURL`, `resolveIPFS` | `wallet-core/utils/assets.ts` |
| `formatNumber`, `formatStorageBytes` | `wallet-core/utils/format.ts` |
| `decodeCadenceValue` | `wallet-core/utils/cadence.ts` |
| `deriveActivityType` | `wallet-core/utils/activity.ts` |
| `cn()`, `cva` helpers | `wallet-ui/lib/utils.ts` |

---

## Implementation Order

### Phase 1 — Foundation

1. Create `packages/wallet-ui` with Tier 1 primitives + Tier 2 adaptive (Dialog, Select, Toast)
2. Create `packages/wallet-core` with crypto module, keychain, and basic hooks (useWallet, useBalance)
3. Create `wallet-mobile/` Expo project skeleton with Expo Router + NativeWind
4. Implement mnemonic create/import flow (needed before Dashboard)
5. Build mobile Dashboard screen using wallet-ui + wallet-core
6. Set up unit tests for wallet-core crypto

### Phase 2 — Core Wallet Features

7. Implement Send flow (shared SendForm component)
8. Implement Activity page
9. Implement NFT gallery
10. Implement Settings page
11. Deep link handling (required for Phase 3 WalletConnect + FCL)
12. Passkey native support (iOS/Android) — high risk, test early
13. Begin migrating `wallet/` web from flow-ui to wallet-ui

### Phase 3 — Connectivity & Advanced

14. WalletConnect integration (mobile) — depends on deep links from step 11
15. FCL dApp interaction flows (authn/authz via deep links)
16. ERC-4337 smart account support (mobile client)
17. Biometric authentication
18. Push notifications
19. QR code scanning

### Phase 4 — Polish & Ship

20. Complete web wallet migration to wallet-ui, remove flow-ui
21. Error monitoring (Sentry) + analytics
22. Maestro E2E test suite
23. EAS Build CI/CD pipeline
24. TestFlight + Play Console beta
25. App Store / Play Store submission
26. OTA update pipeline via EAS Update

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| HeroUI React v3 is RC/beta (not stable yet) | Medium | Pin to RC version; monitor release timeline; HeroUI Native is production-ready |
| HeroUI web vs native API differences | Medium | wallet-ui abstracts differences for wallet-specific components; for standard HeroUI use, accept separate imports |
| Uniwind Tailwind v4 gaps on RN | Medium | Validate oklch() color support early; fallback to hex/rgb if needed |
| React 18 vs 19 mismatch (web=19, mobile=18) | Low | Shared packages target React 18+ API only; no React 19-only features in wallet-ui/wallet-core |
| expo-secure-store 2KB size limit | Low | Store master key in Secure Store, encrypted data in AsyncStorage |
| App Store review rejection (crypto wallet) | Medium | Prepare crypto export compliance docs; provide clear app description; avoid "cryptocurrency" in marketing if possible |
| rn-primitives missing components | Low | Write custom primitives where needed; contribute upstream |
| Passkey API differences (web vs iOS vs Android) | High | Abstract early in flow-passkey; test on real devices from day one |
| Monorepo Metro config complexity | Medium | Follow Expo monorepo docs; use expo-monorepo-tools if needed |
| WalletConnect RN compatibility | Medium | Use official @walletconnect/react-native-compat; test early |
| flow-ui → wallet-ui migration breaks web wallet | Medium | Incremental page-by-page migration; both libs coexist during transition |

---

## Decision Log

| Decision | Alternatives Considered | Why |
|----------|------------------------|-----|
| HeroUI (React + Native) | Tamagui, NativeWind + RN Reusables, gluestack-ui | Most components (75 web / 37 native), Tailwind-based on both platforms, polished design out of the box; Tamagui requires new styling system; RN Reusables has fewer components; gluestack smaller community |
| Expo managed + dev client | Bare workflow, plain RN | Managed gives EAS Build, OTA updates, config plugins; dev client handles native modules without ejecting |
| noble/scure crypto stack | TrustWallet wallet-core | Pure JS, 50-100KB vs 5-10MB, already used via viem; only doing Flow+EVM so full wallet-core is overkill |
| New wallet-ui on HeroUI | Extend flow-ui | flow-ui is web-only (Radix DOM primitives); HeroUI provides cross-platform primitives with built-in theming; wallet-ui wraps HeroUI with wallet-specific business components |
| New wallet-core package | Keep logic in wallet/src | Extracting hooks/state enables true code sharing; wallet and wallet-mobile both consume the same logic |
| Monorepo (not separate repo) | Separate repo for mobile | Shared packages are already in monorepo; workspace:* linking is simpler than publishing/versioning |

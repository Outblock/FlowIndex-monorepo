# Monorepo + Passkey/Auth Package Design

**Date:** 2026-03-07
**Status:** Approved

## Goal

Convert the project into an Nx monorepo and extract two shared packages:

1. **`@flowindex/flow-passkey`** — Open-source Flow passkey wallet SDK (client-only, framework-agnostic)
2. **`@flowindex/auth`** — Internal auth package for our three apps (runner, frontend, ai/chat)

A single passkey should both authenticate users (Supabase session) and sign Flow transactions (FLIP-264).

## Architecture Overview

```
+-----------------------------------------------+
|  @flowindex/flow-passkey  (open-source)        |
|                                                |
|  Pure client-side, zero backend/React deps     |
|  WebAuthn credential mgmt + Flow tx signing    |
|  FCL authorization function integration        |
+---------------------+-------------------------+
                      | peer dep
+---------------------v-------------------------+
|  @flowindex/auth  (internal)                   |
|                                                |
|  core/  — JWT, cookie, token refresh, GoTrue   |
|  passkey/ — passkey-auth edge function client   |
|  react/ — AuthProvider, useAuth, LoginModal     |
+-----------------------------------------------+
        |               |              |
    frontend         runner         ai/chat
```

## Package 1: `@flowindex/flow-passkey`

### Design Principles

- **Client-only** — no server-side code, no backend dependency
- **Framework-agnostic** — pure TypeScript, no React
- **FCL as peer dependency** — projects not using FCL can still use low-level APIs
- **SDK does NOT handle**: account provisioning, server verification, session management

### Public API

```typescript
// -- WebAuthn Primitives --

// Create passkey credential (registration)
createPasskeyCredential(options: {
  rpId: string;
  rpName: string;
  challenge: Uint8Array;          // from your server
  userId: Uint8Array;
  userName: string;
  excludeCredentials?: { id: string; type: 'public-key' }[];
}): Promise<{
  credentialId: string;
  attestationResponse: {          // send to your server to verify
    attestationObject: string;    // base64url
    clientDataJSON: string;       // base64url
  };
  rawId: string;                  // base64url
  type: string;
  publicKeySec1Hex: string;       // P256 uncompressed public key
}>;

// Get passkey assertion (login or arbitrary challenge)
getPasskeyAssertion(options: {
  rpId: string;
  challenge: Uint8Array;          // from your server
  allowCredentials?: { id: string; type: 'public-key' }[];
  mediation?: CredentialMediationRequirement;
  signal?: AbortSignal;
}): Promise<{
  credentialId: string;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;          // DER-encoded
  rawId: string;                  // base64url
}>;

// -- Flow Transaction Signing --

// Sign an encoded Flow transaction message
signFlowTransaction(options: {
  messageHex: string;             // encoded payload or envelope hex
  credentialId: string;
  rpId: string;
}): Promise<{
  signature: string;              // 64-byte P256 raw hex (r||s)
  extensionData: string;          // FLIP-264: 0x01 + RLP[authData, clientData]
}>;

// FCL authorization function factory
createPasskeyAuthz(options: {
  address: string;
  keyIndex: number;
  credentialId: string;
  rpId: string;
}): (account: any) => Promise<any>;  // FCL AuthorizationFunction

// -- Encoding Utilities (re-exported for advanced use) --

encodeTransactionPayload(voucher: Voucher): string;
encodeTransactionEnvelope(voucher: Voucher): string;
encodeMessageFromSignable(signable: Signable, signerAddress: string): string;
derToP256Raw(der: Uint8Array): Uint8Array;
buildExtensionData(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): string;
sha256(bytes: Uint8Array): Promise<Uint8Array>;
sha3_256(hex: string): string;

// -- Base64URL helpers --
base64UrlToBytes(b64u: string): Uint8Array;
bytesToBase64Url(bytes: Uint8Array): string;
bytesToHex(b: Uint8Array): string;
hexToBytes(hex: string): Uint8Array;
```

### Source Files

```
packages/flow-passkey/
  src/
    webauthn.ts       # createPasskeyCredential, getPasskeyAssertion
    signer.ts         # signFlowTransaction, createPasskeyAuthz
    encode.ts         # RLP encoding, domain tags, DER->P256 (from passkeyEncode.ts)
    utils.ts          # hex/base64url helpers
    types.ts          # Voucher, Signable, PasskeySignResult, etc.
    index.ts          # re-exports all public API
  package.json        # deps: @onflow/rlp, sha3; peerDeps: @onflow/fcl
  tsconfig.json
  project.json        # Nx project config
```

### Dependencies

- `@onflow/rlp` — RLP encoding (required)
- `sha3` — SHA3_256 hashing (required)
- `@onflow/fcl` — **peer dependency** (optional, needed only for `createPasskeyAuthz`)

### How Other Flow Projects Use It

```typescript
import { createPasskeyCredential, createPasskeyAuthz } from '@flowindex/flow-passkey';
import * as fcl from '@onflow/fcl';

// 1. Registration: create passkey, get P256 public key
const { publicKeySec1Hex, credentialId, attestationResponse } =
  await createPasskeyCredential({
    rpId: 'myapp.com', rpName: 'My App',
    challenge: challengeFromMyServer,
    userId: userIdBytes, userName: 'alice@example.com',
  });
// -> Send attestationResponse to your server for verification
// -> Use publicKeySec1Hex to create Flow account (your own provisioning)

// 2. Signing: use passkey as FCL authorizer
const authz = createPasskeyAuthz({
  address: '0xe4a1c01f1f1e87b3', keyIndex: 0,
  credentialId, rpId: 'myapp.com',
});

await fcl.mutate({
  cadence: `transaction { execute { log("hello") } }`,
  proposer: authz, payer: authz, authorizations: [authz],
});
```

## Package 2: `@flowindex/auth`

### Design Principles

- Depends on `@flowindex/flow-passkey` for WebAuthn + Flow signing
- Split into `core/` (pure logic) and `react/` (React components)
- `core/` has zero React dependency — usable in ai/chat middleware
- `react/` AuthProvider is configurable via options (feature flags)

### Source Files

```
packages/auth/
  src/
    core/
      jwt.ts          # parseJwt, isExpired, secondsUntilExpiry
      cookie.ts       # fi_auth cross-domain cookie read/write/clear
      token.ts        # scheduleRefresh, refreshToken (GoTrue /token)
      gotrue.ts       # gotruePost, exchangeTokenHash, OAuth redirect helpers
      index.ts        # re-exports core API
    passkey/
      client.ts       # passkey-auth edge function API client
                      # wraps flow-passkey's WebAuthn primitives
                      # + our server endpoints (/register/start, /finish, /login/start, /finish)
                      # + account provisioning (/wallet/provision-start, etc.)
      index.ts
    react/
      AuthProvider.tsx # Unified AuthContext with config-driven feature flags
      useAuth.ts       # useAuth() hook
      usePasskeyAuth.ts # usePasskeyAuth() hook (register, login, sign, accounts)
      LoginModal.tsx   # Shared login UI (OAuth + email OTP + passkey)
      index.ts
    index.ts           # re-exports everything
  package.json         # deps: @flowindex/flow-passkey, react (peer)
  tsconfig.json
  project.json
```

### Core API (no React)

```typescript
// JWT
parseJwt(token: string): { sub: string; email?: string; exp: number; [key: string]: any };
isExpired(token: string): boolean;
secondsUntilExpiry(token: string): number;

// Cookie
loadTokensFromCookie(): { access_token: string; refresh_token: string } | null;
persistTokensToCookie(tokens: { access_token: string; refresh_token: string }, domain?: string): void;
clearAuthCookie(domain?: string): void;

// Token refresh
scheduleRefresh(refreshToken: string, gotrueUrl: string, onRefresh: (tokens) => void): () => void;  // returns cancel fn
refreshToken(refreshToken: string, gotrueUrl: string): Promise<TokenData>;

// GoTrue helpers
gotruePost(gotrueUrl: string, path: string, body: object): Promise<any>;
buildOAuthRedirectUrl(gotrueUrl: string, provider: string, redirectTo: string): string;
```

### Passkey Client API (wraps flow-passkey + our edge function)

```typescript
createPasskeyAuthClient(config: {
  passkeyAuthUrl: string;       // e.g. https://run.flowindex.io/functions/v1/passkey-auth
  rpId: string;                 // e.g. flowindex.io
  rpName: string;               // e.g. FlowIndex
}): {
  // Registration: creates WebAuthn credential + registers on our server
  register(accessToken: string, walletName?: string): Promise<{
    credentialId: string;
    publicKeySec1Hex: string;
  }>;

  // Login: WebAuthn assertion + server verification -> tokenHash for GoTrue exchange
  login(options?: { mediation?: CredentialMediationRequirement; signal?: AbortSignal }): Promise<{
    tokenHash: string;
    email: string;
  }>;

  // Account provisioning (Lilico)
  provisionAccounts(accessToken: string, credentialId: string): Promise<ProvisionResult>;
  pollProvisionTx(txId: string, network: 'mainnet' | 'testnet'): Promise<string>;
  saveProvisionedAddress(accessToken: string, credentialId: string, network: string, address: string): Promise<void>;

  // List/manage
  listPasskeys(accessToken: string): Promise<PasskeyInfo[]>;
  listAccounts(accessToken: string): Promise<PasskeyAccount[]>;
  removePasskey(accessToken: string, credentialId: string): Promise<void>;
  updatePasskey(accessToken: string, credentialId: string, name: string): Promise<void>;
};
```

### React API

```typescript
// AuthProvider config
interface AuthConfig {
  gotrueUrl: string;
  supabaseUrl?: string;
  passkeyAuthUrl?: string;        // enables passkey features
  cookieDomain?: string;          // enables cross-domain cookie sync
  enableLogoutDetection?: boolean; // runner needs this
  enableRoles?: boolean;          // frontend needs this
}

// <AuthProvider config={...}>{children}</AuthProvider>

// useAuth() returns:
interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;

  // Standard auth
  signInWithProvider(provider: 'github' | 'google', redirectTo?: string): void;
  sendMagicLink(email: string, redirectTo?: string): Promise<void>;
  verifyOtp(email: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  handleCallback(): Promise<void>;
  applyTokenData(tokenData: TokenData): void;

  // Passkey (available when passkeyAuthUrl configured)
  passkey?: {
    hasSupport: boolean;
    accounts: PasskeyAccount[];
    selectedAccount: PasskeyAccount | null;
    selectAccount(credentialId: string): void;
    register(walletName?: string): Promise<{ credentialId: string; publicKeySec1Hex: string }>;
    login(): Promise<void>;
    startConditionalLogin(onSuccess?: () => void): AbortController;
    sign(messageHex: string): Promise<PasskeySignResult>;
    getFlowAuthz(address: string, keyIndex: number): FCLAuthzFunction;
    provisionAccounts(credentialId: string): Promise<ProvisionResult>;
    pollProvisionTx(txId: string, network: 'mainnet' | 'testnet'): Promise<string>;
    saveProvisionedAddress(credentialId: string, network: string, address: string): Promise<void>;
    refreshState(): Promise<void>;
  };
}

// LoginModal — shared login UI
interface LoginModalProps {
  open: boolean;
  onClose(): void;
  redirectTo?: string;
  showPasskey?: boolean;           // default: true if passkey configured
}
```

### Per-Project Usage

**frontend:**
```tsx
<AuthProvider config={{
  gotrueUrl: import.meta.env.VITE_GOTRUE_URL,
  passkeyAuthUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/passkey-auth`,
  cookieDomain: '.flowindex.io',
  enableRoles: true,
}}>
  <App />
</AuthProvider>
```

**runner:**
```tsx
<AuthProvider config={{
  gotrueUrl: import.meta.env.VITE_GOTRUE_URL,
  passkeyAuthUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/passkey-auth`,
  cookieDomain: '.flowindex.io',
  enableLogoutDetection: true,
}}>
  <App />
</AuthProvider>
```

**ai/chat (core only, no React initially):**
```typescript
import { loadTokensFromCookie, parseJwt } from '@flowindex/auth/core';
// Later: switch to AuthProvider when adding UI
```

## Nx Monorepo Structure

```
flowindex/
  nx.json                         # Nx workspace config
  package.json                    # bun workspaces: ["packages/*", "frontend", "runner", "ai/*"]
  packages/
    flow-passkey/                 # @flowindex/flow-passkey
      src/ package.json project.json tsconfig.json
    auth/                         # @flowindex/auth
      src/ package.json project.json tsconfig.json
  frontend/                       # imports @flowindex/auth
  runner/                         # imports @flowindex/auth + @flowindex/flow-passkey
  ai/chat/web/                    # imports @flowindex/auth/core (later: /react)
  backend/                        # unchanged
  supabase/                       # unchanged (passkey-auth edge function stays here)
```

### Nx Configuration

- Build tool: **tsup** (fast, zero-config TypeScript bundler)
- Each package exports ESM + CJS + types
- `nx build flow-passkey` builds the SDK
- `nx build auth` builds auth (depends on flow-passkey)
- `nx build frontend` builds frontend (depends on auth)
- Nx caching enabled for build/lint/test targets

## Migration Plan (High Level)

### Phase 1: Nx Setup + flow-passkey Package
1. Initialize Nx workspace at repo root
2. Create `packages/flow-passkey/` with code from runner's `passkeyEncode.ts`
3. Add `webauthn.ts` (extract from `usePasskeyWallet.ts` — client-side WebAuthn parts)
4. Add `signer.ts` with `signFlowTransaction` + `createPasskeyAuthz`
5. Build + test independently

### Phase 2: auth Package
1. Create `packages/auth/`
2. Extract `core/` from runner + frontend AuthContext (jwt, cookie, token, gotrue)
3. Extract `passkey/client.ts` from runner's `usePasskeyWallet.ts` (server API calls)
4. Build `react/AuthProvider.tsx` — unified provider with config flags
5. Build `react/LoginModal.tsx` — shared login UI with CSS variable theming
6. Build + test independently

### Phase 3: Migrate Consumer Apps
1. **runner**: Replace `auth/AuthContext.tsx` + `usePasskeyWallet.ts` + `passkeyEncode.ts` with package imports
2. **frontend**: Replace `contexts/AuthContext.tsx` + supakeys with package imports
3. **ai/chat**: Replace inline Supabase client + auth-modal with package imports
4. Verify all three apps work with shared packages

### Phase 4: Cleanup
1. Remove duplicated auth code from all three apps
2. Remove `supakeys` dependency from frontend
3. Update CI/CD for Nx-aware builds
4. Publish `@flowindex/flow-passkey` to npm (if desired)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package name | `@flowindex/flow-passkey` | Broader than `fcl-passkey`, unified brand |
| Server code in SDK? | No | Each project has different backend |
| Account provisioning? | In `@flowindex/auth`, not SDK | Requires Lilico API key, infrastructure-specific |
| FCL dependency | Peer dep | Optional for projects not using FCL |
| React in passkey SDK? | No | Maximum portability |
| Build tool | tsup | Fast, zero-config, ESM+CJS |
| LoginModal theming | CSS variables | Each app overrides `--flow-green`, `--bg-panel`, etc. |
| Passkey-auth edge function | Stays in supabase/ | Server-side, not part of client packages |

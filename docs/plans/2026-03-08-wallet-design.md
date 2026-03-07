# Wallet — Passkey Web Wallet for Flow

## Overview

A standalone web wallet at `wallet.flowindex.io` using passkeys (WebAuthn) for authentication and transaction signing. Serves two roles:

1. **Standalone wallet** — dashboard with FT balances, NFT gallery, send tokens, transaction history
2. **FCL wallet provider** — other dApps connect via FCL discovery/direct config, sign transactions through popup

## Architecture

```
Other dApps (FCL)           wallet.flowindex.io (Vite + React SPA)
       │                              │
       │ postMessage popup protocol   │
       ├─────────────────────────────>│ /authn  (connect)
       ├─────────────────────────────>│ /authz  (sign tx)
       ├─────────────────────────────>│ /sign-message (user sig)
                                      │
                                      │ Uses:
                                      │  @flowindex/flow-ui (shared components)
                                      │  passkey-auth edge function (WebAuthn)
                                      │  backend API (FT/NFT/tx data)
                                      │  Flow Access Nodes (submit tx)
```

## Tech Stack

- Vite + React SPA (no SSR needed)
- TypeScript, TailwindCSS, Shadcn/UI
- `@onflow/fcl` for Flow interaction
- WebAuthn browser API for passkey signing
- Bun workspace: `@flowindex/flow-ui` shared package

## Shared Package: `packages/flow-ui/`

Extract from `frontend/app/` into a shared component library:

- FT holdings table (balances, prices, USD values)
- NFT gallery (collection grid, item detail)
- Transaction history list
- Token transfer details
- Staking info display
- Account overview (address, keys, balance)

Both `frontend/` and `wallet/` consume via bun workspace.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: FLOW balance, FT holdings, recent txs |
| `/nfts` | NFT gallery (collections + items) |
| `/send` | Send FLOW/FT/NFT |
| `/activity` | Full transaction history |
| `/authn` | FCL connect popup |
| `/authz` | FCL sign popup |
| `/sign-message` | FCL user-signature popup |
| `/settings` | Manage passkeys, accounts, network switch |

## FCL Wallet Protocol

### authn (Connect)

1. dApp opens `wallet.flowindex.io/authn` as popup
2. Wallet sends `FCL:VIEW:READY` to `window.opener`
3. dApp responds with `FCL:VIEW:READY:RESPONSE` + config
4. User authenticates via passkey (`navigator.credentials.get()`)
5. Wallet sends `FCL:VIEW:RESPONSE` with `{addr, keyId, services[]}`
6. Popup closes

Services array includes: authn, authz, user-signature endpoints.

### authz (Sign Transaction)

1. dApp opens `wallet.flowindex.io/authz` as popup
2. Wallet sends `FCL:VIEW:READY` to `window.opener`
3. dApp responds with `FCL:VIEW:READY:RESPONSE` + signable
4. Wallet displays transaction details for user review
5. User approves via passkey touch
6. Signing process:
   - `challenge = SHA256(encodeMessageFromSignable(signable, address))`
   - `navigator.credentials.get({challenge})` returns DER signature
   - Convert DER to 64-byte raw `r||s`
   - Build FLIP-264 extension: `0x01 || RLP([authenticatorData, clientDataJSON])`
7. Wallet sends `FCL:VIEW:RESPONSE` with `{addr, keyId, signature, signatureExtension}`
8. Popup closes

### Message Listener Pattern

Both authn/authz pages use a `useEffect` that:
- Sends `FCL:VIEW:READY` on mount
- Listens for `FCL:VIEW:READY:RESPONSE` with config/signable
- Sends `FCL:VIEW:RESPONSE` after user action
- Handles `FCL:VIEW:CLOSE` for cancellation

## Backend Integration

- **passkey-auth** (existing): WebAuthn registration/login, Flow account provisioning via Lilico API
- **backend API** (existing): FT holdings, NFT collections/items, transaction history, account data
- **Flow Access Nodes**: on-chain queries, transaction submission
- **Supabase Auth** (existing): session management

## Account Provisioning

- v1: Lilico/FRW OpenAPI (already integrated in passkey-auth)
- Future: self-hosted account creator for full control
- passkey-auth already abstracts this behind `/wallet/provision-start` and `/wallet/provision-save`

## FCL Discovery

- Phase 1: Direct config (`fcl.config.put("discovery.wallet", "https://wallet.flowindex.io/authn")`)
- Phase 2: Register with FCL Discovery service for public availability

## Deployment

- Docker container: nginx serving Vite static build
- Domain: `wallet.flowindex.io` via Caddy
- WebAuthn rpId: `flowindex.io` (shared across subdomains)
- Add to `docker-compose.yml` and GitHub Actions deploy workflow
- Same GCE infrastructure as other services

## Security

- Private keys never leave the authenticator
- WebAuthn rpId scoped to `flowindex.io`
- passkey-auth has rate limiting and audit logging
- Transaction details shown to user before signing approval
- Origin validation in passkey-auth allows `*.flowindex.io`

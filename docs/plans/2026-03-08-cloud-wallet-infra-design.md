# Cloud Wallet Infrastructure — Design Document

**Date:** 2026-03-08
**Scope:** Go backend endpoints, wallet app approval page, flowindex.io developer portal wallet tab, database schema

## Overview

Backend and frontend infrastructure to support the `agent-wallet` MCP server's cloud signing modes. The Go backend acts as an auth gateway and proxies actual signing to existing Supabase edge functions (`flow-keys`, `passkey-auth`).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Agent (MCP Server)                                   │
│  CloudSigner / PasskeySigner                          │
│     │                                                 │
│     ▼                                                 │
│  Go Backend  /api/v1/wallet/*                         │
│  ┌────────────────────────────────────────────┐      │
│  │ Agent Login Sessions (create/poll/complete) │      │
│  │ Wallet Info (proxy to edge functions)       │      │
│  │ Signing (proxy to flow-keys)               │      │
│  │ Passkey Approval Queue (create/poll)        │      │
│  │ Wallet API Keys (CRUD, wallet:sign scope)   │      │
│  │ Auth: Wallet JWT OR API Key                 │      │
│  └───────┬──────────────────┬─────────────────┘      │
│          │                  │                         │
│    ┌─────▼─────┐    ┌──────▼──────┐                  │
│    │ flow-keys  │    │ passkey-auth│                  │
│    │ (signing)  │    │ (accounts)  │                  │
│    └───────────┘    └─────────────┘                  │
│                                                       │
│  Wallet App  (wallet.flowindex.io)                    │
│  ┌────────────────────────────────────────────┐      │
│  │ /approve/:requestId — Passkey tx approval   │      │
│  │ Existing: Settings, Authn, Authz            │      │
│  └────────────────────────────────────────────┘      │
│                                                       │
│  flowindex.io Frontend                                │
│  ┌────────────────────────────────────────────┐      │
│  │ /developer/wallet — Wallet tab              │      │
│  │   Wallet API Keys (CRUD)                    │      │
│  │   Linked Accounts (view)                    │      │
│  │   Agent Sessions (view/revoke)              │      │
│  └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

## Go Backend — Wallet Endpoints

### Agent Login Flow

```
POST /api/v1/wallet/agent/login
  Auth: None (public)
  → Creates session { session_id, login_url, expires_in: 300 }
  → login_url = https://flowindex.io/agent/auth?session={session_id}

GET /api/v1/wallet/agent/login/{session_id}
  Auth: None (public, session_id is secret)
  → { status: "pending" | "completed", token?: "eyJ..." }
```

Login URL opens flowindex.io → user authenticates with passkey/email → Supabase session → frontend calls backend to bind session → backend issues scoped wallet JWT → MCP server polls and receives it.

### Wallet Info & Signing (proxy to edge functions)

```
GET /api/v1/wallet/me
  Auth: Wallet JWT OR API key with wallet:sign scope
  → Proxies to flow-keys /keys/list + passkey-auth /wallet/accounts
  → Returns { address, keys: [...], accounts: [...] }

POST /api/v1/wallet/sign
  Auth: Wallet JWT OR API key with wallet:sign scope
  Body: { message: "hex...", key_id: "uuid" }
  → Proxies to flow-keys /keys/sign
  → Returns { signature: "hex..." }
```

### Passkey Approval Queue

```
POST /api/v1/wallet/approve
  Auth: Wallet JWT
  Body: { cadence, args, description, tx_message_hex }
  → Stores pending approval
  → Returns { request_id, approve_url }
  → approve_url = https://wallet.flowindex.io/approve/{request_id}

GET /api/v1/wallet/approve/{id}
  Auth: Wallet JWT (agent polls)
  → { status: "pending" | "approved" | "rejected", signature?: "hex..." }

POST /api/v1/wallet/approve/{id}/sign
  Auth: Supabase JWT (wallet app, same user)
  Body: { signature: "hex...", credential_id: "..." }
  → Updates approval to "approved", stores signature
```

### Wallet API Keys

```
POST /api/v1/wallet/keys
  Auth: Supabase JWT
  → Creates API key with scopes: ["wallet:sign"]

GET /api/v1/wallet/keys
  Auth: Supabase JWT
  → Lists wallet API keys (filtered by wallet:sign scope)

DELETE /api/v1/wallet/keys/{id}
  Auth: Supabase JWT
```

Reuses existing `api_keys` table. Wallet keys have `["wallet:sign"]` in the scopes array.

## Database Schema

### New: `agent_login_sessions`

```sql
CREATE TABLE public.agent_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  wallet_token TEXT,
  callback_origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);
```

### New: `wallet_approval_requests`

```sql
CREATE TABLE public.wallet_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  tx_message_hex TEXT NOT NULL,
  cadence_script TEXT,
  cadence_args JSONB,
  description TEXT,
  signature TEXT,
  credential_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);
```

### Existing: `api_keys`

No schema change. Use `scopes` array: wallet keys get `["wallet:sign"]`.

## Wallet App — Approval Page

### New Route: `/approve/:requestId`

1. Fetches approval details from `GET /api/v1/wallet/approve/{requestId}`
2. Displays: template name, description, Cadence script, arguments, signer address
3. User clicks "Approve" → WebAuthn assertion (passkey signs tx message)
4. Calls `POST /api/v1/wallet/approve/{requestId}/sign` with signature
5. Agent polls and receives signature → submits tx

Reuses existing `@flowindex/flow-passkey` for WebAuthn and similar layout to `Authz.tsx`. Shows expiry countdown (5 min).

## flowindex.io Frontend — Developer Portal Wallet Tab

### New Route: `/developer/wallet`

Tab in existing `DeveloperLayout` alongside Keys, Endpoints, Subscriptions, Logs.

**Wallet API Keys** (top) — CRUD for keys with `wallet:sign` scope. Same pattern as `/developer/keys`.

**Linked Accounts** (middle) — Lists Flow accounts from passkey + custodial keys. Links to wallet app Settings for full management.

**Agent Sessions** (bottom) — Active agent login sessions with revoke capability.

## Auth & Security

### Authentication Matrix

| Endpoint | Auth |
|----------|------|
| `POST /wallet/agent/login` | None (public) |
| `GET /wallet/agent/login/{id}` | None (session_id is secret) |
| `GET /wallet/me` | Wallet JWT OR API key `wallet:sign` |
| `POST /wallet/sign` | Wallet JWT OR API key `wallet:sign` |
| `POST /wallet/approve` | Wallet JWT |
| `GET /wallet/approve/{id}` | Wallet JWT |
| `POST /wallet/approve/{id}/sign` | Supabase JWT (same user) |
| `CRUD /wallet/keys` | Supabase JWT |

### Wallet JWT

- Issued by Go backend after agent login completes
- Claims: `{ sub: user_id, scope: "wallet", exp: +24h }`
- Validated with `WALLET_JWT_SECRET` env var
- Distinct from Supabase session JWT

### Security Rules

- Agent login sessions: 5 min expiry
- Approval requests: 5 min expiry
- Wallet JWT: 24h expiry
- Signing always proxied to edge functions (encrypted keys never in Go)
- Passkey approval requires physical WebAuthn interaction
- Rate limiting via existing tier system

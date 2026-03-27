# Sim Studio Approval Queue — Phase 1

**Date**: 2026-03-26
**Status**: Draft
**Scope**: Phase 1 — Approval queue core + webhook notification + public approval API
**Depends on**: V1 (template discovery + simulation, PR #212)

## Context

Sim Studio agents can now discover templates and simulate transactions (V1). The missing piece is **human-in-the-loop approval** before execution. This is critical for autonomous agents managing real assets — the agent proposes a transaction, a human reviews and approves before it executes.

## Two Approval Modes

| Mode | Use Case | User Action | Signing |
|------|----------|-------------|---------|
| **approve-only** (default) | Autonomous agent with its own keys | Click approve/reject (bot button or callback URL) | Agent's configured signer executes |
| **passkey-sign** | User's personal assets | Open web page, sign with passkey | User's passkey signs the transaction |

Phase 1 delivers both modes for the queue, but only **approve-only** has full end-to-end execution. **passkey-sign** queues and approves, but the web signing page is deferred to Phase 2.

## Architecture

```
Agent / Workflow
  └── flow_queue_transaction (tool)
        ├── ApprovalStore (Redis primary, memory fallback)
        ├── Webhook notification (POST to user-provided URL)
        └── Returns pendingId + callback URLs

External (Bot / User / Webhook receiver)
  └── POST /api/approval/:id/approve?token=hmac
        ├── Validates HMAC token
        ├── approve-only: executes transaction via existing signer infrastructure
        └── passkey-sign: marks approved, returns needsSignature (Phase 2)

Studio Tools
  ├── flow_confirm_transaction — programmatic approve
  ├── flow_cancel_transaction — programmatic reject
  └── flow_list_pending — list pending transactions
```

## Data Model

```typescript
interface PendingTransaction {
  id: string                          // UUID v4
  workflowId?: string                 // Source workflow (if from block)
  workspaceId: string                 // Owning workspace
  userId: string                      // Submitter

  // Transaction content
  mode: 'approve-only' | 'passkey-sign'
  cadence: string                     // Cadence source code
  arguments: string                   // JSON-CDC args string
  network: 'mainnet' | 'testnet'
  signerAddress?: string              // Authorizer address (16-char hex)
  templateId?: string                 // Template name if from template

  // Signer config (captured at queue time for deferred execution)
  // For approve-only mode: stores the full signer params so execution
  // doesn't need workspace env var access at approval time.
  // Encrypted with AES-256-GCM using ENCRYPTION_KEY (existing encryption infra) before storage.
  signerConfig?: {
    signerMode: 'legacy' | 'cloud' | 'passkey'
    signerAddress?: string
    signerPrivateKey?: string         // Encrypted at rest
    signerKeyId?: string              // For cloud mode
    signerCredentialId?: string       // For passkey mode
  }

  // Simulation snapshot (optional, from V1 simulate tools)
  simulation?: {
    success: boolean
    events: Array<{ type: string; payload: unknown }>
    computationUsed: number
    balanceChanges: Array<{ address: string; token: string; delta: string }>
  }

  // Webhook config
  webhookUrl?: string                 // Where to POST notification
  callbackBaseUrl: string             // Derived from APPROVAL_BASE_URL env var at queue time

  // Status
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'
  createdAt: number                   // Unix timestamp ms
  expiresAt: number                   // Unix timestamp ms
  resolvedBy?: string                 // Who approved/rejected (userId for internal, "external" for public API)
  resolvedAt?: number                 // When resolved
  txId?: string                       // Transaction ID after execution
  error?: string                      // Execution error if any
}
```

## Storage Layer

```
ApprovalStore (interface)
  ├── RedisApprovalStore    — Primary. Key: approval:{workspaceId}:{id}, TTL auto-expiry
  └── MemoryApprovalStore   — Fallback. Map + setTimeout expiry, lost on restart
```

**Interface:**
```typescript
interface ApprovalStore {
  create(tx: PendingTransaction): Promise<void>
  get(workspaceId: string, id: string): Promise<PendingTransaction | null>
  list(workspaceId: string, status?: string): Promise<PendingTransaction[]>
  update(workspaceId: string, id: string, patch: Partial<PendingTransaction>): Promise<void>
  delete(workspaceId: string, id: string): Promise<void>
}
```

**Store selection:** Check if Redis is configured (`REDIS_URL` env var). If yes, use Redis. If not, use memory with a startup warning log.

**Redis key format:** `approval:{workspaceId}:{id}` with TTL from `expiresAt - now`. Additionally, maintain a Set `approval_index:{workspaceId}` as a secondary index for `list()` — avoids O(n) `KEYS` scan. Add/remove from the set on create/delete.

**Memory fallback:** `Map<string, PendingTransaction>` with lazy expiry — `get()` checks `expiresAt` and returns null (+ deletes) for expired entries. Also uses `setTimeout` as background cleanup, but does not rely on it for correctness.

Location: `apps/sim/lib/approval/store.ts`

## Tool Layer (4 tools)

### 1. `flow_queue_transaction`

- **Input**: `cadence`, `arguments`, `network`, `signerAddress?`, `templateId?`, `mode?` (default: approve-only), `webhookUrl?`, `expiresIn?` (seconds, default: 900)
- **Output**: `{pendingId, status, approvalUrl, rejectUrl, detailsUrl, expiresAt}`
- **Implementation**:
  1. Create PendingTransaction with UUID + computed expiresAt
  2. Store in ApprovalStore
  3. If `webhookUrl` provided, POST notification (non-blocking, log on failure)
  4. Return pendingId + HMAC-signed callback URLs
- **API Route**: `POST /api/tools/flow/queue-transaction`

### 2. `flow_confirm_transaction`

- **Input**: `pendingId`, `execute?` (bool, default: true)
- **Output**: `{success, status, txId?, error?}`
- **Implementation**:
  1. Get pending tx from store, verify status=pending and not expired
  2. Mark status=approved
  3. If execute=true AND mode=approve-only: decrypt signerConfig, resolve signer, call FCL mutate, mark status=executed with txId
  4. If execute=false: mark approved only, return `{status: "approved"}` — caller is responsible for subsequent execution (useful for workflows that need intermediate steps)
  5. If mode=passkey-sign: mark approved, return `{needsSignature: true, detailsUrl}` — Phase 2 web page handles signing
- **API Route**: `POST /api/tools/flow/confirm-transaction`

### 3. `flow_cancel_transaction`

- **Input**: `pendingId`, `reason?`
- **Output**: `{success, status}`
- **Implementation**: Mark status=rejected with reason
- **API Route**: `POST /api/tools/flow/cancel-transaction`

### 4. `flow_list_pending`

- **Input**: `status?` (filter)
- **Output**: `{transactions: PendingTransaction[]}`
- **Implementation**: List from store, filtered by workspace (from auth) and optional status
- **API Route**: `POST /api/tools/flow/list-pending`

## Block Layer (1 block)

### `flow_approval` block

**Type**: `flow_approval`, **Category**: `tools`

**SubBlocks:**

| SubBlock | Type | Condition | Description |
|----------|------|-----------|-------------|
| Action | dropdown | — | queue / confirm / cancel / list |
| Mode | dropdown | action=queue | approve-only / passkey-sign |
| Cadence | code | action=queue | Transaction code |
| Template ID | short-input | action=queue | Optional template name |
| Arguments | code | action=queue | Transaction arguments |
| Network | dropdown | action=queue | mainnet / testnet |
| Signer Address | short-input | action=queue | Optional, 16-char hex |
| Webhook URL | short-input | action=queue | Optional notification URL |
| Pending ID | short-input | action=confirm,cancel | Transaction to act on |
| Execute | dropdown | action=confirm | true / false |
| Status Filter | dropdown | action=list | all / pending / approved / rejected / expired |

**tools.config.tool** maps action → tool name:
- queue → `flow_queue_transaction`
- confirm → `flow_confirm_transaction`
- cancel → `flow_cancel_transaction`
- list → `flow_list_pending`

## Webhook Notification

When `flow_queue_transaction` is called with a `webhookUrl`, POST:

```json
{
  "type": "approval_requested",
  "pendingId": "uuid-xxx",
  "mode": "approve-only",
  "summary": {
    "templateId": "transfer_tokens_v3",
    "network": "mainnet",
    "signerAddress": "f8d6e0586b0a20c7",
    "arguments": {"amount": "100.0", "to": "abcdef1234567890"},
    "simulation": {
      "success": true,
      "balanceChanges": [{"token": "FlowToken", "delta": "-100.0"}]
    }
  },
  "actions": {
    "approve": "https://studio.flowindex.io/api/approval/{id}/approve?token={hmac}",
    "reject": "https://studio.flowindex.io/api/approval/{id}/reject?token={hmac}",
    "details": "https://studio.flowindex.io/approval/{id}?token={hmac}"
  },
  "expiresAt": "2026-03-26T17:15:00Z"
}
```

- Webhook POST is fire-and-forget (non-blocking, timeout 5s, log failures)
- `actions.details` URL exists in payload but the web page is Phase 2
- Webhook payload also sent on resolution: `type: "approval_resolved"` with `status: "approved" | "rejected"`

## Public Approval API

These endpoints are called by external systems (bots, webhook receivers, direct links). They do NOT use `checkInternalAuth`. Instead they use HMAC token validation.

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /api/approval/:id/approve` | POST | `?token=hmac` | Approve and optionally execute |
| `POST /api/approval/:id/reject` | POST | `?token=hmac` | Reject transaction |
| `GET /api/approval/:id` | GET | `?token=hmac` | View transaction details |

### HMAC Token

**Generation**: `HMAC-SHA256(pendingId + ":" + action + ":" + expiresAt, APPROVAL_SECRET)`

- Action-bound — approve token can't be used to reject, and vice versa
- Bound to specific pendingId — can't reuse for other transactions
- Expires with the pending transaction — no separate token TTL needed
- `APPROVAL_SECRET` **required** when approval tools are used — fail loudly if missing (auto-generation creates restart issues in containers)
- HTTPS-only recommended for `APPROVAL_BASE_URL` (tokens in query strings are logged by proxies)

**Validation** (in `apps/sim/lib/approval/token.ts`):
1. Extract `token` from query params
2. Determine action from route (approve/reject/view)
3. Recompute HMAC from stored pendingId + action + expiresAt
4. Timing-safe compare
5. Check transaction not expired

### Approve Execution Flow

When `/api/approval/:id/approve` is called for an `approve-only` transaction:

1. Validate HMAC token
2. Load PendingTransaction from store
3. Verify status=pending, not expired
4. Mark status=approved, resolvedAt=now
5. Decrypt `signerConfig` from the stored PendingTransaction (AES-256-GCM with `APPROVAL_SECRET`), pass to `resolveSignerFromParams` from `apps/sim/lib/flow/signer-resolver.ts`
6. Configure FCL, call `fcl.mutate()` with cadence + arguments + signer
7. Wait for seal
8. Mark status=executed, record txId
9. If webhookUrl set, POST resolution notification
10. Return `{success: true, txId}`

If execution fails: mark status=approved (not executed), record error, return error.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APPROVAL_SECRET` | **required** | HMAC signing key for callback tokens only. Must be set explicitly — no auto-generation (container restarts invalidate tokens). Signer credentials use separate `ENCRYPTION_KEY` (existing infra) |
| `APPROVAL_TTL` | `900` | Default expiration in seconds |
| `APPROVAL_BASE_URL` | `https://studio.flowindex.io` | Base URL for callback URLs in webhook payloads |

## Files to Create

**Core (4):**
```
apps/sim/lib/approval/types.ts       — PendingTransaction interface, ApprovalStore interface
apps/sim/lib/approval/store.ts       — RedisApprovalStore + MemoryApprovalStore
apps/sim/lib/approval/service.ts     — Business logic: create, approve, reject, list, webhook notify
apps/sim/lib/approval/token.ts       — HMAC token generation + validation
```

**Public API (3):**
```
apps/sim/app/api/approval/[id]/approve/route.ts
apps/sim/app/api/approval/[id]/reject/route.ts
apps/sim/app/api/approval/[id]/route.ts
```

**Tool routes (4):**
```
apps/sim/app/api/tools/flow/queue-transaction/route.ts
apps/sim/app/api/tools/flow/confirm-transaction/route.ts
apps/sim/app/api/tools/flow/cancel-transaction/route.ts
apps/sim/app/api/tools/flow/list-pending/route.ts
```

**Tool definitions (4):**
```
apps/sim/tools/flow/queue_transaction.ts
apps/sim/tools/flow/confirm_transaction.ts
apps/sim/tools/flow/cancel_transaction.ts
apps/sim/tools/flow/list_pending.ts
```

**Block (1):**
```
apps/sim/blocks/blocks/flow_approval.ts
```

**Modified (3):**
```
apps/sim/tools/flow/index.ts     — add 4 new exports
apps/sim/tools/registry.ts       — register 4 new tools
apps/sim/blocks/registry.ts      — register 1 new block
```

## Typical Flows

### Agent autonomous flow
```
Agent: flow_simulate_template("transfer_tokens_v3", {amount: "100.0", to: "abc..."})
  → simulation passes
Agent: flow_queue_transaction(cadence, args, webhookUrl="https://hooks.slack.com/xxx")
  → pendingId returned, Slack notified with approve/reject links
User: clicks approve link in Slack
  → POST /api/approval/{id}/approve?token=hmac
  → transaction executed, txId returned
```

### Workflow with manual gate
```
[flow_templates (get)] → [flow_simulate] → [flow_approval (queue, webhookUrl)]
                                                    ↓
                                          webhook → Telegram bot → user approves
                                                    ↓
                                          callback → auto-execute → done
```

### Programmatic confirm (agent decides)
```
Agent: flow_queue_transaction(cadence, args)  // no webhook
Agent: flow_list_pending()                    // check queue
Agent: flow_confirm_transaction(pendingId)    // approve + execute
```

## Phase 2 Scope (Deferred)

- **Telegram bot**: Inline keyboard with approve/reject buttons, calls approval API
- **Discord bot**: Button components with approve/reject, calls approval API
- **Web approval page**: `studio.flowindex.io/approval/:id` — shows tx summary, passkey-sign support
- **Studio UI panel**: Pending transactions dashboard within workspace settings

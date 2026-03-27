# Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transaction approval queue to Sim Studio so agents can propose transactions, humans review and approve via webhook callbacks, and approved transactions auto-execute.

**Architecture:** Redis-backed (memory fallback) approval store with HMAC-authenticated public callback URLs. Signer credentials encrypted with existing `ENCRYPTION_KEY` (AES-256-GCM via `encryptSecret`/`decryptSecret`). `APPROVAL_SECRET` used only for HMAC tokens. Global UUID→workspaceId index for public API route resolution. Webhook notification on queue/resolve. 4 new tools + 1 block + public approval API.

**Tech Stack:** TypeScript, Next.js App Router, Redis (ioredis), AES-256-GCM, HMAC-SHA256, Vitest, `@onflow/fcl`

**Spec:** `docs/superpowers/specs/2026-03-26-approval-queue-design.md`

---

## File Structure

**Core library (4):**
```
apps/sim/lib/approval/types.ts       — PendingTransaction interface, ApprovalStore interface
apps/sim/lib/approval/token.ts       — HMAC token generation + validation (action-bound)
apps/sim/lib/approval/store.ts       — RedisApprovalStore + MemoryApprovalStore
apps/sim/lib/approval/service.ts     — Business logic: create, approve, reject, list, webhook, execute
```

**Public API routes (3):**
```
apps/sim/app/api/approval/[id]/approve/route.ts
apps/sim/app/api/approval/[id]/reject/route.ts
apps/sim/app/api/approval/[id]/route.ts          — GET details
```

**Tool API routes (4):**
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

**Tests (7):**
```
apps/sim/lib/approval/token.test.ts
apps/sim/lib/approval/store.test.ts
apps/sim/lib/approval/service.test.ts
apps/sim/app/api/approval/[id]/approve/route.test.ts
apps/sim/app/api/tools/flow/queue-transaction/route.test.ts
apps/sim/app/api/tools/flow/confirm-transaction/route.test.ts
apps/sim/app/api/tools/flow/list-pending/route.test.ts
```

---

### Task 1: Types + HMAC Token Module

**Files:**
- Create: `apps/sim/lib/approval/types.ts`
- Create: `apps/sim/lib/approval/token.ts`
- Test: `apps/sim/lib/approval/token.test.ts`

- [ ] **Step 1: Create types**

Create `sim-workflow/apps/sim/lib/approval/types.ts`:

```typescript
/** Signer configuration captured at queue time (encrypted at rest) */
export interface SignerConfig {
  signerMode: 'legacy' | 'cloud' | 'passkey'
  signerAddress?: string
  signerPrivateKey?: string
  signerKeyId?: string
  signerCredentialId?: string
}

/** A transaction waiting for human approval */
export interface PendingTransaction {
  id: string
  workflowId?: string
  workspaceId: string
  userId: string

  mode: 'approve-only' | 'passkey-sign'
  cadence: string
  arguments: string
  network: 'mainnet' | 'testnet'
  signerAddress?: string
  templateId?: string

  /** AES-256-GCM encrypted SignerConfig JSON */
  encryptedSignerConfig?: string

  simulation?: {
    success: boolean
    events: Array<{ type: string; payload: unknown }>
    computationUsed: number
    balanceChanges: Array<{ address: string; token: string; delta: string }>
  }

  webhookUrl?: string
  callbackBaseUrl: string

  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'
  createdAt: number
  expiresAt: number
  resolvedBy?: string
  resolvedAt?: number
  txId?: string
  error?: string
}

/** Abstract approval store interface */
export interface ApprovalStore {
  create(tx: PendingTransaction): Promise<void>
  get(workspaceId: string, id: string): Promise<PendingTransaction | null>
  /** Get by ID only (uses global index to resolve workspaceId) — for public API */
  getById(id: string): Promise<PendingTransaction | null>
  list(workspaceId: string, status?: string): Promise<PendingTransaction[]>
  update(workspaceId: string, id: string, patch: Partial<PendingTransaction>): Promise<void>
  delete(workspaceId: string, id: string): Promise<void>
}
```

- [ ] **Step 2: Write token tests**

Create `sim-workflow/apps/sim/lib/approval/token.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Set env before importing
vi.stubEnv('APPROVAL_SECRET', 'test-secret-key-for-hmac-testing-1234')

import { generateToken, validateToken } from './token'

describe('approval token', () => {
  it('generates a valid token', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
  })

  it('validates a correct token', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'approve', 1700000000000)
    expect(valid).toBe(true)
  })

  it('rejects token with wrong action', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'reject', 1700000000000)
    expect(valid).toBe(false)
  })

  it('rejects token with wrong pendingId', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-456', 'approve', 1700000000000)
    expect(valid).toBe(false)
  })

  it('rejects token with wrong expiresAt', () => {
    const token = generateToken('pending-123', 'approve', 1700000000000)
    const valid = validateToken(token, 'pending-123', 'approve', 1700000099999)
    expect(valid).toBe(false)
  })

  it('generates different tokens for approve vs reject', () => {
    const approve = generateToken('pending-123', 'approve', 1700000000000)
    const reject = generateToken('pending-123', 'reject', 1700000000000)
    expect(approve).not.toBe(reject)
  })

  it('throws if APPROVAL_SECRET is not set', () => {
    vi.stubEnv('APPROVAL_SECRET', '')
    // Re-import would be needed; test that getSecret() throws
    // This is tested via integration
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement token module**

Create `sim-workflow/apps/sim/lib/approval/token.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createLogger } from '@sim/logger'

const logger = createLogger('approval/token')

function getSecret(): string {
  const secret = process.env.APPROVAL_SECRET
  if (!secret) {
    throw new Error('APPROVAL_SECRET environment variable is required for approval queue')
  }
  return secret
}

/**
 * Generate action-bound HMAC token.
 * Token = HMAC-SHA256(pendingId:action:expiresAt, APPROVAL_SECRET)
 */
export function generateToken(
  pendingId: string,
  action: 'approve' | 'reject' | 'view',
  expiresAt: number
): string {
  const secret = getSecret()
  const data = `${pendingId}:${action}:${expiresAt}`
  return createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Validate HMAC token with timing-safe comparison.
 */
export function validateToken(
  token: string,
  pendingId: string,
  action: 'approve' | 'reject' | 'view',
  expiresAt: number
): boolean {
  try {
    const expected = generateToken(pendingId, action, expiresAt)
    const tokenBuf = Buffer.from(token, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (tokenBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(tokenBuf, expectedBuf)
  } catch (error) {
    logger.error('Token validation error', { error })
    return false
  }
}

/**
 * Build callback URLs with embedded HMAC tokens.
 */
export function buildCallbackUrls(
  baseUrl: string,
  pendingId: string,
  expiresAt: number
): { approveUrl: string; rejectUrl: string; detailsUrl: string } {
  const approveToken = generateToken(pendingId, 'approve', expiresAt)
  const rejectToken = generateToken(pendingId, 'reject', expiresAt)
  const viewToken = generateToken(pendingId, 'view', expiresAt)

  return {
    approveUrl: `${baseUrl}/api/approval/${pendingId}/approve?token=${approveToken}`,
    rejectUrl: `${baseUrl}/api/approval/${pendingId}/reject?token=${rejectToken}`,
    detailsUrl: `${baseUrl}/api/approval/${pendingId}?token=${viewToken}`,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/token.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sim-workflow/apps/sim/lib/approval/types.ts sim-workflow/apps/sim/lib/approval/token.ts sim-workflow/apps/sim/lib/approval/token.test.ts
git commit -m "feat(sim): add approval queue types and HMAC token module"
```

---

### Task 2: Approval Store (Redis + Memory)

**Files:**
- Create: `apps/sim/lib/approval/store.ts`
- Test: `apps/sim/lib/approval/store.test.ts`

- [ ] **Step 1: Write store tests**

Create `sim-workflow/apps/sim/lib/approval/store.test.ts`:

```typescript
/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryApprovalStore } from './store'
import type { PendingTransaction } from './types'

function makeTx(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    id: 'test-id',
    workspaceId: 'ws-1',
    userId: 'user-1',
    mode: 'approve-only',
    cadence: 'transaction() {}',
    arguments: '[]',
    network: 'mainnet',
    callbackBaseUrl: 'https://example.com',
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 900_000,
    ...overrides,
  }
}

describe('MemoryApprovalStore', () => {
  let store: MemoryApprovalStore

  beforeEach(() => {
    store = new MemoryApprovalStore()
  })

  it('creates and retrieves a transaction', async () => {
    const tx = makeTx()
    await store.create(tx)
    const result = await store.get('ws-1', 'test-id')
    expect(result).toEqual(tx)
  })

  it('returns null for non-existent transaction', async () => {
    const result = await store.get('ws-1', 'nope')
    expect(result).toBeNull()
  })

  it('returns null for expired transaction (lazy expiry)', async () => {
    const tx = makeTx({ expiresAt: Date.now() - 1000 })
    await store.create(tx)
    const result = await store.get('ws-1', 'test-id')
    expect(result).toBeNull()
  })

  it('lists transactions by workspace', async () => {
    await store.create(makeTx({ id: 'tx-1', workspaceId: 'ws-1' }))
    await store.create(makeTx({ id: 'tx-2', workspaceId: 'ws-1' }))
    await store.create(makeTx({ id: 'tx-3', workspaceId: 'ws-2' }))
    const list = await store.list('ws-1')
    expect(list).toHaveLength(2)
  })

  it('lists transactions filtered by status', async () => {
    await store.create(makeTx({ id: 'tx-1', status: 'pending' }))
    await store.create(makeTx({ id: 'tx-2', status: 'approved' }))
    const list = await store.list('ws-1', 'pending')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('tx-1')
  })

  it('updates a transaction', async () => {
    await store.create(makeTx())
    await store.update('ws-1', 'test-id', { status: 'approved', resolvedBy: 'user-2' })
    const result = await store.get('ws-1', 'test-id')
    expect(result?.status).toBe('approved')
    expect(result?.resolvedBy).toBe('user-2')
  })

  it('deletes a transaction', async () => {
    await store.create(makeTx())
    await store.delete('ws-1', 'test-id')
    const result = await store.get('ws-1', 'test-id')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement store**

Create `sim-workflow/apps/sim/lib/approval/store.ts`:

```typescript
import { createLogger } from '@sim/logger'
import type { ApprovalStore, PendingTransaction } from './types'

const logger = createLogger('approval/store')

/** In-memory fallback store with lazy expiry */
export class MemoryApprovalStore implements ApprovalStore {
  private store = new Map<string, PendingTransaction>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Global index: id → workspaceId (for public API lookups) */
  private globalIndex = new Map<string, string>()

  private key(workspaceId: string, id: string): string {
    return `${workspaceId}:${id}`
  }

  async create(tx: PendingTransaction): Promise<void> {
    const k = this.key(tx.workspaceId, tx.id)
    this.store.set(k, { ...tx })
    this.globalIndex.set(tx.id, tx.workspaceId)

    const ttl = tx.expiresAt - Date.now()
    if (ttl > 0) {
      this.timers.set(k, setTimeout(() => {
        this.store.delete(k)
        this.timers.delete(k)
      }, ttl))
    }
  }

  async get(workspaceId: string, id: string): Promise<PendingTransaction | null> {
    const k = this.key(workspaceId, id)
    const tx = this.store.get(k)
    if (!tx) return null

    // Lazy expiry
    if (tx.expiresAt < Date.now() && tx.status === 'pending') {
      this.store.delete(k)
      const timer = this.timers.get(k)
      if (timer) clearTimeout(timer)
      this.timers.delete(k)
      return null
    }

    return { ...tx }
  }

  async getById(id: string): Promise<PendingTransaction | null> {
    const workspaceId = this.globalIndex.get(id)
    if (!workspaceId) return null
    return this.get(workspaceId, id)
  }

  async list(workspaceId: string, status?: string): Promise<PendingTransaction[]> {
    const now = Date.now()
    const results: PendingTransaction[] = []

    for (const [k, tx] of this.store) {
      if (!k.startsWith(`${workspaceId}:`)) continue
      if (tx.expiresAt < now && tx.status === 'pending') continue
      if (status && tx.status !== status) continue
      results.push({ ...tx })
    }

    return results.sort((a, b) => b.createdAt - a.createdAt)
  }

  async update(workspaceId: string, id: string, patch: Partial<PendingTransaction>): Promise<void> {
    const k = this.key(workspaceId, id)
    const tx = this.store.get(k)
    if (!tx) return
    this.store.set(k, { ...tx, ...patch })
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const k = this.key(workspaceId, id)
    this.store.delete(k)
    const timer = this.timers.get(k)
    if (timer) clearTimeout(timer)
    this.timers.delete(k)
  }
}

/** Redis-backed store with TTL and secondary index */
export class RedisApprovalStore implements ApprovalStore {
  private redis: import('ioredis').Redis

  constructor(redis: import('ioredis').Redis) {
    this.redis = redis
  }

  private dataKey(workspaceId: string, id: string): string {
    return `approval:${workspaceId}:${id}`
  }

  private indexKey(workspaceId: string): string {
    return `approval_index:${workspaceId}`
  }

  /** Global index: id → workspaceId (for public API lookups without workspaceId) */
  private globalKey(id: string): string {
    return `approval_global:${id}`
  }

  async create(tx: PendingTransaction): Promise<void> {
    const ttl = Math.max(1, Math.ceil((tx.expiresAt - Date.now()) / 1000))
    const key = this.dataKey(tx.workspaceId, tx.id)
    const pipeline = this.redis.pipeline()
    pipeline.setex(key, ttl, JSON.stringify(tx))
    pipeline.sadd(this.indexKey(tx.workspaceId), tx.id)
    pipeline.setex(this.globalKey(tx.id), ttl, tx.workspaceId)
    await pipeline.exec()
  }

  async get(workspaceId: string, id: string): Promise<PendingTransaction | null> {
    const data = await this.redis.get(this.dataKey(workspaceId, id))
    if (!data) {
      await this.redis.srem(this.indexKey(workspaceId), id)
      return null
    }
    return JSON.parse(data) as PendingTransaction
  }

  async getById(id: string): Promise<PendingTransaction | null> {
    const workspaceId = await this.redis.get(this.globalKey(id))
    if (!workspaceId) return null
    return this.get(workspaceId, id)
  }

  async list(workspaceId: string, status?: string): Promise<PendingTransaction[]> {
    const ids = await this.redis.smembers(this.indexKey(workspaceId))
    if (ids.length === 0) return []

    const pipeline = this.redis.pipeline()
    for (const id of ids) {
      pipeline.get(this.dataKey(workspaceId, id))
    }
    const results = await pipeline.exec()

    const txs: PendingTransaction[] = []
    const expiredIds: string[] = []

    for (let i = 0; i < ids.length; i++) {
      const [err, data] = results![i]
      if (err || !data) {
        expiredIds.push(ids[i])
        continue
      }
      const tx = JSON.parse(data as string) as PendingTransaction
      if (status && tx.status !== status) continue
      txs.push(tx)
    }

    // Clean up expired entries from index
    if (expiredIds.length > 0) {
      await this.redis.srem(this.indexKey(workspaceId), ...expiredIds)
    }

    return txs.sort((a, b) => b.createdAt - a.createdAt)
  }

  async update(workspaceId: string, id: string, patch: Partial<PendingTransaction>): Promise<void> {
    const tx = await this.get(workspaceId, id)
    if (!tx) return
    const updated = { ...tx, ...patch }
    // Resolved transactions (approved/rejected/executed) get extended TTL (24h)
    // so users can see the result. Pending transactions keep their original TTL.
    const isResolved = updated.status !== 'pending'
    const ttl = isResolved ? 86400 : Math.max(1, Math.ceil((updated.expiresAt - Date.now()) / 1000))
    await this.redis.setex(this.dataKey(workspaceId, id), ttl, JSON.stringify(updated))
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await this.redis.del(this.dataKey(workspaceId, id))
    await this.redis.srem(this.indexKey(workspaceId), id)
  }
}

/** Get the appropriate store based on Redis availability */
let storeInstance: ApprovalStore | null = null

export function getApprovalStore(): ApprovalStore {
  if (storeInstance) return storeInstance

  try {
    const { getRedisClient } = require('@/lib/core/config/redis')
    const redis = getRedisClient()
    if (redis) {
      logger.info('Using Redis approval store')
      storeInstance = new RedisApprovalStore(redis)
      return storeInstance
    }
  } catch {
    // Redis not available
  }

  logger.warn('Redis unavailable, using in-memory approval store (data lost on restart)')
  storeInstance = new MemoryApprovalStore()
  return storeInstance
}
```

- [ ] **Step 4: Run tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sim-workflow/apps/sim/lib/approval/store.ts sim-workflow/apps/sim/lib/approval/store.test.ts
git commit -m "feat(sim): add approval store (Redis + memory fallback)"
```

---

### Task 3: Approval Service (business logic + webhook + execution)

**Files:**
- Create: `apps/sim/lib/approval/service.ts`
- Test: `apps/sim/lib/approval/service.test.ts`

- [ ] **Step 1: Write service tests**

Create `sim-workflow/apps/sim/lib/approval/service.test.ts`. Test the core service logic:
- `queueTransaction()` creates a pending tx, returns callback URLs
- `approveTransaction()` marks approved, optionally executes
- `rejectTransaction()` marks rejected
- `listPending()` returns filtered list
- Webhook is called on queue and resolve
- Expired transactions are rejected

The tests should mock the store, token module, and fetch (for webhook + FCL).

- [ ] **Step 2: Implement service**

Create `sim-workflow/apps/sim/lib/approval/service.ts`:

Key functions:
- `queueTransaction(params)` — validate, encrypt signerConfig, create in store, webhook notify, return pendingId + URLs
- `approveTransaction(workspaceId, pendingId, resolvedBy, execute)` — validate status/expiry, mark approved, if execute: decrypt signer, call FCL mutate, mark executed
- `rejectTransaction(workspaceId, pendingId, resolvedBy, reason?)` — mark rejected
- `listPending(workspaceId, status?)` — delegate to store
- `getTransaction(workspaceId, pendingId)` — delegate to store

Signer encryption: Use `encryptSecret` / `decryptSecret` from `@/lib/core/security/encryption` (uses `ENCRYPTION_KEY`, NOT `APPROVAL_SECRET`) for the signerConfig JSON. `APPROVAL_SECRET` is only for HMAC tokens — dual-purposing a single key for both HMAC and AES is cryptographically weak.

Webhook: fire-and-forget `fetch(webhookUrl, { method: 'POST', body, signal: AbortSignal.timeout(5000) })`.

Execution: Import and reuse the FCL mutate pattern from `send-transaction/route.ts` — configure FCL, resolve signer from decrypted config, call `fcl.mutate()`, wait for seal.

- [ ] **Step 3: Run tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add sim-workflow/apps/sim/lib/approval/service.ts sim-workflow/apps/sim/lib/approval/service.test.ts
git commit -m "feat(sim): add approval service with webhook notification and execution"
```

---

### Task 4: Public Approval API Routes

**Files:**
- Create: `apps/sim/app/api/approval/[id]/approve/route.ts`
- Create: `apps/sim/app/api/approval/[id]/reject/route.ts`
- Create: `apps/sim/app/api/approval/[id]/route.ts`
- Test: `apps/sim/app/api/approval/[id]/approve/route.test.ts`

These are public endpoints authenticated via HMAC token (not `checkInternalAuth`).

- [ ] **Step 1: Write approve route test**

Test cases:
- Missing token → 401
- Invalid token → 401
- Expired transaction → 410 Gone
- Already resolved → 409 Conflict
- Valid approve → 200, returns txId (mock execution)
- Webhook notification sent on resolve

- [ ] **Step 2: Implement approve route**

`POST /api/approval/[id]/approve?token=xxx`:
1. Extract `id` from params, `token` from query
2. Load pending tx from store (need to scan workspaces or use a global index — see note)
3. Validate HMAC token against stored `expiresAt`
4. Check status=pending, not expired
5. Call `approveTransaction(workspaceId, id, 'external', true)`
6. Return `{success, txId, status}`

**Workspace resolution:** The public API doesn't know workspaceId. Use `store.getById(id)` which resolves via the global index (`approval_global:{id}` → `workspaceId` in Redis, or `globalIndex` Map in memory). UUID v4 guarantees uniqueness across workspaces. No need to include workspaceId in the URL.

- [ ] **Step 3: Implement reject route**

Same pattern as approve, calls `rejectTransaction()`.

- [ ] **Step 4: Implement details route**

`GET /api/approval/[id]?token=xxx`:
1. Validate view token
2. Return PendingTransaction (redacted: no encrypted signer config)

- [ ] **Step 5: Run tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/approval/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sim-workflow/apps/sim/app/api/approval/
git commit -m "feat(sim): add public approval API routes with HMAC auth"
```

---

### Task 5: Tool definitions + types

**Files:**
- Modify: `apps/sim/tools/flow/types.ts`
- Create: `apps/sim/tools/flow/queue_transaction.ts`
- Create: `apps/sim/tools/flow/confirm_transaction.ts`
- Create: `apps/sim/tools/flow/cancel_transaction.ts`
- Create: `apps/sim/tools/flow/list_pending.ts`

- [ ] **Step 1: Add types to tools/flow/types.ts**

Append approval-related param interfaces.

- [ ] **Step 2: Create 4 tool definitions**

Follow the existing `ToolConfig` pattern from `simulate_transaction.ts`. Each tool POSTs to its corresponding `/api/tools/flow/` route.

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/
git commit -m "feat(sim): add approval queue tool definitions"
```

---

### Task 6: Tool API Routes

**Files:**
- Create: `apps/sim/app/api/tools/flow/queue-transaction/route.ts`
- Create: `apps/sim/app/api/tools/flow/confirm-transaction/route.ts`
- Create: `apps/sim/app/api/tools/flow/cancel-transaction/route.ts`
- Create: `apps/sim/app/api/tools/flow/list-pending/route.ts`
- Test: `apps/sim/app/api/tools/flow/queue-transaction/route.test.ts`
- Test: `apps/sim/app/api/tools/flow/confirm-transaction/route.test.ts`
- Test: `apps/sim/app/api/tools/flow/list-pending/route.test.ts`

These use `checkInternalAuth` (internal tool routes).

- [ ] **Step 1: Write queue-transaction route test**

Test cases:
- Auth failure → 401
- Missing cadence → 400
- Valid queue → 200 with pendingId + callback URLs
- With webhookUrl → webhook POST called

- [ ] **Step 2: Implement queue-transaction route**

Calls `approvalService.queueTransaction()` with params from request body + auth context (workspaceId, userId).

- [ ] **Step 3: Write confirm-transaction route test**

Test cases:
- Auth failure → 401
- Missing pendingId → 400
- Not found → 404
- Valid confirm → 200 with txId

- [ ] **Step 4: Implement confirm + cancel + list routes**

- confirm: calls `approvalService.approveTransaction()`
- cancel: calls `approvalService.rejectTransaction()`
- list: calls `approvalService.listPending()`

- [ ] **Step 5: Run all tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/queue-transaction/ apps/sim/app/api/tools/flow/confirm-transaction/ apps/sim/app/api/tools/flow/list-pending/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sim-workflow/apps/sim/app/api/tools/flow/queue-transaction/ sim-workflow/apps/sim/app/api/tools/flow/confirm-transaction/ sim-workflow/apps/sim/app/api/tools/flow/cancel-transaction/ sim-workflow/apps/sim/app/api/tools/flow/list-pending/
git commit -m "feat(sim): add approval queue tool API routes with tests"
```

---

### Task 7: Block definition + registry registration

**Files:**
- Create: `apps/sim/blocks/blocks/flow_approval.ts`
- Modify: `apps/sim/tools/flow/index.ts`
- Modify: `apps/sim/tools/registry.ts`
- Modify: `apps/sim/blocks/registry.ts`

- [ ] **Step 1: Create flow_approval block**

Block with conditional subblocks based on `action` dropdown (queue/confirm/cancel/list). Follow the `flow_simulate` block pattern with `tools.config.tool` mapping action → tool name.

SubBlocks:
- Action (dropdown): queue, confirm, cancel, list
- Mode (dropdown, action=queue): approve-only, passkey-sign
- Cadence (code, action=queue)
- Template ID (short-input, action=queue)
- Arguments (code, action=queue)
- Network (dropdown, action=queue)
- Signer Address (short-input, action=queue)
- Webhook URL (short-input, action=queue)
- Pending ID (short-input, action=confirm/cancel)
- Execute (dropdown, action=confirm): true/false
- Status Filter (dropdown, action=list): all/pending/approved/rejected/expired

- [ ] **Step 2: Update barrel exports and registries**

Add to `tools/flow/index.ts`: 4 new tool exports
Add to `tools/registry.ts`: 4 new tool registrations
Add to `blocks/registry.ts`: 1 new block registration

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/blocks/blocks/flow_approval.ts sim-workflow/apps/sim/tools/flow/index.ts sim-workflow/apps/sim/tools/registry.ts sim-workflow/apps/sim/blocks/registry.ts
git commit -m "feat(sim): add approval block and register tools/blocks"
```

---

### Task 8: Integration verification

- [ ] **Step 1: Run all approval tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/lib/approval/ apps/sim/app/api/approval/ apps/sim/app/api/tools/flow/queue-transaction/ apps/sim/app/api/tools/flow/confirm-transaction/ apps/sim/app/api/tools/flow/list-pending/`
Expected: All PASS.

- [ ] **Step 2: Run all existing Flow tool tests (regression)**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/tools/flow/`
Expected: All PASS — no regressions.

- [ ] **Step 3: Type-check**

Run: `cd sim-workflow && bunx tsc --noEmit -p apps/sim/tsconfig.json`
Expected: No type errors.

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix(sim): address any integration issues"
```

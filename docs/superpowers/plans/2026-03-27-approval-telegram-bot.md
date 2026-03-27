# Telegram Approval Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Telegram bot that sends transaction approval notifications with inline Approve/Reject buttons, calling Phase 1's HMAC-authenticated approval API.

**Architecture:** Two parts: (1) Studio-side notification APIs for user binding (`/connect` flow) and webhook payload extension, (2) standalone bot service receiving approval webhooks, sending Telegram messages with inline keyboards, and handling button callbacks. Bot reads bindings from shared DB and persists callback URLs to survive restarts.

**Tech Stack:** TypeScript, Bun, Hono (HTTP server), Telegram Bot API (direct HTTP, no framework), PostgreSQL (shared with Sim Studio), Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-approval-telegram-bot-design.md`
**Depends on:** Phase 1 Approval Queue (PR #213)

---

## File Structure

**Bot service (new project, 8 files):**
```
services/approval-bot/
├── package.json
├── tsconfig.json
├── Dockerfile
├── src/
│   ├── index.ts              — HTTP server entry point (Hono)
│   ├── telegram.ts           — Telegram Bot API wrapper
│   ├── db.ts                 — DB queries (bindings read, pending_approvals CRUD)
│   ├── handlers/
│   │   ├── commands.ts       — /start, /connect, /disconnect
│   │   ├── callback.ts       — Button click → call approval API → edit message
│   │   └── approval.ts       — Incoming webhook → look up binding → send notification
│   └── schema.sql            — pending_approvals table DDL
```

**Studio-side (4 new files, 1 modified):**
```
apps/sim/app/api/notifications/connect/route.ts       — Generate connect code
apps/sim/app/api/notifications/verify/route.ts         — Verify code + create binding
apps/sim/app/api/notifications/bindings/route.ts       — List bindings (GET), delete (DELETE)
apps/sim/lib/notifications/connect-codes.ts            — In-memory code store with TTL
apps/sim/lib/approval/service.ts                       — Add userId/workspaceId to webhook payload (modify)
```

**Database migration (1 file):**
```
Studio DB: notification_bindings table (via Drizzle schema or raw SQL)
Bot DB: pending_approvals table (bot's schema.sql, same DB instance)
```

---

### Task 1: Studio-side — Connect code generation + verification APIs

**Files:**
- Create: `apps/sim/lib/notifications/connect-codes.ts`
- Create: `apps/sim/app/api/notifications/connect/route.ts`
- Create: `apps/sim/app/api/notifications/verify/route.ts`
- Create: `apps/sim/app/api/notifications/bindings/route.ts`

- [ ] **Step 1: Create in-memory connect code store**

Create `sim-workflow/apps/sim/lib/notifications/connect-codes.ts`:

```typescript
import { createLogger } from '@sim/logger'
import { randomBytes } from 'node:crypto'

const logger = createLogger('notifications/connect-codes')

interface ConnectCode {
  userId: string
  workspaceId: string
  expiresAt: number
}

const codes = new Map<string, ConnectCode>()

/** Generate a 6-char alphanumeric code, TTL 5 minutes */
export function generateConnectCode(userId: string, workspaceId: string): string {
  const code = randomBytes(3).toString('hex').toUpperCase() // 6 hex chars
  const expiresAt = Date.now() + 5 * 60 * 1000
  codes.set(code, { userId, workspaceId, expiresAt })

  // Cleanup timer
  setTimeout(() => codes.delete(code), 5 * 60 * 1000)

  return code
}

/** Verify and consume a code. Returns null if invalid/expired. */
export function consumeConnectCode(code: string): ConnectCode | null {
  const entry = codes.get(code.toUpperCase())
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    codes.delete(code.toUpperCase())
    return null
  }
  codes.delete(code.toUpperCase()) // Single-use
  return entry
}
```

- [ ] **Step 2: Create connect route**

Create `sim-workflow/apps/sim/app/api/notifications/connect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateConnectCode } from '@/lib/notifications/connect-codes'
import { createLogger } from '@sim/logger'

const logger = createLogger('notifications/connect')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const workspaceId = request.headers.get('x-workspace-id') || 'default'
    const code = generateConnectCode(auth.userId!, workspaceId)

    return NextResponse.json({
      success: true,
      output: {
        code,
        instructions: `Send /connect ${code} to @FlowIndexBot on Telegram`,
        expiresIn: 300,
      },
    })
  } catch (error) {
    logger.error('Failed to generate connect code', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Create verify route**

Create `sim-workflow/apps/sim/app/api/notifications/verify/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { consumeConnectCode } from '@/lib/notifications/connect-codes'
import { createLogger } from '@sim/logger'

const logger = createLogger('notifications/verify')

// Rate limit: track attempts per channelUserId
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000

function checkRateLimit(channelUserId: string): boolean {
  const now = Date.now()
  const entry = attempts.get(channelUserId)
  if (!entry || entry.resetAt < now) {
    attempts.set(channelUserId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_ATTEMPTS) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  // Auth: bot service token (not user session)
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.BOT_SERVICE_TOKEN
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { code, channel, channelUserId } = body

    if (!code || !channel || !channelUserId) {
      return NextResponse.json(
        { success: false, error: 'code, channel, and channelUserId are required' },
        { status: 400 }
      )
    }

    if (!checkRateLimit(channelUserId)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Try again in a minute.' },
        { status: 429 }
      )
    }

    const entry = consumeConnectCode(code)
    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 404 }
      )
    }

    // Insert notification_bindings row
    // Uses drizzle or raw SQL depending on project patterns
    const { db } = await import('@sim/db')
    await db.execute(
      `INSERT INTO simstudio.notification_bindings (user_id, workspace_id, channel, channel_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, workspace_id, channel)
       DO UPDATE SET channel_user_id = EXCLUDED.channel_user_id, created_at = now()`,
      [entry.userId, entry.workspaceId, channel, channelUserId]
    )

    return NextResponse.json({
      success: true,
      userId: entry.userId,
      workspaceId: entry.workspaceId,
    })
  } catch (error) {
    logger.error('Failed to verify connect code', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Create bindings route (list + delete)**

Create `sim-workflow/apps/sim/app/api/notifications/bindings/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { createLogger } from '@sim/logger'

const logger = createLogger('notifications/bindings')

export async function GET(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { db } = await import('@sim/db')
    const workspaceId = request.headers.get('x-workspace-id') || 'default'

    const result = await db.execute(
      `SELECT id, channel, channel_user_id, created_at
       FROM simstudio.notification_bindings
       WHERE user_id = $1 AND workspace_id = $2`,
      [auth.userId, workspaceId]
    )

    return NextResponse.json({ success: true, bindings: result.rows })
  } catch (error) {
    logger.error('Failed to list bindings', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { bindingId } = body

    if (!bindingId) {
      return NextResponse.json({ success: false, error: 'bindingId required' }, { status: 400 })
    }

    const { db } = await import('@sim/db')
    await db.execute(
      `DELETE FROM simstudio.notification_bindings WHERE id = $1 AND user_id = $2`,
      [bindingId, auth.userId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to delete binding', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Add notification_bindings table to schema**

Add to Sim Studio's database schema (either via Drizzle migration or raw SQL seed):

```sql
CREATE TABLE IF NOT EXISTS simstudio.notification_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  channel_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, channel)
);
```

- [ ] **Step 6: Extend webhook payload in approval service**

Modify `sim-workflow/apps/sim/lib/approval/service.ts` — in the `queueTransaction` function, add `userId` and `workspaceId` to the webhook POST body:

```typescript
// In the webhook notification section, add to payload:
userId: tx.userId,
workspaceId: tx.workspaceId,
```

- [ ] **Step 7: Commit**

```bash
git add sim-workflow/apps/sim/lib/notifications/ sim-workflow/apps/sim/app/api/notifications/ sim-workflow/apps/sim/lib/approval/service.ts
git commit -m "feat(sim): add notification binding APIs and extend webhook payload"
```

---

### Task 2: Bot project scaffold

**Files:**
- Create: `services/approval-bot/package.json`
- Create: `services/approval-bot/tsconfig.json`
- Create: `services/approval-bot/src/index.ts`
- Create: `services/approval-bot/src/schema.sql`

- [ ] **Step 1: Create package.json**

Create `services/approval-bot/package.json`:

```json
{
  "name": "@flowindex/approval-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bunx vitest run"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `services/approval-bot/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create schema.sql**

Create `services/approval-bot/src/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS pending_approvals (
  pending_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  approve_url TEXT NOT NULL,
  reject_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cleanup index
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_approvals (expires_at) WHERE NOT resolved;
```

- [ ] **Step 4: Create entry point**

Create `services/approval-bot/src/index.ts`:

```typescript
import { Hono } from 'hono'
import { handleTelegramWebhook } from './handlers/commands'
import { handleApprovalWebhook } from './handlers/approval'

const app = new Hono()

const PORT = Number(process.env.PORT || 3100)
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''
const STUDIO_BOT_TOKEN = process.env.STUDIO_BOT_TOKEN || ''

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// Telegram webhook — verify secret_token header
app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token')
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Invalid secret' }, 401)
  }
  const update = await c.req.json()
  await handleTelegramWebhook(update)
  return c.json({ ok: true })
})

// Approval webhook from Sim Studio
app.post('/webhook/approval', async (c) => {
  const auth = c.req.header('authorization')
  if (auth !== `Bearer ${STUDIO_BOT_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const payload = await c.req.json()
  const result = await handleApprovalWebhook(payload)
  if (!result.success) {
    return c.json(result, result.status || 500)
  }
  return c.json(result)
})

console.log(`Approval bot starting on port ${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
```

- [ ] **Step 5: Install dependencies**

Run: `cd services/approval-bot && bun install`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add services/approval-bot/package.json services/approval-bot/tsconfig.json services/approval-bot/src/index.ts services/approval-bot/src/schema.sql services/approval-bot/bun.lock
git commit -m "feat(approval-bot): scaffold project with Hono server"
```

---

### Task 3: Telegram API wrapper + DB module

**Files:**
- Create: `services/approval-bot/src/telegram.ts`
- Create: `services/approval-bot/src/db.ts`

- [ ] **Step 1: Create Telegram API wrapper**

Create `services/approval-bot/src/telegram.ts`:

```typescript
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

interface InlineButton {
  text: string
  callback_data: string
}

/** Send a message with optional inline keyboard */
export async function sendMessage(
  chatId: string,
  text: string,
  buttons?: InlineButton[][]
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }
  if (buttons) {
    body.reply_markup = { inline_keyboard: buttons }
  }
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`)
  return data.result
}

/** Edit an existing message text and remove buttons */
export async function editMessage(
  chatId: string,
  messageId: number,
  text: string
): Promise<void> {
  await fetch(`${API_BASE}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    }),
  })
}

/** Acknowledge a callback query (dismiss loading indicator) */
export async function answerCallbackQuery(queryId: string, text?: string): Promise<void> {
  await fetch(`${API_BASE}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId, text }),
  })
}

/** Register webhook URL with Telegram */
export async function setWebhook(url: string, secretToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`setWebhook failed: ${data.description}`)
  console.log(`Webhook set to ${url}`)
}
```

- [ ] **Step 2: Create DB module**

Create `services/approval-bot/src/db.ts`:

```typescript
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL || ''
const sql = postgres(DATABASE_URL)

/** Look up Telegram chat ID for a Studio user */
export async function getBinding(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  const rows = await sql`
    SELECT channel_user_id FROM simstudio.notification_bindings
    WHERE user_id = ${userId}
      AND workspace_id = ${workspaceId}
      AND channel = 'telegram'
    LIMIT 1
  `
  return rows.length > 0 ? rows[0].channel_user_id : null
}

/** Remove all Telegram bindings for a chat ID */
export async function removeBindings(channelUserId: string): Promise<number> {
  const result = await sql`
    DELETE FROM simstudio.notification_bindings
    WHERE channel_user_id = ${channelUserId} AND channel = 'telegram'
  `
  return result.count
}

/** Store a pending approval for button callback resolution */
export async function savePendingApproval(params: {
  pendingId: string
  chatId: string
  messageId: string
  approveUrl: string
  rejectUrl: string
  expiresAt: Date
}): Promise<void> {
  await sql`
    INSERT INTO pending_approvals (pending_id, chat_id, message_id, approve_url, reject_url, expires_at)
    VALUES (${params.pendingId}, ${params.chatId}, ${params.messageId}, ${params.approveUrl}, ${params.rejectUrl}, ${params.expiresAt})
    ON CONFLICT (pending_id) DO NOTHING
  `
}

/** Get a pending approval by ID */
export async function getPendingApproval(pendingId: string): Promise<{
  chatId: string
  messageId: string
  approveUrl: string
  rejectUrl: string
  resolved: boolean
} | null> {
  const rows = await sql`
    SELECT chat_id, message_id, approve_url, reject_url, resolved
    FROM pending_approvals
    WHERE pending_id = ${pendingId}
  `
  if (rows.length === 0) return null
  return {
    chatId: rows[0].chat_id,
    messageId: rows[0].message_id,
    approveUrl: rows[0].approve_url,
    rejectUrl: rows[0].reject_url,
    resolved: rows[0].resolved,
  }
}

/** Mark a pending approval as resolved */
export async function resolvePendingApproval(pendingId: string): Promise<void> {
  await sql`UPDATE pending_approvals SET resolved = true WHERE pending_id = ${pendingId}`
}

/** Cleanup expired approvals */
export async function cleanupExpired(): Promise<void> {
  await sql`DELETE FROM pending_approvals WHERE expires_at < now() - interval '1 hour'`
}
```

- [ ] **Step 3: Commit**

```bash
git add services/approval-bot/src/telegram.ts services/approval-bot/src/db.ts
git commit -m "feat(approval-bot): add Telegram API wrapper and DB module"
```

---

### Task 4: Command handlers (/start, /connect, /disconnect)

**Files:**
- Create: `services/approval-bot/src/handlers/commands.ts`

- [ ] **Step 1: Create command handlers**

Create `services/approval-bot/src/handlers/commands.ts`:

```typescript
import { sendMessage } from '../telegram'
import { removeBindings } from '../db'

const STUDIO_API_URL = process.env.STUDIO_API_URL || 'https://studio.flowindex.io'
const STUDIO_BOT_TOKEN = process.env.STUDIO_BOT_TOKEN || ''

// Rate limit: /connect attempts per user
const connectAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_CONNECT_ATTEMPTS = 3
const CONNECT_WINDOW_MS = 60_000

function checkConnectRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = connectAttempts.get(userId)
  if (!entry || entry.resetAt < now) {
    connectAttempts.set(userId, { count: 1, resetAt: now + CONNECT_WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_CONNECT_ATTEMPTS) return false
  entry.count++
  return true
}

/** Route all Telegram updates */
export async function handleTelegramWebhook(update: Record<string, unknown>): Promise<void> {
  // Handle button callbacks
  if (update.callback_query) {
    const { handleCallbackQuery } = await import('./callback')
    await handleCallbackQuery(update.callback_query as Record<string, unknown>)
    return
  }

  // Handle text messages
  const message = update.message as Record<string, unknown> | undefined
  if (!message?.text) return

  const text = (message.text as string).trim()
  const chatId = String((message.chat as Record<string, unknown>).id)
  const userId = String((message.from as Record<string, unknown>).id)

  if (text === '/start') {
    await handleStart(chatId)
  } else if (text.startsWith('/connect ')) {
    await handleConnect(chatId, userId, text.slice(9).trim())
  } else if (text === '/disconnect') {
    await handleDisconnect(chatId, userId)
  }
}

async function handleStart(chatId: string): Promise<void> {
  await sendMessage(
    chatId,
    '👋 <b>FlowIndex Approval Bot</b>\n\n' +
    'I send you transaction approval notifications from Sim Studio.\n\n' +
    '<b>Commands:</b>\n' +
    '/connect CODE — Link your Telegram to Sim Studio\n' +
    '/disconnect — Unlink your account'
  )
}

async function handleConnect(chatId: string, userId: string, code: string): Promise<void> {
  if (!code) {
    await sendMessage(chatId, '❌ Please provide a code: /connect YOUR_CODE')
    return
  }

  if (!checkConnectRateLimit(userId)) {
    await sendMessage(chatId, '⏳ Too many attempts. Please wait a minute.')
    return
  }

  try {
    const res = await fetch(`${STUDIO_API_URL}/api/notifications/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STUDIO_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        code,
        channel: 'telegram',
        channelUserId: chatId,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      await sendMessage(chatId, `❌ ${data.error || 'Invalid or expired code'}`)
      return
    }

    await sendMessage(chatId, '✅ Connected! You\'ll receive transaction approval notifications here.')
  } catch (error) {
    console.error('Connect failed:', error)
    await sendMessage(chatId, '❌ Failed to connect. Please try again.')
  }
}

async function handleDisconnect(chatId: string, userId: string): Promise<void> {
  try {
    const count = await removeBindings(chatId)
    if (count > 0) {
      await sendMessage(chatId, '✅ Disconnected. You won\'t receive approval notifications anymore.')
    } else {
      await sendMessage(chatId, 'ℹ️ No active connections found.')
    }
  } catch (error) {
    console.error('Disconnect failed:', error)
    await sendMessage(chatId, '❌ Failed to disconnect. Please try again.')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/approval-bot/src/handlers/commands.ts
git commit -m "feat(approval-bot): add /start, /connect, /disconnect command handlers"
```

---

### Task 5: Approval webhook handler (receive notification → send Telegram message)

**Files:**
- Create: `services/approval-bot/src/handlers/approval.ts`

- [ ] **Step 1: Create approval webhook handler**

Create `services/approval-bot/src/handlers/approval.ts`:

```typescript
import { sendMessage } from '../telegram'
import { getBinding, savePendingApproval, getPendingApproval } from '../db'

const MAX_ARGS_LENGTH = 500

interface ApprovalWebhookPayload {
  type: string
  pendingId: string
  userId: string
  workspaceId: string
  mode: string
  summary: {
    templateId?: string
    network: string
    signerAddress?: string
    arguments?: string
    simulation?: {
      success: boolean
      computationUsed: number
      balanceChanges: Array<{ token: string; delta: string }>
    }
  }
  actions: {
    approve: string
    reject: string
    details: string
  }
  expiresAt: string
}

/** Handle incoming approval webhook from Sim Studio */
export async function handleApprovalWebhook(
  payload: ApprovalWebhookPayload
): Promise<{ success: boolean; error?: string; status?: number }> {
  if (payload.type !== 'approval_requested') {
    return { success: true } // Ignore non-request types (e.g. approval_resolved)
  }

  // Look up Telegram binding
  const chatId = await getBinding(payload.userId, payload.workspaceId)
  if (!chatId) {
    return { success: false, error: 'No Telegram binding found', status: 404 }
  }

  // Idempotency: skip if already sent
  const existing = await getPendingApproval(payload.pendingId)
  if (existing) {
    return { success: true } // Already sent
  }

  // Build message
  const text = formatApprovalMessage(payload)

  // Send with inline buttons
  const result = await sendMessage(chatId, text, [
    [
      { text: '✅ Approve', callback_data: `approve:${payload.pendingId}` },
      { text: '❌ Reject', callback_data: `reject:${payload.pendingId}` },
    ],
  ])

  // Persist for callback resolution
  await savePendingApproval({
    pendingId: payload.pendingId,
    chatId,
    messageId: String(result.message_id),
    approveUrl: payload.actions.approve,
    rejectUrl: payload.actions.reject,
    expiresAt: new Date(payload.expiresAt),
  })

  return { success: true }
}

function formatApprovalMessage(payload: ApprovalWebhookPayload): string {
  const { summary } = payload
  const lines: string[] = ['🔔 <b>Transaction Approval Required</b>\n']

  if (summary.templateId) lines.push(`📋 Template: <code>${summary.templateId}</code>`)
  lines.push(`🌐 Network: ${summary.network}`)
  if (summary.signerAddress) lines.push(`🔑 Signer: <code>${summary.signerAddress}</code>`)

  if (summary.arguments) {
    let args = summary.arguments
    if (args.length > MAX_ARGS_LENGTH) {
      args = args.slice(0, MAX_ARGS_LENGTH) + '...'
    }
    lines.push(`\nArguments:\n<code>${escapeHtml(args)}</code>`)
  }

  if (summary.simulation) {
    const sim = summary.simulation
    const status = sim.success ? '✅ Passed' : '❌ Failed'
    lines.push(`\nSimulation: ${status} (${sim.computationUsed} gas)`)
    if (sim.balanceChanges?.length) {
      for (const bc of sim.balanceChanges) {
        lines.push(`Balance: ${bc.delta} ${bc.token}`)
      }
    }
  }

  const expires = new Date(payload.expiresAt)
  lines.push(`\n⏰ Expires: ${expires.toUTCString()}`)

  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

- [ ] **Step 2: Commit**

```bash
git add services/approval-bot/src/handlers/approval.ts
git commit -m "feat(approval-bot): add approval webhook handler with Telegram notifications"
```

---

### Task 6: Button callback handler (user taps Approve/Reject)

**Files:**
- Create: `services/approval-bot/src/handlers/callback.ts`

- [ ] **Step 1: Create callback handler**

Create `services/approval-bot/src/handlers/callback.ts`:

```typescript
import { answerCallbackQuery, editMessage } from '../telegram'
import { getPendingApproval, resolvePendingApproval } from '../db'

/** Handle inline keyboard button presses */
export async function handleCallbackQuery(query: Record<string, unknown>): Promise<void> {
  const queryId = String(query.id)
  const data = String(query.data || '')
  const message = query.message as Record<string, unknown> | undefined

  // Acknowledge immediately
  await answerCallbackQuery(queryId)

  // Parse callback data: "approve:{pendingId}" or "reject:{pendingId}"
  const colonIdx = data.indexOf(':')
  if (colonIdx === -1) return

  const action = data.slice(0, colonIdx) as 'approve' | 'reject'
  const pendingId = data.slice(colonIdx + 1)

  if (!['approve', 'reject'].includes(action) || !pendingId) return

  // Look up stored approval
  const pending = await getPendingApproval(pendingId)
  if (!pending) {
    if (message) {
      await editMessage(
        pending?.chatId || String((message.chat as Record<string, unknown>).id),
        (message as Record<string, unknown>).message_id as number,
        '⚠️ This approval has expired or was already processed.'
      )
    }
    return
  }

  if (pending.resolved) {
    await editMessage(
      pending.chatId,
      Number(pending.messageId),
      '⚠️ This approval has already been processed.'
    )
    return
  }

  // Call the Phase 1 HMAC-authenticated URL
  const url = action === 'approve' ? pending.approveUrl : pending.rejectUrl

  try {
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) })
    const result = await res.json()

    await resolvePendingApproval(pendingId)

    if (action === 'approve') {
      if (result.success && result.txId) {
        await editMessage(
          pending.chatId,
          Number(pending.messageId),
          `✅ <b>Approved</b>\n\nTransaction: <code>${result.txId}</code>`
        )
      } else if (result.success) {
        await editMessage(
          pending.chatId,
          Number(pending.messageId),
          `✅ <b>Approved</b>\n\nStatus: ${result.status || 'approved'}`
        )
      } else {
        await editMessage(
          pending.chatId,
          Number(pending.messageId),
          `⚠️ <b>Approval failed</b>\n\n${result.error || 'Unknown error'}`
        )
      }
    } else {
      await editMessage(
        pending.chatId,
        Number(pending.messageId),
        '❌ <b>Rejected</b>'
      )
    }
  } catch (error) {
    console.error(`Callback ${action} failed for ${pendingId}:`, error)
    await editMessage(
      pending.chatId,
      Number(pending.messageId),
      '⚠️ Failed to reach the approval server. Please try again or check Studio.'
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/approval-bot/src/handlers/callback.ts
git commit -m "feat(approval-bot): add button callback handler for approve/reject"
```

---

### Task 7: Dockerfile + startup webhook registration

**Files:**
- Create: `services/approval-bot/Dockerfile`
- Modify: `services/approval-bot/src/index.ts` (add startup webhook registration + cleanup interval)

- [ ] **Step 1: Create Dockerfile**

Create `services/approval-bot/Dockerfile`:

```dockerfile
FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

EXPOSE 3100

CMD ["bun", "run", "src/index.ts"]
```

- [ ] **Step 2: Add startup webhook registration to index.ts**

Add to the bottom of `services/approval-bot/src/index.ts` (before the export):

```typescript
import { setWebhook } from './telegram'
import { cleanupExpired } from './db'

// Register Telegram webhook on startup
const BOT_WEBHOOK_URL = process.env.BOT_WEBHOOK_URL
if (BOT_WEBHOOK_URL) {
  setWebhook(`${BOT_WEBHOOK_URL}/telegram/webhook`, TELEGRAM_WEBHOOK_SECRET)
    .catch((err) => console.error('Failed to set webhook:', err))
}

// Cleanup expired pending approvals every 10 minutes
setInterval(() => {
  cleanupExpired().catch((err) => console.error('Cleanup failed:', err))
}, 10 * 60 * 1000)
```

- [ ] **Step 3: Commit**

```bash
git add services/approval-bot/Dockerfile services/approval-bot/src/index.ts
git commit -m "feat(approval-bot): add Dockerfile and startup webhook registration"
```

---

### Task 8: Integration verification

- [ ] **Step 1: Run Studio-side tests**

Run: `cd sim-workflow && bunx vitest run apps/sim/app/api/notifications/`
Expected: PASS (if tests exist) or no test files found (acceptable for Phase 2 — manual testing).

- [ ] **Step 2: Verify bot builds**

Run: `cd services/approval-bot && bun install && bun run src/index.ts &; sleep 2; curl http://localhost:3100/health; kill %1`
Expected: `{"status":"ok"}`

- [ ] **Step 3: Verify Docker build**

Run: `cd services/approval-bot && docker build -t approval-bot .`
Expected: Build succeeds.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues for approval bot"
```

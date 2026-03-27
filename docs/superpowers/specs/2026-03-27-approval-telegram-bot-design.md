# Telegram Approval Bot — Phase 2

**Date**: 2026-03-27
**Status**: Draft
**Scope**: Self-hosted Telegram bot for transaction approval notifications with inline buttons
**Depends on**: Phase 1 Approval Queue (PR #213)

## Context

Phase 1 delivered a transaction approval queue with webhook notifications and HMAC-authenticated public callback URLs. Users can receive webhook POSTs and call the approval API programmatically. What's missing is a **user-friendly notification channel** — most users don't have webhook infrastructure.

This phase adds a self-hosted Telegram bot (`@FlowIndexBot`) that:
1. Lets users bind their Telegram account to their Studio workspace via `/connect`
2. Receives approval webhook from Sim Studio
3. Sends inline-button messages to the user's Telegram chat
4. Handles button clicks by calling the Phase 1 approval API
5. Updates the message with the result

## What This Does NOT Include

- Web approval page (Phase 3)
- Passkey-sign mode (Phase 3)
- Discord bot (Phase 3)
- Status query commands like `/pending` or `/status` (Phase 3)
- OpenClaw plugin integration (nice-to-have, not required)

## Architecture

```
Sim Studio (flow_queue_transaction)
  │
  │  POST https://bot.flowindex.io/webhook/approval
  │  payload: {type, pendingId, mode, summary, actions, expiresAt, userId, workspaceId}
  │
  ▼
Telegram Bot Service (services/approval-bot/)
  │
  │  1. Look up notification_bindings for userId → telegramChatId
  │  2. sendMessage with InlineKeyboard [✅ Approve] [❌ Reject]
  │     callback_data: "approve:{pendingId}" / "reject:{pendingId}"
  │
  ▼
User's Telegram Chat
  │
  │  User taps ✅ Approve
  │
  ▼
Telegram → Bot Service (callback_query)
  │
  │  1. Parse action + pendingId from callback_data
  │  2. fetch(actions.approve)  ← Phase 1 HMAC URL stored at send time
  │  3. editMessageText: "✅ Approved — tx: abc123"
  │
  ▼
Sim Studio (POST /api/approval/:id/approve?token=hmac)
  → Validates HMAC → Decrypts signer → Executes transaction
```

## User Binding Flow (`/connect`)

### Step 1: User initiates in Studio

User goes to Studio workspace settings → Notifications → clicks "Connect Telegram".

Studio calls `POST /api/notifications/connect`:
- Generates a 6-character alphanumeric code (e.g. `ABC123`)
- Stores: `{code, userId, workspaceId, expiresAt: now + 5min}` in Redis or memory
- Returns code to frontend

Frontend displays:
> Send this to **@FlowIndexBot** on Telegram:
> `/connect ABC123`

### Step 2: User sends `/connect` in Telegram

User messages the bot: `/connect ABC123`

Bot service calls `POST {STUDIO_API_URL}/api/notifications/verify`:
- Body: `{code: "ABC123", channel: "telegram", channelUserId: "783816121"}`
- Studio verifies code not expired, creates `notification_bindings` row
- Returns `{success: true, userId, workspaceId}`

Bot replies: `✅ Connected! You'll receive transaction approval notifications here.`

### Step 3: Disconnect

User sends `/disconnect` or removes binding in Studio settings.

## Database

### `notification_bindings` table (Sim Studio DB)

```sql
CREATE TABLE IF NOT EXISTS simstudio.notification_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',  -- 'telegram' | 'discord' (future)
  channel_user_id TEXT NOT NULL,             -- Telegram chat ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, channel)
);
```

### `pending_approvals` table (Bot DB)

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
```

Cleaned up periodically (delete where `expires_at < now() - interval '1 hour'`).

### `notification_connect_codes` (Studio-side, in-memory)

Key: `connect_code:{code}` → `{userId, workspaceId}`, TTL 5 minutes. In-memory on Studio side (codes are short-lived, single-instance is fine).

**Rate limiting:** The `/api/notifications/verify` endpoint limits to 5 attempts per Telegram user ID per minute. The bot also limits `/connect` to 3 attempts per Telegram user per minute.

## Telegram Bot Service

### Project Location

`services/approval-bot/` — independent Node.js/Bun project.

### Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `POST /telegram/webhook` | POST | Telegram secret_token header | Receives all Telegram updates |
| `POST /webhook/approval` | POST | Bearer token (shared secret) | Receives Sim Studio approval webhooks |
| `GET /health` | GET | None | Health check |

### Telegram Webhook Setup

On startup, bot calls `setWebhook`:
```
POST https://api.telegram.org/bot{token}/setWebhook
{
  "url": "https://bot.flowindex.io/telegram/webhook",
  "secret_token": "{WEBHOOK_SECRET}",
  "allowed_updates": ["message", "callback_query"]
}
```

### Message Handling

**`/start`** — Welcome message explaining the bot.

**`/connect {code}`** — Verify code with Studio API, create binding.

**`/disconnect`** — Remove binding.

**`/disconnect`** — Removes all bindings for this Telegram user (across all workspaces). If user needs per-workspace control, they use Studio settings.

**Everything else** — Ignore (bot is notification-only, not conversational).

### No Binding Found

If the bot receives an approval webhook but no `notification_bindings` row exists for the `userId` + `workspaceId`, it returns HTTP 404 to Studio. Studio logs this but does not retry (user hasn't connected Telegram). The approval remains in the queue — user can still approve via other means (direct API call, future web page).

### Approval Notification Message

When `POST /webhook/approval` is received:

```
🔔 Transaction Approval Required

📋 Template: transfer_tokens_v3
🌐 Network: mainnet
🔑 Signer: f8d6e0586b0a20c7

Arguments:
  amount: 100.0
  to: abcdef1234567890

Simulation: ✅ Passed (145 gas)
Balance: -100.0 FlowToken

⏰ Expires: 2026-03-27 17:15 UTC

[✅ Approve]  [❌ Reject]
```

**Truncation:** Telegram messages max at 4096 characters. If arguments are large, truncate to first 500 chars with `...` suffix.

Bot stores `{pendingId → {approveUrl, rejectUrl, messageId, chatId}}` in a `pending_approvals` database table for callback resolution. This survives bot restarts (unlike in-memory storage). Rows are cleaned up after expiry or resolution.

**Idempotency:** Bot deduplicates on `pendingId` — if a notification for the same pendingId already exists (Studio webhook retry), skip sending a duplicate message.

### Button Callback Handling

When user taps a button:

1. Telegram sends `callback_query` with `data: "approve:{pendingId}"` or `"reject:{pendingId}"`
2. Bot calls `answerCallbackQuery` immediately (dismiss loading)
3. Bot looks up stored `approveUrl` or `rejectUrl` for this pendingId
4. `fetch(url, { method: 'POST' })` — this is the Phase 1 HMAC-authenticated URL
5. On success: `editMessageText` → replace buttons with result:
   - Approve success: `✅ Approved — Transaction: {txId}`
   - Approve failed: `⚠️ Approval failed: {error}`
   - Rejected: `❌ Rejected`
6. On network error: `editMessageText` → `⚠️ Failed to reach approval server. Please try again or check Studio.` (Never expose HMAC URLs in chat text — they persist in Telegram history)

### Callback Data Format

Telegram limits `callback_data` to 64 bytes. Format: `{action}:{pendingId_short}`

Since UUID v4 is 36 chars, `approve:` (8) + UUID (36) = 44 bytes — fits within limit.

## Studio-Side Changes

### New API Routes (in Sim Studio)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /api/notifications/connect` | POST | Session (logged in user) | Generate connect code |
| `POST /api/notifications/verify` | POST | Bearer (bot service token) | Verify code + create binding |
| `GET /api/notifications/bindings` | GET | Session | List user's bindings |
| `DELETE /api/notifications/bindings/:id` | DELETE | Session | Remove a binding |

### Webhook Payload Extension

Phase 1's webhook payload needs `userId` and `workspaceId` added so the bot can look up the right Telegram chat:

```json
{
  "type": "approval_requested",
  "pendingId": "uuid-xxx",
  "userId": "user-123",
  "workspaceId": "ws-456",
  "mode": "approve-only",
  "summary": { ... },
  "actions": { "approve": "https://...", "reject": "https://..." },
  "expiresAt": "2026-03-27T17:15:00Z"
}
```

This is a minor addition to the existing `service.ts` webhook function.

## Deployment

### Bot Service

- **Docker container** on existing `flowindex-backend` VM (or any VM with network access)
- **Caddy** reverse proxy: `bot.flowindex.io` → localhost:{BOT_PORT}
- **DNS**: `bot.flowindex.io` A record to VM IP

### Environment Variables (Bot Service)

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random string for webhook verification |
| `STUDIO_API_URL` | Sim Studio base URL (e.g. `https://studio.flowindex.io`) |
| `STUDIO_BOT_TOKEN` | Shared secret for bot → Studio API calls |
| `DATABASE_URL` | PostgreSQL connection string (same DB as Sim Studio) |
| `PORT` | HTTP port (default: 3100) |

### Environment Variables (Sim Studio addition)

| Variable | Description |
|----------|-------------|
| `BOT_SERVICE_TOKEN` | Shared secret to verify bot API calls |

## Files to Create/Modify

### New project: `services/approval-bot/`

```
services/approval-bot/
├── package.json
├── tsconfig.json
├── Dockerfile
├── src/
│   ├── index.ts              — HTTP server (Bun.serve or Hono)
│   ├── telegram.ts           — Telegram API wrapper (sendMessage, editMessage, setWebhook)
│   ├── handlers/
│   │   ├── commands.ts       — /start, /connect, /disconnect
│   │   ├── callback.ts       — Button click handler
│   │   └── approval.ts       — Incoming approval webhook → send notification
│   ├── store.ts              — pending_approvals DB queries (persist callback URLs)
│   └── db.ts                 — notification_bindings reads + pending_approvals CRUD
```

### Sim Studio modifications

```
apps/sim/app/api/notifications/connect/route.ts       — Generate connect code
apps/sim/app/api/notifications/verify/route.ts         — Verify code + create binding
apps/sim/app/api/notifications/bindings/route.ts       — List bindings (GET)
apps/sim/app/api/notifications/bindings/[id]/route.ts  — Delete binding (DELETE)
apps/sim/lib/approval/service.ts                       — Add userId/workspaceId to webhook payload
```

### Database migration

```
Add notification_bindings table to Sim Studio schema
```

## Security

- **Bot webhook**: Verified via Telegram's `secret_token` header
- **Approval webhook**: Verified via `Authorization: Bearer {STUDIO_BOT_TOKEN}` header
- **Connect codes**: 6-char alphanumeric, 5-minute TTL, single-use
- **HMAC URLs**: Phase 1's action-bound tokens — bot just passes them through
- **No secrets in Telegram**: Bot never sees private keys; HMAC URLs are the only auth material, and they expire with the approval

## Phase 3 Scope (Deferred)

- **Discord bot**: Same pattern, different API (Button components, Ed25519 signature verification)
- **Web approval page**: `studio.flowindex.io/approval/:id` — for passkey-sign and as fallback
- **Passkey-sign**: WebAuthn on the web approval page
- **Email notifications**: SendGrid/Resend integration
- **Status commands**: `/pending`, `/status {txId}`
- **Studio UI**: Notification settings panel in workspace settings

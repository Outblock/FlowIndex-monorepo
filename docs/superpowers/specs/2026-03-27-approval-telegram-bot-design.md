# Telegram Approval Bot — Phase 2

**Date**: 2026-03-27
**Status**: Draft
**Scope**: Self-hosted Telegram bot for transaction approval notifications with inline buttons
**Depends on**: Phase 1 Approval Queue (PR #213)

## Context

Phase 1 delivered a transaction approval queue with webhook notifications and HMAC-authenticated public callback URLs. What's missing is a user-friendly notification channel. This phase adds a self-hosted Telegram bot (`@FlowIndexBot`) that sends approval notifications with inline Approve/Reject buttons.

## What This Does NOT Include

- Web approval page (Phase 3)
- Passkey-sign mode (Phase 3)
- Discord bot (Phase 3)
- Status query commands (Phase 3)
- OpenClaw plugin integration (nice-to-have)

## Architecture

```
Sim Studio (flow_queue_transaction with webhookUrl)
  → POST https://bot.flowindex.io/webhook/approval
  → payload: {type, pendingId, userId, workspaceId, mode, summary, actions, expiresAt}

Bot Service (services/approval-bot/)
  → Look up notification_bindings for userId → telegramChatId
  → sendMessage with InlineKeyboard [✅ Approve] [❌ Reject]
  → callback_data: "approve:{pendingId}" / "reject:{pendingId}"

User taps button
  → Telegram → Bot (callback_query)
  → Bot calls Phase 1 HMAC URL (actions.approve or actions.reject)
  → editMessage with result: "✅ Approved — tx: abc123" or "❌ Rejected"
```

## User Binding Flow (/connect)

1. User in Studio settings → "Connect Telegram" → Studio generates 6-char code (5 min TTL)
2. User messages @FlowIndexBot: `/connect ABC123`
3. Bot calls `POST {STUDIO_API_URL}/api/notifications/verify` with code + Telegram chat ID
4. Studio verifies code, creates `notification_bindings` row
5. Bot replies: "✅ Connected!"

## Database

### notification_bindings (Sim Studio DB)

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

### pending_approvals (same DB, bot's table)

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

## Bot Service

Independent Node.js/Bun project at `services/approval-bot/`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /telegram/webhook | POST | Telegram secret_token | All Telegram updates |
| POST /webhook/approval | POST | Bearer token | Sim Studio approval webhooks |
| GET /health | GET | None | Health check |

## Message Format

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

Truncation: Arguments capped at 500 chars. Telegram messages max 4096 chars.

## Button Callback Handling

1. Parse `callback_data` → action + pendingId
2. Look up stored `approveUrl`/`rejectUrl` from `pending_approvals` table
3. `fetch(url, {method: 'POST'})` — Phase 1 HMAC URL
4. Edit message with result
5. On error: "Failed to reach approval server. Please check Studio." (never expose HMAC URLs in chat)

Idempotency: Deduplicate on pendingId — skip if already sent.

## Studio-Side Changes

New API routes:
- `POST /api/notifications/connect` — Generate connect code (session auth)
- `POST /api/notifications/verify` — Verify code + create binding (bot Bearer token)
- `GET /api/notifications/bindings` — List bindings (session auth)
- `DELETE /api/notifications/bindings` — Remove binding (session auth)

Modify `lib/approval/service.ts` — add `userId` and `workspaceId` to webhook payload.

## Deployment

- Docker container on existing VM
- Caddy reverse proxy: `bot.flowindex.io` → localhost:3100

## Environment Variables

### Bot Service
| Variable | Description |
|----------|-------------|
| TELEGRAM_BOT_TOKEN | From BotFather |
| TELEGRAM_WEBHOOK_SECRET | Webhook verification |
| STUDIO_API_URL | e.g. https://studio.flowindex.io |
| STUDIO_BOT_TOKEN | Shared secret for bot → Studio calls |
| DATABASE_URL | PostgreSQL connection |
| BOT_WEBHOOK_URL | e.g. https://bot.flowindex.io |
| PORT | Default: 3100 |

### Studio Addition
| Variable | Description |
|----------|-------------|
| BOT_SERVICE_TOKEN | Verify bot API calls |

## Security

- Telegram webhook: verified via `secret_token` header
- Approval webhook: verified via `Bearer` token
- Connect codes: 6-char, 5-min TTL, single-use
- Rate limiting: /connect 3/min (bot), /verify 5/min (Studio)
- Callback URLs in DB (not memory) — survives restarts
- HMAC URLs never exposed in chat text

## Phase 3 Scope (Deferred)

- Discord bot (same pattern, different API)
- Web approval page (passkey-sign support)
- Email notifications
- Status commands (/pending, /status)
- Studio UI notification settings panel

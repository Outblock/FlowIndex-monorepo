import { sendMessage } from '../telegram'
import { removeBindings } from '../db'

const STUDIO_API_URL = process.env.STUDIO_API_URL || ''
const STUDIO_BOT_TOKEN = process.env.STUDIO_BOT_TOKEN || ''

// ---------- Rate limiter (3 requests/min per user) ----------

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(userId) || []
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, recent)
    return true
  }
  recent.push(now)
  rateLimitMap.set(userId, recent)
  return false
}

// ---------- Telegram Update types ----------

interface TelegramUser {
  id: number
  first_name?: string
}

interface TelegramMessage {
  chat: { id: number }
  from?: TelegramUser
  text?: string
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: { chat: { id: number }; message_id: number }
  data?: string
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery
  message?: TelegramMessage
}

// ---------- Handlers ----------

export async function handleTelegramWebhook(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    const { handleCallbackQuery } = await import('./callback')
    await handleCallbackQuery(update.callback_query)
    return
  }

  const msg = update.message
  if (!msg?.text) return

  const chatId = msg.chat.id
  const userId = msg.from ? String(msg.from.id) : ''
  const text = msg.text.trim()

  if (text === '/start' || text.startsWith('/start ')) {
    await handleStart(chatId)
  } else if (text.startsWith('/connect')) {
    const code = text.split(/\s+/)[1] || ''
    await handleConnect(chatId, userId, code)
  } else if (text === '/disconnect') {
    await handleDisconnect(chatId, userId)
  }
}

async function handleStart(chatId: number): Promise<void> {
  const text = [
    '<b>SimStudio Approval Bot</b>',
    '',
    'I notify you when a workflow step requires your approval and let you approve or reject directly from Telegram.',
    '',
    '<b>Commands:</b>',
    '/connect &lt;code&gt; — Link your SimStudio account using a code from the dashboard',
    '/disconnect — Unlink your Telegram from SimStudio',
  ].join('\n')
  await sendMessage(chatId, text)
}

async function handleConnect(chatId: number, userId: string, code: string): Promise<void> {
  if (!code) {
    await sendMessage(chatId, 'Usage: /connect &lt;code&gt;\n\nGet a code from your SimStudio dashboard under notification settings.')
    return
  }

  if (isRateLimited(userId)) {
    await sendMessage(chatId, 'Too many attempts. Please wait a minute and try again.')
    return
  }

  try {
    const res = await fetch(`${STUDIO_API_URL}/api/notifications/telegram/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STUDIO_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        code,
        channel_user_id: String(chatId),
        telegram_user_id: userId,
      }),
    })

    if (res.ok) {
      await sendMessage(chatId, 'Connected! You will now receive approval requests here.')
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      const reason = body.error || `status ${res.status}`
      await sendMessage(chatId, `Connection failed: ${reason}`)
    }
  } catch (err) {
    console.error('connect verify error:', err)
    await sendMessage(chatId, 'Connection failed: could not reach SimStudio. Please try again later.')
  }
}

async function handleDisconnect(chatId: number, userId: string): Promise<void> {
  const count = await removeBindings(String(chatId))
  if (count > 0) {
    await sendMessage(chatId, 'Disconnected. You will no longer receive approval requests.')
  } else {
    await sendMessage(chatId, 'No linked account found. Nothing to disconnect.')
  }
}

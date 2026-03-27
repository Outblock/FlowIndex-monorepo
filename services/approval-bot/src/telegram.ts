const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

interface TelegramResponse<T = unknown> {
  ok: boolean
  result?: T
  description?: string
}

interface InlineButton {
  text: string
  callback_data?: string
  url?: string
}

interface SendMessageResult {
  message_id: number
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as TelegramResponse<T>
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || 'unknown error'}`)
  }
  return data.result as T
}

/**
 * Send a message with optional inline keyboard buttons.
 * Uses HTML parse_mode.
 */
export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][],
): Promise<{ message_id: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }
  if (buttons?.length) {
    body.reply_markup = { inline_keyboard: buttons }
  }
  return call<SendMessageResult>('sendMessage', body)
}

/**
 * Edit a message's text and remove inline keyboard.
 */
export async function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  })
}

/**
 * Acknowledge a callback query (button press).
 */
export async function answerCallbackQuery(
  queryId: string,
  text?: string,
): Promise<void> {
  await call('answerCallbackQuery', {
    callback_query_id: queryId,
    ...(text ? { text } : {}),
  })
}

/**
 * Register a webhook URL with Telegram.
 */
export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await call('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
  })
}

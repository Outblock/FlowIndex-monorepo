import { answerCallbackQuery, editMessage } from '../telegram'
import { getPendingApproval, resolvePendingApproval } from '../db'

interface CallbackQuery {
  id: string
  message?: {
    message_id: number
    chat: { id: number }
  }
  data?: string
}

/**
 * Handle inline keyboard button presses (approve / reject).
 */
export async function handleCallbackQuery(query: CallbackQuery): Promise<void> {
  // 1. Acknowledge immediately so Telegram stops the spinner
  await answerCallbackQuery(query.id)

  const message = query.message
  if (!message || !query.data) return

  const chatId = message.chat.id
  const messageId = message.message_id

  // 2. Parse callback_data — format: "{action}:{pendingId}"
  const sep = query.data.indexOf(':')
  if (sep === -1) return

  const action = query.data.slice(0, sep)
  const pendingId = query.data.slice(sep + 1)

  if (action !== 'approve' && action !== 'reject') return

  // 3. Look up the pending approval
  const pending = await getPendingApproval(pendingId)

  // 4. If not found or already resolved
  if (!pending || pending.resolved) {
    await editMessage(chatId, messageId, 'This approval has expired or was already processed.')
    return
  }

  // 5. Call the Phase 1 HMAC URL
  const url = action === 'approve' ? pending.approveUrl : pending.rejectUrl

  let responseBody: Record<string, unknown> | null = null
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    })
    responseBody = (await res.json()) as Record<string, unknown>
  } catch {
    // 8. Network error — never expose the HMAC URL
    await editMessage(
      chatId,
      messageId,
      '\u26a0\ufe0f Failed to reach approval server. Please check Studio.',
    )
    return
  }

  // 6. Mark resolved regardless of upstream response
  await resolvePendingApproval(pendingId)

  // 7. Edit message with result
  if (action === 'reject') {
    await editMessage(chatId, messageId, '\u274c Rejected')
    return
  }

  // action === 'approve'
  if (responseBody && responseBody.error) {
    const errMsg =
      typeof responseBody.error === 'string'
        ? responseBody.error
        : JSON.stringify(responseBody.error)
    await editMessage(chatId, messageId, `\u26a0\ufe0f Approval failed: ${errMsg}`)
    return
  }

  if (responseBody && responseBody.txId) {
    await editMessage(
      chatId,
      messageId,
      `\u2705 Approved \u2014 Transaction: ${responseBody.txId}`,
    )
    return
  }

  const status = responseBody?.status ?? 'ok'
  await editMessage(chatId, messageId, `\u2705 Approved \u2014 Status: ${status}`)
}

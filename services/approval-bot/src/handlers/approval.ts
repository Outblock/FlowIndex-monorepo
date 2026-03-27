import { getBinding, getPendingApproval, savePendingApproval } from '../db'
import { sendMessage } from '../telegram'

/** Payload shape from Sim Studio webhook. */
export interface ApprovalWebhookPayload {
  type: string
  pendingId: string
  userId: string
  workspaceId: string
  template: string
  network: string
  signer: string
  args?: string
  simulationResults?: string
  expiresAt: string
  approveUrl: string
  rejectUrl: string
}

interface HandlerResult {
  success: boolean
  error?: string
  status?: number
}

/**
 * Handle an incoming approval webhook from Sim Studio.
 *
 * 1. Ignore non-approval_requested types
 * 2. Look up Telegram binding for the user+workspace
 * 3. Check idempotency (skip if pending approval already stored)
 * 4. Format and send Telegram message with approve/reject buttons
 * 5. Persist the pending approval record
 */
export async function handleApprovalWebhook(
  payload: ApprovalWebhookPayload,
): Promise<HandlerResult> {
  // 1. Only handle approval_requested
  if (payload.type !== 'approval_requested') {
    return { success: true, status: 200 }
  }

  // 2. Look up binding
  const chatId = await getBinding(payload.userId, payload.workspaceId)
  if (!chatId) {
    return { success: false, error: 'No Telegram binding found', status: 404 }
  }

  // 3. Idempotency check
  const existing = await getPendingApproval(payload.pendingId)
  if (existing) {
    return { success: true, status: 200 }
  }

  // 4. Format message and send with inline keyboard
  const message = formatApprovalMessage(payload)
  const buttons = [
    [
      { text: '\u2705 Approve', callback_data: `approve:${payload.pendingId}` },
      { text: '\u274C Reject', callback_data: `reject:${payload.pendingId}` },
    ],
  ]

  const result = await sendMessage(chatId, message, buttons)

  // 5. Persist pending approval
  await savePendingApproval({
    pendingId: payload.pendingId,
    chatId,
    messageId: result.message_id,
    approveUrl: payload.approveUrl,
    rejectUrl: payload.rejectUrl,
    expiresAt: new Date(payload.expiresAt),
  })

  return { success: true, status: 200 }
}

/**
 * Build an HTML-formatted Telegram message for an approval request.
 */
export function formatApprovalMessage(payload: ApprovalWebhookPayload): string {
  const lines: string[] = []

  lines.push(`<b>\uD83D\uDD10 Transaction Approval Required</b>`)
  lines.push('')
  lines.push(`<b>Template:</b> ${escapeHtml(payload.template)}`)
  lines.push(`<b>Network:</b> ${escapeHtml(payload.network)}`)
  lines.push(`<b>Signer:</b> <code>${escapeHtml(payload.signer)}</code>`)

  if (payload.args) {
    const truncated =
      payload.args.length > 500 ? payload.args.slice(0, 500) + '...' : payload.args
    lines.push('')
    lines.push(`<b>Arguments:</b>`)
    lines.push(`<pre>${escapeHtml(truncated)}</pre>`)
  }

  if (payload.simulationResults) {
    lines.push('')
    lines.push(`<b>Simulation:</b>`)
    lines.push(`<pre>${escapeHtml(payload.simulationResults)}</pre>`)
  }

  const expiresAt = new Date(payload.expiresAt)
  lines.push('')
  lines.push(`<i>Expires: ${expiresAt.toUTCString()}</i>`)

  return lines.join('\n')
}

/** Escape HTML special characters for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

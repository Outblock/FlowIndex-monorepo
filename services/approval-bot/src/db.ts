import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL || '', { max: 5 })

export { sql }

// ---------- notification_bindings ----------

/**
 * Look up the Telegram chat ID for a given (userId, workspaceId) pair.
 */
export async function getBinding(
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT channel_user_id
    FROM simstudio.notification_bindings
    WHERE user_id = ${userId}
      AND workspace_id = ${workspaceId}
      AND channel = 'telegram'
    LIMIT 1
  `
  return rows.length ? (rows[0].channel_user_id as string) : null
}

/**
 * Remove all telegram bindings for a given chat ID.
 * Returns the number of deleted rows.
 */
export async function removeBindings(channelUserId: string): Promise<number> {
  const result = await sql`
    DELETE FROM simstudio.notification_bindings
    WHERE channel = 'telegram'
      AND channel_user_id = ${channelUserId}
  `
  return result.count
}

// ---------- pending_approvals ----------

interface PendingApprovalInput {
  pendingId: string
  chatId: string
  messageId: number
  approveUrl: string
  rejectUrl: string
  expiresAt: Date
}

interface PendingApprovalRow {
  chatId: string
  messageId: number
  approveUrl: string
  rejectUrl: string
  resolved: boolean
}

/**
 * Insert a pending approval record. Idempotent via ON CONFLICT DO NOTHING.
 */
export async function savePendingApproval(input: PendingApprovalInput): Promise<void> {
  await sql`
    INSERT INTO pending_approvals (pending_id, chat_id, message_id, approve_url, reject_url, expires_at)
    VALUES (
      ${input.pendingId},
      ${input.chatId},
      ${input.messageId},
      ${input.approveUrl},
      ${input.rejectUrl},
      ${input.expiresAt}
    )
    ON CONFLICT (pending_id) DO NOTHING
  `
}

/**
 * Get a pending approval by ID.
 */
export async function getPendingApproval(
  pendingId: string,
): Promise<PendingApprovalRow | null> {
  const rows = await sql`
    SELECT chat_id, message_id, approve_url, reject_url, resolved
    FROM pending_approvals
    WHERE pending_id = ${pendingId}
  `
  if (!rows.length) return null
  const row = rows[0]
  return {
    chatId: row.chat_id as string,
    messageId: Number(row.message_id),
    approveUrl: row.approve_url as string,
    rejectUrl: row.reject_url as string,
    resolved: row.resolved as boolean,
  }
}

/**
 * Mark a pending approval as resolved.
 */
export async function resolvePendingApproval(pendingId: string): Promise<void> {
  await sql`
    UPDATE pending_approvals
    SET resolved = true
    WHERE pending_id = ${pendingId}
  `
}

/**
 * Delete expired approvals older than 1 hour past their expiry.
 */
export async function cleanupExpired(): Promise<number> {
  const result = await sql`
    DELETE FROM pending_approvals
    WHERE expires_at < now() - interval '1 hour'
  `
  return result.count
}

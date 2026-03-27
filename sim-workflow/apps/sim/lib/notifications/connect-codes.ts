import { randomBytes } from 'node:crypto'
import { createLogger } from '@sim/logger'

const logger = createLogger('notifications/connect-codes')

interface ConnectCodeEntry {
  userId: string
  workspaceId: string
  timer: ReturnType<typeof setTimeout>
}

/** TTL for connect codes in milliseconds (5 minutes) */
const CODE_TTL_MS = 5 * 60 * 1000

/** In-memory store of pending connect codes */
const codeStore = new Map<string, ConnectCodeEntry>()

/**
 * Generate a 6-character hex connect code for linking a notification channel.
 * The code expires after 5 minutes and is automatically cleaned up.
 */
export function generateConnectCode(userId: string, workspaceId: string): string {
  const code = randomBytes(3).toString('hex').toUpperCase()

  // Clear any existing code for this user+workspace
  for (const [existingCode, entry] of codeStore) {
    if (entry.userId === userId && entry.workspaceId === workspaceId) {
      clearTimeout(entry.timer)
      codeStore.delete(existingCode)
    }
  }

  const timer = setTimeout(() => {
    codeStore.delete(code)
    logger.info('Connect code expired', { code })
  }, CODE_TTL_MS)

  // Prevent timer from keeping the process alive
  if (timer.unref) {
    timer.unref()
  }

  codeStore.set(code, { userId, workspaceId, timer })
  logger.info('Connect code generated', { code, userId, workspaceId })

  return code
}

/**
 * Consume a connect code, returning the associated userId and workspaceId.
 * Returns null if the code is invalid or already consumed. Single-use.
 */
export function consumeConnectCode(
  code: string
): { userId: string; workspaceId: string } | null {
  const entry = codeStore.get(code.toUpperCase())
  if (!entry) {
    return null
  }

  clearTimeout(entry.timer)
  codeStore.delete(code.toUpperCase())
  logger.info('Connect code consumed', { code, userId: entry.userId })

  return { userId: entry.userId, workspaceId: entry.workspaceId }
}

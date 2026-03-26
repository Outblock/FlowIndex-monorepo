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

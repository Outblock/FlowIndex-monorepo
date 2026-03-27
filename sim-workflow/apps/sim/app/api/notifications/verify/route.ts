import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { consumeConnectCode } from '@/lib/notifications/connect-codes'

const logger = createLogger('notifications/verify')

/** Rate limit: max attempts per channelUserId per minute */
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 1000

/** In-memory rate limit tracker */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(channelUserId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(channelUserId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(channelUserId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  // Authenticate via Bearer token (bot service token)
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const expectedToken = process.env.BOT_SERVICE_TOKEN

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { code, channelUserId, channel } = body

    if (!code || !channelUserId) {
      return NextResponse.json(
        { success: false, error: 'code and channelUserId are required' },
        { status: 400 }
      )
    }

    // Rate limit per channelUserId
    if (!checkRateLimit(channelUserId)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a minute.' },
        { status: 429 }
      )
    }

    const result = consumeConnectCode(code)
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    // Insert binding into database
    const { db } = await import('@sim/db')
    const channelName = channel || 'telegram'

    await db.execute(sql`
      INSERT INTO notification_bindings (user_id, workspace_id, channel, channel_user_id)
      VALUES (${result.userId}, ${result.workspaceId}, ${channelName}, ${channelUserId})
      ON CONFLICT (user_id, workspace_id, channel)
      DO UPDATE SET channel_user_id = ${channelUserId}, created_at = now()
    `)

    logger.info('Notification binding created', {
      userId: result.userId,
      workspaceId: result.workspaceId,
      channel: channelName,
      channelUserId,
    })

    return NextResponse.json({
      success: true,
      userId: result.userId,
      workspaceId: result.workspaceId,
    })
  } catch (error) {
    logger.error('Failed to verify connect code', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

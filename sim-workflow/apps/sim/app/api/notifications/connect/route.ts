import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateConnectCode } from '@/lib/notifications/connect-codes'

const logger = createLogger('notifications/connect')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const workspaceId = request.headers.get('x-workspace-id') || 'default'
    const code = generateConnectCode(auth.userId!, workspaceId)

    return NextResponse.json({
      success: true,
      code,
      instructions: `Send this code to the Telegram bot: ${code}`,
      expiresIn: 300,
    })
  } catch (error) {
    logger.error('Failed to generate connect code', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

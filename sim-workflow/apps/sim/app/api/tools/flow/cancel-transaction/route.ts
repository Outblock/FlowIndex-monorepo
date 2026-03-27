import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { rejectTransaction } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/cancel-transaction')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { pendingId, reason } = body

    if (!pendingId) {
      return NextResponse.json({ success: false, error: 'pendingId is required' }, { status: 400 })
    }

    const workspaceId = request.headers.get('x-workspace-id') || 'default'

    const result = await rejectTransaction(workspaceId, pendingId, auth.userId!, reason)

    return NextResponse.json({
      success: true,
      output: {
        content: result.success
          ? `Transaction ${pendingId} cancelled`
          : `Could not cancel transaction ${pendingId} (status: ${result.status})`,
        ...result,
      },
    })
  } catch (error) {
    logger.error('Cancel transaction failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

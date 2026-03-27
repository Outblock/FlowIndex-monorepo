import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { approveTransaction } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/confirm-transaction')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { pendingId, execute } = body

    if (!pendingId) {
      return NextResponse.json({ success: false, error: 'pendingId is required' }, { status: 400 })
    }

    const workspaceId = request.headers.get('x-workspace-id') || 'default'

    const result = await approveTransaction(
      workspaceId,
      pendingId,
      auth.userId!,
      execute ?? false
    )

    return NextResponse.json({
      success: true,
      output: {
        content: result.txId
          ? `Transaction ${pendingId} approved and executed (txId: ${result.txId})`
          : `Transaction ${pendingId} approved (status: ${result.status})`,
        ...result,
      },
    })
  } catch (error) {
    logger.error('Confirm transaction failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

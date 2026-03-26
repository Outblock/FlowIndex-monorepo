import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { listPending } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/list-pending')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { status } = body

    const workspaceId = request.headers.get('x-workspace-id') || 'default'

    const transactions = await listPending(workspaceId, status)

    return NextResponse.json({
      success: true,
      output: {
        content: `Found ${transactions.length} transaction(s)`,
        transactions: transactions.map((tx) => ({
          id: tx.id,
          status: tx.status,
          mode: tx.mode,
          network: tx.network,
          templateId: tx.templateId,
          signerAddress: tx.signerAddress,
          createdAt: new Date(tx.createdAt).toISOString(),
          expiresAt: new Date(tx.expiresAt).toISOString(),
        })),
        count: transactions.length,
      },
    })
  } catch (error) {
    logger.error('List pending failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

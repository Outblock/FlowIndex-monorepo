import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { validateToken } from '@/lib/approval/token'
import { getTransactionById, rejectTransaction } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('approval/reject')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token required' }, { status: 401 })
    }

    const tx = await getTransactionById(id)
    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
    }

    if (!validateToken(token, id, 'reject', tx.expiresAt)) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    if (tx.expiresAt < Date.now()) {
      return NextResponse.json({ success: false, error: 'Transaction expired' }, { status: 410 })
    }

    if (tx.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Transaction already ${tx.status}` },
        { status: 409 }
      )
    }

    let reason: string | undefined
    try {
      const body = await request.json()
      reason = body?.reason
    } catch {
      // No body or invalid JSON is fine — reason is optional
    }

    const result = await rejectTransaction(tx.workspaceId, id, 'external', reason)
    return NextResponse.json(result)
  } catch (error) {
    logger.error('Reject failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

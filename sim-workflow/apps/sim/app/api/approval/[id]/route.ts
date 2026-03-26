import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { validateToken } from '@/lib/approval/token'
import { getTransactionById } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('approval/view')

export async function GET(
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

    if (!validateToken(token, id, 'view', tx.expiresAt)) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    // Redact sensitive fields before returning
    const { encryptedSignerConfig: _, ...safe } = tx
    return NextResponse.json({ success: true, transaction: safe })
  } catch (error) {
    logger.error('View failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

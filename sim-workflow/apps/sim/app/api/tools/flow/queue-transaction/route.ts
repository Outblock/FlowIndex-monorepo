import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { queueTransaction } from '@/lib/approval/service'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/queue-transaction')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      cadence,
      network,
      signerAddress,
      templateId,
      mode,
      webhookUrl,
      expiresIn,
      signerPrivateKey,
      signerMode,
    } = body
    const args = body.arguments ?? '[]'

    if (!cadence) {
      return NextResponse.json({ success: false, error: 'cadence is required' }, { status: 400 })
    }

    // Build signer config if credentials provided
    const signerConfig = signerPrivateKey
      ? {
          signerMode: signerMode ?? 'legacy',
          signerAddress,
          signerPrivateKey,
        }
      : undefined

    // Extract workspaceId from auth context or request
    const workspaceId = request.headers.get('x-workspace-id') || 'default'

    const result = await queueTransaction({
      workspaceId,
      userId: auth.userId!,
      cadence,
      arguments: args,
      network: network ?? 'mainnet',
      signerAddress,
      templateId,
      mode: mode ?? 'approve-only',
      webhookUrl,
      expiresIn: expiresIn ? Number(expiresIn) : 900,
      signerConfig,
    })

    return NextResponse.json({
      success: true,
      output: {
        content: `Transaction queued for approval (expires in ${expiresIn || 900}s)`,
        ...result,
        expiresAt: new Date(result.expiresAt).toISOString(),
      },
    })
  } catch (error) {
    logger.error('Queue transaction failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

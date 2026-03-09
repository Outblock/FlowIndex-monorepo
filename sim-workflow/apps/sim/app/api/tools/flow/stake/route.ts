import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveSignerFromParams, extractFiAuthFromRequest } from '@/lib/flow/signer-resolver'
import type { SignerParams } from '@/lib/flow/signer-resolver'
import { sendTransaction, formatTxResult } from '@/app/api/tools/flow/tx-helpers'
import { stakeDelegatorCadence } from '@/app/api/tools/flow/cadence-templates'

const logger = createLogger('FlowStake')

const Schema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  nodeId: z.string().optional(),
  signer: z.string().optional(),
  signerAddress: z.string().optional().default(''),
  signerPrivateKey: z.string().optional().default(''),
  network: z.string().optional().default('mainnet'),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await checkInternalAuth(request)
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { amount, nodeId, signer: signerJson, signerAddress, signerPrivateKey, network } = Schema.parse(body)

    if (!nodeId) {
      return NextResponse.json(
        { success: false, error: 'nodeId is required for delegator staking' },
        { status: 400 }
      )
    }

    const cadence = stakeDelegatorCadence(network)

    logger.info(`Staking ${amount} FLOW to node ${nodeId} on ${network}`)

    const fcl = await import('@onflow/fcl')
    const args = [
      fcl.arg(nodeId, fcl.t.String),
      fcl.arg(amount, fcl.t.UFix64),
    ]

    let authz: unknown
    if (signerJson) {
      let signerParams: SignerParams
      try { signerParams = JSON.parse(signerJson) as SignerParams } catch {
        return NextResponse.json({ success: false, error: 'Invalid signer JSON configuration' }, { status: 400 })
      }
      const fiAuth = extractFiAuthFromRequest(request)
      const resolved = await resolveSignerFromParams(signerParams, fiAuth ?? undefined)
      authz = resolved.authz
    }

    const { txId, txStatus } = await sendTransaction({
      cadence,
      args,
      ...(authz ? { authz } : { signerAddress, signerPrivateKey }),
      network,
    })

    return NextResponse.json({ success: true, output: formatTxResult(txId, txStatus) })
  } catch (error) {
    logger.error('Failed to stake FLOW', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to stake FLOW' },
      { status: 500 }
    )
  }
}

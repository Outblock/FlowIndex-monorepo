import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveSignerFromParams, extractFiAuthFromRequest } from '@/lib/flow/signer-resolver'
import type { SignerParams } from '@/lib/flow/signer-resolver'
import { ACCESS_NODES, createAuthz } from '@/app/api/tools/flow/tx-helpers'
import type { FclAuthz } from '@/app/api/tools/flow/tx-helpers'

const logger = createLogger('FlowSendTransaction')

const Schema = z.object({
  script: z.string().min(1, 'Transaction script is required'),
  arguments: z.string().optional().default('[]'),
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
    const { script, arguments: argsJson, signer: signerJson, signerAddress, signerPrivateKey, network } =
      Schema.parse(body)

    const accessNode = ACCESS_NODES[network]
    if (!accessNode) {
      return NextResponse.json(
        { success: false, error: `Invalid network: ${network}. Use "mainnet" or "testnet".` },
        { status: 400 }
      )
    }

    let parsedArgs: unknown[]
    try {
      parsedArgs = JSON.parse(argsJson) as unknown[]
      if (!Array.isArray(parsedArgs)) {
        throw new Error('Arguments must be a JSON array')
      }
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid arguments JSON: ${parseError instanceof Error ? parseError.message : 'parse error'}`,
        },
        { status: 400 }
      )
    }

    const fcl = await import('@onflow/fcl')

    fcl.config().put('accessNode.api', accessNode)

    logger.info(`Sending transaction on ${network}`)

    let typedAuthz: FclAuthz
    if (signerJson) {
      let signerParams: SignerParams
      try {
        signerParams = JSON.parse(signerJson) as SignerParams
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid signer JSON configuration' },
          { status: 400 }
        )
      }
      const fiAuth = extractFiAuthFromRequest(request)
      const { authz } = await resolveSignerFromParams(signerParams, fiAuth ?? undefined)
      typedAuthz = authz as unknown as FclAuthz
    } else if (signerAddress && signerPrivateKey) {
      const authz = createAuthz(fcl, signerAddress, signerPrivateKey)
      typedAuthz = authz as unknown as FclAuthz
    } else {
      return NextResponse.json(
        { success: false, error: 'Either signer config or signerAddress+signerPrivateKey required' },
        { status: 400 }
      )
    }

    const txId: string = await fcl.mutate({
      cadence: script,
      args: () => parsedArgs,
      proposer: typedAuthz,
      payer: typedAuthz,
      authorizations: [typedAuthz] as unknown as FclAuthz[],
      limit: 9999,
    })

    logger.info(`Transaction submitted: ${txId}`)

    const txStatus = await fcl.tx(txId).onceSealed()
    const statusLabel = txStatus.errorMessage ? 'ERROR' : 'SEALED'

    const content = txStatus.errorMessage
      ? `Transaction ${txId} failed: ${txStatus.errorMessage}`
      : `Transaction ${txId} sealed successfully (status: ${txStatus.status})`

    return NextResponse.json({
      success: true,
      output: {
        content,
        transactionId: txId,
        status: statusLabel,
      },
    })
  } catch (error) {
    logger.error('Failed to send transaction', { error })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send transaction',
      },
      { status: 500 }
    )
  }
}

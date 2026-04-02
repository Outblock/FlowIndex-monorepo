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
    const t = await import('@onflow/types')

    /**
     * Map Cadence type name to its @onflow/types transformer.
     * Falls back to String for unknown types.
     */
    const typeMap: Record<string, unknown> = {
      Int: t.Int,
      Int8: t.Int8,
      Int16: t.Int16,
      Int32: t.Int32,
      Int64: t.Int64,
      Int128: t.Int128,
      Int256: t.Int256,
      UInt: t.UInt,
      UInt8: t.UInt8,
      UInt16: t.UInt16,
      UInt32: t.UInt32,
      UInt64: t.UInt64,
      UInt128: t.UInt128,
      UInt256: t.UInt256,
      Fix64: t.Fix64,
      UFix64: t.UFix64,
      Word8: t.Word8,
      Word16: t.Word16,
      Word32: t.Word32,
      Word64: t.Word64,
      String: t.String,
      Address: t.Address,
      Bool: t.Bool,
      Path: t.Path,
      StoragePath: t.StoragePath,
      PublicPath: t.PublicPath,
      PrivatePath: t.PrivatePath,
      Character: t.Character,
    }

    function resolveType(typeName: string): unknown {
      return typeMap[typeName] || t.String
    }

    /**
     * Convert raw {type, value} objects into fcl.arg() calls.
     * Coerces Bool string values to actual booleans.
     */
    function buildFclArgs(args: unknown[]): unknown[] {
      return args.map((arg) => {
        if (arg && typeof arg === 'object' && 'type' in arg && 'value' in arg) {
          const { type, value } = arg as { type: string; value: unknown }
          const fclType = resolveType(type)
          let coercedValue = value
          if (type === 'Bool' && typeof value === 'string') {
            coercedValue = value === 'true'
          }
          return fcl.arg(coercedValue, fclType)
        }
        return arg
      })
    }

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

    const fclArgs = buildFclArgs(parsedArgs)

    const txId: string = await fcl.mutate({
      cadence: script,
      args: () => fclArgs,
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

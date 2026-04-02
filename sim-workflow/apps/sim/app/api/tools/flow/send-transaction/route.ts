import { httpTransport } from '@onflow/transport-http'
import type { TypeDescriptor } from '@onflow/types'
import * as cadenceTypes from '@onflow/types'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import type { SignerParams } from '@/lib/flow/signer-resolver'
import { extractFiAuthFromRequest, resolveSignerFromParams } from '@/lib/flow/signer-resolver'
import type { FclAuthz } from '@/app/api/tools/flow/tx-helpers'
import {
  ACCESS_NODES,
  createAuthz,
  formatTxResult,
  waitForSeal,
} from '@/app/api/tools/flow/tx-helpers'

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
    const {
      script,
      arguments: argsJson,
      signer: signerJson,
      signerAddress,
      signerPrivateKey,
      network,
    } = Schema.parse(body)

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

    /**
     * Map Cadence type name to its @onflow/types transformer.
     * Falls back to String for unknown types.
     */
    const typeMap: Record<string, TypeDescriptor<any, any>> = {
      Int: cadenceTypes.Int,
      Int8: cadenceTypes.Int8,
      Int16: cadenceTypes.Int16,
      Int32: cadenceTypes.Int32,
      Int64: cadenceTypes.Int64,
      Int128: cadenceTypes.Int128,
      Int256: cadenceTypes.Int256,
      UInt: cadenceTypes.UInt,
      UInt8: cadenceTypes.UInt8,
      UInt16: cadenceTypes.UInt16,
      UInt32: cadenceTypes.UInt32,
      UInt64: cadenceTypes.UInt64,
      UInt128: cadenceTypes.UInt128,
      UInt256: cadenceTypes.UInt256,
      Fix64: cadenceTypes.Fix64,
      UFix64: cadenceTypes.UFix64,
      Word8: cadenceTypes.Word8,
      Word16: cadenceTypes.Word16,
      Word32: cadenceTypes.Word32,
      Word64: cadenceTypes.Word64,
      String: cadenceTypes.String,
      Address: cadenceTypes.Address,
      Bool: cadenceTypes.Bool,
      Path: cadenceTypes.Path,
      Character: cadenceTypes.Character,
    }

    function resolveType(typeName: string): TypeDescriptor<any, any> {
      return typeMap[typeName] ?? cadenceTypes.String
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
          return fcl.arg(coercedValue as never, fclType as never)
        }
        return arg
      })
    }

    fcl.config().put('accessNode.api', accessNode).put('sdk.transport', httpTransport)

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
      const { authz } = await resolveSignerFromParams(
        signerParams,
        fiAuth ?? undefined,
        network === 'testnet' ? 'testnet' : 'mainnet'
      )
      typedAuthz = authz as unknown as FclAuthz
    } else if (signerAddress && signerPrivateKey) {
      const authz = await createAuthz(signerAddress, signerPrivateKey, network)
      typedAuthz = authz as unknown as FclAuthz
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Either signer config or signerAddress+signerPrivateKey required',
        },
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

    const { txStatus, timedOut, timeoutMs } = await waitForSeal(txId, accessNode)

    return NextResponse.json({
      success: true,
      output: {
        ...formatTxResult(txId, txStatus, { timedOut, timeoutMs }),
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

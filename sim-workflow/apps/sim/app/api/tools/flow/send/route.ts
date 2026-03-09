import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveSignerFromParams, extractFiAuthFromRequest } from '@/lib/flow/signer-resolver'
import type { SignerParams } from '@/lib/flow/signer-resolver'
import { ACCESS_NODES, formatTxResult } from '@/app/api/tools/flow/tx-helpers'
import {
  createConfiguredCadenceService,
  configureFclForNetwork,
  executeTransfer,
} from '@/lib/flow/cadence-service-adapter'
import type { SendPayload } from '@/lib/flow/cadence-service-adapter'

const logger = createLogger('FlowSend')

const Schema = z.object({
  signer: z.string().min(1, 'Signer configuration is required'),
  sendType: z.enum(['token', 'nft']),
  sender: z.string().min(1, 'Sender address is required'),
  receiver: z.string().min(1, 'Receiver address is required'),
  flowIdentifier: z.string().min(1, 'Flow identifier is required'),
  amount: z.string().optional(),
  nftIds: z.string().optional(),
  network: z.string().optional().default('mainnet'),
  /** Decimal places for the token (required for EVM token transfers). Defaults to 8 for Flow tokens. */
  decimal: z.number().optional().default(8),
  /** EVM contract address for the token (required for EVM-to-EVM non-FLOW transfers) */
  tokenContractAddr: z.string().optional(),
  /** Child account addresses if the sender has linked child accounts */
  childAddrs: z.array(z.string()).optional().default([]),
  /** COA (Cadence Owned Account) EVM address associated with the proposer */
  coaAddr: z.string().optional().default(''),
})

/** Check whether an address looks like an EVM address (0x + 40 hex chars) */
function isEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

/** Normalize an address to include 0x prefix */
function normalizeAddress(addr: string): string {
  if (addr.startsWith('0x')) return addr
  if (/^[0-9a-fA-F]{40}$/.test(addr)) return `0x${addr}`
  if (/^[0-9a-fA-F]{16}$/.test(addr)) return `0x${addr}`
  return addr
}

/** Detect asset type from sender address format */
function detectAssetType(sender: string): 'flow' | 'evm' {
  return isEvmAddress(sender) ? 'evm' : 'flow'
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkInternalAuth(request)
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const {
      signer: signerJson,
      sendType,
      sender: rawSender,
      receiver: rawReceiver,
      flowIdentifier,
      amount,
      nftIds,
      network,
      decimal,
      tokenContractAddr,
      childAddrs,
      coaAddr,
    } = Schema.parse(body)

    // Validate send-type-specific fields
    if (sendType === 'token' && !amount) {
      return NextResponse.json(
        { success: false, error: 'amount is required for token sends' },
        { status: 400 }
      )
    }
    if (sendType === 'nft' && !nftIds) {
      return NextResponse.json(
        { success: false, error: 'nftIds is required for NFT sends' },
        { status: 400 }
      )
    }

    // Normalize addresses
    const sender = normalizeAddress(rawSender)
    const receiver = normalizeAddress(rawReceiver)

    // Parse signer configuration
    let signerParams: SignerParams
    try {
      signerParams = JSON.parse(signerJson) as SignerParams
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid signer JSON configuration' },
        { status: 400 }
      )
    }

    // Resolve signer
    const fiAuth = extractFiAuthFromRequest(request)
    const { signer, authz } = await resolveSignerFromParams(signerParams, fiAuth ?? undefined)

    // Validate network
    const accessNode = ACCESS_NODES[network]
    if (!accessNode) {
      return NextResponse.json(
        { success: false, error: `Invalid network: ${network}. Use "mainnet" or "testnet".` },
        { status: 400 }
      )
    }

    // Auto-detect asset type from sender address
    const assetType = detectAssetType(sender)

    // Build proposer address (the Flow account that signs the transaction)
    const signerInfo = signer.info()
    const signerAddr = signerInfo.flowAddress ?? sender
    const proposer = signerAddr.startsWith('0x') ? signerAddr : `0x${signerAddr}`

    // Build NFT IDs array
    const ids: number[] = nftIds
      ? nftIds.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
      : []

    // Build the SendPayload
    const payload: SendPayload = {
      type: sendType,
      assetType,
      proposer,
      receiver,
      flowIdentifier,
      sender,
      childAddrs,
      ids,
      amount: amount ?? '0.0',
      decimal,
      coaAddr,
      tokenContractAddr: tokenContractAddr ?? '',
    }

    logger.info(
      `Sending ${sendType} via strategy pattern: ${amount ?? ids.join(',')} of ${flowIdentifier} ` +
        `from ${sender} (${assetType}) to ${receiver} on ${network}`
    )

    // Configure FCL with network addresses and contract aliases
    const validNetwork = network === 'testnet' ? 'testnet' : 'mainnet'
    configureFclForNetwork(validNetwork, accessNode)

    // Create a CadenceService instance configured with our signer
    const svc = createConfiguredCadenceService(authz, validNetwork)

    // Execute the transfer via the strategy pattern
    const txId = await executeTransfer(svc, payload)

    if (txId === null) {
      return NextResponse.json(
        {
          success: false,
          error:
            `No matching strategy for this transfer combination: ` +
            `type=${sendType}, assetType=${assetType}, sender=${sender}, receiver=${receiver}`,
        },
        { status: 400 }
      )
    }

    logger.info(`Transaction submitted: ${txId}`)

    // Wait for transaction to seal
    const fcl = await import('@onflow/fcl')
    const txStatus = await fcl.tx(txId).onceSealed()

    return NextResponse.json({
      success: true,
      output: formatTxResult(txId, txStatus),
    })
  } catch (error) {
    logger.error('Failed to send', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send' },
      { status: 500 }
    )
  }
}

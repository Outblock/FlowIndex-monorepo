import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  decodeEventLog,
  erc20Abi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { flowMainnet, flowTestnet } from 'viem/chains'

const logger = createLogger('FlowEvmNativeSend')

const Schema = z
  .object({
    mode: z.enum(['general', 'erc20']),
    to: z.string().optional(),
    data: z.string().optional(),
    value: z.string().optional(),
    tokenAddress: z.string().optional(),
    recipient: z.string().optional(),
    amount: z.string().optional(),
    gasLimit: z.string().optional(),
    privateKey: z.string().min(1, 'Private key is required'),
    network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  })
  .refine(
    (d) => d.mode !== 'general' || (d.to && d.to.length > 0),
    { message: 'to is required for general mode', path: ['to'] }
  )
  .refine(
    (d) => d.mode !== 'erc20' || (d.tokenAddress && d.recipient && d.amount),
    { message: 'tokenAddress, recipient, and amount are required for erc20 mode', path: ['tokenAddress'] }
  )

const CHAIN_CONFIG = {
  mainnet: { chain: flowMainnet, rpc: 'https://mainnet.evm.nodes.onflow.org' },
  testnet: { chain: flowTestnet, rpc: 'https://testnet.evm.nodes.onflow.org' },
} as const

export async function POST(request: NextRequest) {
  try {
    const auth = await checkInternalAuth(request)
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const params = Schema.parse(body)

    const key = params.privateKey.startsWith('0x')
      ? (params.privateKey as `0x${string}`)
      : (`0x${params.privateKey}` as `0x${string}`)
    const account = privateKeyToAccount(key)

    const { chain, rpc } = CHAIN_CONFIG[params.network]
    const transport = http(rpc)

    const publicClient = createPublicClient({ chain, transport })
    const walletClient = createWalletClient({ account, chain, transport })

    let hash: `0x${string}`

    if (params.mode === 'erc20') {
      const tokenAddress = params.tokenAddress as `0x${string}`
      const recipientAddress = params.recipient as `0x${string}`

      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      })

      const parsedAmount = parseUnits(params.amount!, decimals)

      logger.info(`ERC-20 transfer: ${params.amount} (${decimals} decimals) to ${params.recipient} on ${params.network}`)

      hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress, parsedAmount],
        ...(params.gasLimit ? { gas: BigInt(params.gasLimit) } : {}),
      })
    } else {
      const to = params.to as `0x${string}`
      const txParams: Record<string, unknown> = { to }

      if (params.value) {
        txParams.value = parseEther(params.value)
      }
      if (params.data) {
        txParams.data = (params.data.startsWith('0x') ? params.data : `0x${params.data}`) as `0x${string}`
      }
      if (params.gasLimit) {
        txParams.gas = BigInt(params.gasLimit)
      }

      logger.info(`EVM send to ${params.to} on ${params.network} (value: ${params.value || '0'})`)

      hash = await walletClient.sendTransaction(txParams as Parameters<typeof walletClient.sendTransaction>[0])
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    const parsedLogs = receipt.logs.map((log) => {
      const base = {
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
      }
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
        return {
          ...base,
          decoded: {
            eventName: decoded.eventName,
            args: Object.fromEntries(
              Object.entries(decoded.args as Record<string, unknown>).map(([k, v]) => [
                k,
                typeof v === 'bigint' ? v.toString() : v,
              ])
            ),
          },
        }
      } catch {
        return base
      }
    })

    const status = receipt.status === 'success' ? 'success' : 'reverted'
    const gasUsed = Number(receipt.gasUsed)
    const blockNumber = Number(receipt.blockNumber)

    const content =
      params.mode === 'erc20'
        ? `ERC-20 transfer ${status}: ${params.amount} tokens to ${params.recipient} | tx: ${hash} | gas: ${gasUsed} | block: ${blockNumber}`
        : `EVM transaction ${status}: to ${params.to} | value: ${params.value || '0'} FLOW | tx: ${hash} | gas: ${gasUsed} | block: ${blockNumber}`

    return NextResponse.json({
      success: true,
      output: {
        content,
        transactionHash: hash,
        status,
        gasUsed,
        blockNumber,
        logs: parsedLogs,
      },
    })
  } catch (error) {
    logger.error('EVM native send failed', { error })
    const message = error instanceof Error ? error.message : 'EVM native transaction failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

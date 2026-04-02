import type { ToolConfig } from '@/tools/types'
import type { FlowEvmNativeSendParams } from '@/tools/flow/types'

export interface FlowEvmNativeSendResponse {
  success: boolean
  output: {
    content: string
    transactionHash: string
    status: string
    gasUsed: number
    blockNumber: number
    logs: Array<{ address: string; topics: string[]; data: string; decoded?: { eventName: string; args: Record<string, unknown> } }>
  }
}

export const flowEvmNativeSendTool: ToolConfig<
  FlowEvmNativeSendParams,
  FlowEvmNativeSendResponse
> = {
  id: 'flow_evm_native_send',
  name: 'Flow EVM Native Send',
  description:
    'Send a native EVM transaction on Flow using an EVM private key. Supports general transactions and ERC-20 transfers.',
  version: '1.0.0',

  params: {
    mode: {
      type: 'string',
      required: true,
      description: 'Transaction mode: general or erc20',
    },
    to: {
      type: 'string',
      required: false,
      description: 'Destination address (general mode)',
    },
    data: {
      type: 'string',
      required: false,
      description: 'Hex-encoded calldata (general mode)',
    },
    value: {
      type: 'string',
      required: false,
      description: 'Value in FLOW/ETH units e.g. 0.1 (general mode)',
    },
    tokenAddress: {
      type: 'string',
      required: false,
      description: 'ERC-20 contract address (erc20 mode)',
    },
    recipient: {
      type: 'string',
      required: false,
      description: 'Recipient address (erc20 mode)',
    },
    amount: {
      type: 'string',
      required: false,
      description: 'Human-readable token amount (erc20 mode)',
    },
    gasLimit: {
      type: 'string',
      required: false,
      description: 'Gas limit (optional, auto-estimated if omitted)',
    },
    privateKey: {
      type: 'string',
      required: true,
      description: 'EVM private key (hex)',
    },
    network: {
      type: 'string',
      required: false,
      description: 'Flow EVM network: mainnet or testnet (default: mainnet)',
    },
  },

  request: {
    url: '/api/tools/flow/evm-native-send',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      mode: params.mode,
      to: params.to,
      data: params.data,
      value: params.value,
      tokenAddress: params.tokenAddress,
      recipient: params.recipient,
      amount: params.amount,
      gasLimit: params.gasLimit,
      privateKey: params.privateKey,
      network: params.network ?? 'mainnet',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'EVM native transaction failed',
          transactionHash: '',
          status: 'ERROR',
          gasUsed: 0,
          blockNumber: 0,
          logs: [],
        },
        error: data.error,
      } as unknown as FlowEvmNativeSendResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Human-readable transaction summary' },
    transactionHash: { type: 'string', description: 'EVM transaction hash' },
    status: { type: 'string', description: 'success or reverted' },
    gasUsed: { type: 'number', description: 'Gas consumed' },
    blockNumber: { type: 'number', description: 'Block number' },
    logs: { type: 'json', description: 'Parsed event logs' },
  },
}

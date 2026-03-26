import type { ToolConfig } from '@/tools/types'
import type { FlowSimulateTransactionParams } from '@/tools/flow/types'

export interface FlowSimulateTransactionResponse {
  success: boolean
  output: {
    content: string
    simulationSuccess: boolean
    events: Array<{ type: string; payload: unknown }>
    computationUsed: number
    balanceChanges: Array<{
      address: string
      token: string
      delta: string
    }>
    error?: string
  }
}

export const flowSimulateTransactionTool: ToolConfig<
  FlowSimulateTransactionParams,
  FlowSimulateTransactionResponse
> = {
  id: 'flow_simulate_transaction',
  name: 'Flow Simulate Transaction',
  description:
    'Simulate a Cadence transaction on mainnet-fork without signing. Returns events, gas usage, and balance changes.',
  version: '1.0.0',

  params: {
    cadence: {
      type: 'string',
      required: true,
      description: 'Cadence transaction code to simulate',
    },
    arguments: {
      type: 'string',
      required: false,
      description: 'JSON-CDC arguments array (default: [])',
    },
    network: {
      type: 'string',
      required: false,
      description: 'Flow network: mainnet only (default: mainnet)',
    },
    signerAddress: {
      type: 'string',
      required: false,
      description: 'Flow address to use as authorizer (16-char hex)',
    },
  },

  request: {
    url: '/api/tools/flow/simulate-transaction',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      cadence: params.cadence,
      arguments: params.arguments ?? '[]',
      network: params.network ?? 'mainnet',
      signerAddress: params.signerAddress,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Simulation failed',
          simulationSuccess: false,
          events: [],
          computationUsed: 0,
          balanceChanges: [],
          error: data.error,
        },
        error: data.error,
      } as unknown as FlowSimulateTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Human-readable simulation summary' },
    simulationSuccess: { type: 'boolean', description: 'Whether the simulated tx succeeded' },
    events: { type: 'json', description: 'Emitted Cadence events' },
    computationUsed: { type: 'number', description: 'Computation (gas) used' },
    balanceChanges: { type: 'json', description: 'Token balance changes' },
    error: { type: 'string', description: 'Error message if simulation failed' },
  },
}

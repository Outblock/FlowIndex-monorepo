import type { ToolConfig } from '@/tools/types'
import type { FlowSimulateTemplateParams } from '@/tools/flow/types'
import type { FlowSimulateTransactionResponse } from '@/tools/flow/simulate_transaction'

export const flowSimulateTemplateTool: ToolConfig<
  FlowSimulateTemplateParams,
  FlowSimulateTransactionResponse
> = {
  id: 'flow_simulate_template',
  name: 'Flow Simulate Template',
  description:
    'Simulate a Cadence template transaction on mainnet-fork. Resolves template and converts key-value arguments to JSON-CDC before simulation.',
  version: '1.0.0',

  params: {
    templateId: {
      type: 'string',
      required: true,
      description: 'Template name (e.g. "transfer_tokens_v3")',
    },
    arguments: {
      type: 'string',
      required: false,
      description:
        'JSON key-value arguments (e.g. {"amount": "100.0", "to": "0xabcdef1234567890"})',
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
    url: '/api/tools/flow/simulate-template',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      templateId: params.templateId,
      arguments: params.arguments ?? '{}',
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

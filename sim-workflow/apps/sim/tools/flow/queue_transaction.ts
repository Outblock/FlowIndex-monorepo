import type { ToolConfig } from '@/tools/types'
import type { FlowQueueTransactionParams } from '@/tools/flow/types'

export interface FlowQueueTransactionResponse {
  success: boolean
  output: {
    content: string
    pendingId: string
    approveUrl: string
    rejectUrl: string
    detailsUrl: string
    expiresAt: string
  }
}

export const flowQueueTransactionTool: ToolConfig<
  FlowQueueTransactionParams,
  FlowQueueTransactionResponse
> = {
  id: 'flow_queue_transaction',
  name: 'Flow Queue Transaction',
  description:
    'Queue a Cadence transaction for human approval before execution. Returns approval URLs.',
  version: '1.0.0',

  params: {
    cadence: {
      type: 'string',
      required: true,
      description: 'Cadence transaction code',
    },
    arguments: {
      type: 'string',
      required: false,
      description: 'JSON-CDC arguments (default: [])',
    },
    network: {
      type: 'string',
      required: false,
      description: 'mainnet or testnet (default: mainnet)',
    },
    signerAddress: {
      type: 'string',
      required: false,
      description: 'Authorizer address (16-char hex)',
    },
    templateId: {
      type: 'string',
      required: false,
      description: 'Template name if from template',
    },
    mode: {
      type: 'string',
      required: false,
      description: 'approve-only or passkey-sign (default: approve-only)',
    },
    webhookUrl: {
      type: 'string',
      required: false,
      description: 'URL to POST approval notification',
    },
    expiresIn: {
      type: 'string',
      required: false,
      description: 'Expiration in seconds (default: 900)',
    },
    signerPrivateKey: {
      type: 'string',
      required: false,
      description: 'Signer private key (encrypted at rest)',
    },
    signerMode: {
      type: 'string',
      required: false,
      description: 'Signer mode: legacy, cloud, passkey',
    },
  },

  request: {
    url: '/api/tools/flow/queue-transaction',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      cadence: params.cadence,
      arguments: params.arguments ?? '[]',
      network: params.network ?? 'mainnet',
      signerAddress: params.signerAddress,
      templateId: params.templateId,
      mode: params.mode ?? 'approve-only',
      webhookUrl: params.webhookUrl,
      expiresIn: params.expiresIn ? Number(params.expiresIn) : 900,
      signerPrivateKey: params.signerPrivateKey,
      signerMode: params.signerMode ?? 'legacy',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Failed to queue',
          pendingId: '',
          approveUrl: '',
          rejectUrl: '',
          detailsUrl: '',
          expiresAt: '',
        },
        error: data.error,
      } as unknown as FlowQueueTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Status message' },
    pendingId: { type: 'string', description: 'Pending transaction ID' },
    approveUrl: { type: 'string', description: 'URL to approve the transaction' },
    rejectUrl: { type: 'string', description: 'URL to reject the transaction' },
    detailsUrl: { type: 'string', description: 'URL to view transaction details' },
    expiresAt: { type: 'string', description: 'Expiration timestamp (ISO 8601)' },
  },
}

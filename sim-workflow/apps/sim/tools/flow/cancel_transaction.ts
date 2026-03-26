import type { ToolConfig } from '@/tools/types'
import type { FlowCancelTransactionParams } from '@/tools/flow/types'

export interface FlowCancelTransactionResponse {
  success: boolean
  output: {
    content: string
    status: string
  }
}

export const flowCancelTransactionTool: ToolConfig<
  FlowCancelTransactionParams,
  FlowCancelTransactionResponse
> = {
  id: 'flow_cancel_transaction',
  name: 'Flow Cancel Transaction',
  description: 'Cancel a pending transaction from the approval queue',
  version: '1.0.0',

  params: {
    pendingId: {
      type: 'string',
      required: true,
      description: 'Pending transaction ID to cancel',
    },
    reason: {
      type: 'string',
      required: false,
      description: 'Reason for cancellation',
    },
  },

  request: {
    url: '/api/tools/flow/cancel-transaction',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      pendingId: params.pendingId,
      reason: params.reason,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Failed to cancel',
          status: 'error',
        },
        error: data.error,
      } as unknown as FlowCancelTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Status message' },
    status: { type: 'string', description: 'Transaction status after cancellation' },
  },
}

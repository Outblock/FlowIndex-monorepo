import type { ToolConfig } from '@/tools/types'
import type { FlowConfirmTransactionParams } from '@/tools/flow/types'

export interface FlowConfirmTransactionResponse {
  success: boolean
  output: {
    content: string
    status: string
    txId?: string
    error?: string
  }
}

export const flowConfirmTransactionTool: ToolConfig<
  FlowConfirmTransactionParams,
  FlowConfirmTransactionResponse
> = {
  id: 'flow_confirm_transaction',
  name: 'Flow Confirm Transaction',
  description: 'Approve and execute a pending transaction from the approval queue',
  version: '1.0.0',

  params: {
    pendingId: {
      type: 'string',
      required: true,
      description: 'Pending transaction ID to approve',
    },
    execute: {
      type: 'string',
      required: false,
      description: 'Execute immediately after approval (default: true)',
    },
  },

  request: {
    url: '/api/tools/flow/confirm-transaction',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      pendingId: params.pendingId,
      execute: params.execute !== 'false',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Failed',
          status: 'error',
          error: data.error,
        },
        error: data.error,
      } as unknown as FlowConfirmTransactionResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Status message' },
    status: { type: 'string', description: 'Transaction status after confirmation' },
    txId: { type: 'string', description: 'Transaction ID if executed' },
    error: { type: 'string', description: 'Error message if execution failed' },
  },
}

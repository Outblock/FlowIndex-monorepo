import type { ToolConfig } from '@/tools/types'
import type { FlowListPendingParams } from '@/tools/flow/types'

export interface FlowListPendingResponse {
  success: boolean
  output: {
    content: string
    transactions: Array<{
      pendingId: string
      status: string
      cadence: string
      network: string
      createdAt: string
      expiresAt: string
    }>
  }
}

export const flowListPendingTool: ToolConfig<
  FlowListPendingParams,
  FlowListPendingResponse
> = {
  id: 'flow_list_pending',
  name: 'Flow List Pending',
  description: 'List pending transactions in the approval queue',
  version: '1.0.0',

  params: {
    status: {
      type: 'string',
      required: false,
      description: 'Filter by status: pending, approved, rejected, expired (default: pending)',
    },
  },

  request: {
    url: '/api/tools/flow/list-pending',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      status: params.status,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'Failed to list pending transactions',
          transactions: [],
        },
        error: data.error,
      } as unknown as FlowListPendingResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Summary of pending transactions' },
    transactions: { type: 'json', description: 'Array of pending transaction objects' },
  },
}

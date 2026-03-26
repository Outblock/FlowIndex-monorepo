import type { ToolConfig } from '@/tools/types'
import type { FlowListTemplatesParams } from '@/tools/flow/types'

export interface FlowListTemplatesResponse {
  success: boolean
  output: {
    content: string
    templates: Array<{
      name: string
      category: string
      type: string
      description: string
    }>
  }
}

export const flowListTemplatesTool: ToolConfig<FlowListTemplatesParams, FlowListTemplatesResponse> =
  {
    id: 'flow_list_templates',
    name: 'Flow List Templates',
    description:
      'List available audited Cadence transaction and script templates by category',
    version: '1.0.0',

    params: {
      category: {
        type: 'string',
        required: false,
        description:
          'Filter by category: base, token, collection, bridge, evm, hybrid-custody, lost-and-found',
      },
    },

    request: {
      url: '/api/tools/flow/list-templates',
      method: 'POST',
      headers: () => ({ 'Content-Type': 'application/json' }),
      body: (params) => ({
        category: params.category,
      }),
    },

    transformResponse: async (response) => {
      const data = await response.json()
      if (!data.success) {
        return {
          success: false,
          output: { content: data.error || 'Failed to list templates', templates: [] },
          error: data.error,
        } as unknown as FlowListTemplatesResponse
      }
      return { success: true, output: data.output }
    },

    outputs: {
      content: { type: 'string', description: 'Summary of available templates' },
      templates: { type: 'json', description: 'Array of template metadata' },
    },
  }

import type { ToolConfig } from '@/tools/types'
import type { FlowGetTemplateParams } from '@/tools/flow/types'

export interface FlowGetTemplateResponse {
  success: boolean
  output: {
    content: string
    template: {
      name: string
      category: string
      type: string
      description: string
      cadence: string
      arguments: Array<{ name: string; type: string; description: string }>
    }
  }
}

export const flowGetTemplateTool: ToolConfig<FlowGetTemplateParams, FlowGetTemplateResponse> = {
  id: 'flow_get_template',
  name: 'Flow Get Template',
  description:
    'Get the full Cadence source code and argument schema for a specific template',
  version: '1.0.0',

  params: {
    templateId: {
      type: 'string',
      required: true,
      description: 'Template name (e.g. "transfer_tokens_v3")',
    },
  },

  request: {
    url: '/api/tools/flow/get-template',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      templateId: params.templateId,
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: { content: data.error || 'Template not found', template: null },
        error: data.error,
      } as unknown as FlowGetTemplateResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Template description and argument info' },
    template: { type: 'json', description: 'Full template with Cadence source' },
  },
}

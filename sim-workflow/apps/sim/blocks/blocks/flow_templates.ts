import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowTemplatesBlock: BlockConfig = {
  type: 'flow_templates',
  name: 'Flow Templates',
  description: 'Browse and inspect audited Cadence transaction and script templates',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'action',
      title: 'Action',
      type: 'dropdown',
      options: [
        { label: 'List Templates', id: 'list' },
        { label: 'Get Template', id: 'get' },
      ],
    },
    {
      id: 'category',
      title: 'Category',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Base', id: 'base' },
        { label: 'Token', id: 'token' },
        { label: 'Collection (NFT)', id: 'collection' },
        { label: 'Bridge', id: 'bridge' },
        { label: 'EVM', id: 'evm' },
        { label: 'Hybrid Custody', id: 'hybrid-custody' },
        { label: 'Lost and Found', id: 'lost-and-found' },
      ],
      condition: { field: 'action', value: 'list' },
    },
    {
      id: 'templateId',
      title: 'Template ID',
      type: 'short-input',
      placeholder: 'e.g. transfer_tokens_v3',
      condition: { field: 'action', value: 'get' },
    },
  ],
  tools: {
    access: ['flow_list_templates', 'flow_get_template'],
    config: {
      tool: (params) =>
        params.action === 'get' ? 'flow_get_template' : 'flow_list_templates',
      params: (params) => {
        if (params.action === 'get') {
          return { templateId: params.templateId }
        }
        return { category: params.category || undefined }
      },
    },
  },
  inputs: {
    action: { type: 'string', description: 'Action: list or get' },
    category: { type: 'string', description: 'Template category filter' },
    templateId: { type: 'string', description: 'Template name to retrieve' },
  },
  outputs: {
    content: { type: 'string', description: 'Summary text' },
    templates: { type: 'json', description: 'Template list (list action)' },
    template: { type: 'json', description: 'Full template detail (get action)' },
  },
}

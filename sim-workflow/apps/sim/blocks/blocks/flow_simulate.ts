import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowSimulateBlock: BlockConfig = {
  type: 'flow_simulate',
  name: 'Flow Simulate',
  description:
    'Simulate a Cadence transaction on mainnet-fork without signing. Preview events, gas, and balance changes.',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'Raw Cadence', id: 'raw' },
        { label: 'Template', id: 'template' },
      ],
    },
    {
      id: 'cadence',
      title: 'Cadence Transaction',
      type: 'code',
      placeholder: 'transaction() {\n  prepare(signer: &Account) {}\n  execute {}\n}',
      condition: { field: 'mode', value: 'raw' },
    },
    {
      id: 'templateId',
      title: 'Template ID',
      type: 'short-input',
      placeholder: 'e.g. transfer_tokens_v3',
      condition: { field: 'mode', value: 'template' },
    },
    {
      id: 'arguments',
      title: 'Arguments',
      type: 'code',
      placeholder: '[]',
    },
    {
      id: 'network',
      title: 'Network',
      type: 'dropdown',
      options: [
        { label: 'Mainnet', id: 'mainnet' },
        { label: 'Testnet', id: 'testnet' },
      ],
    },
    {
      id: 'signerAddress',
      title: 'Signer Address (optional)',
      type: 'short-input',
      placeholder: 'Flow address (16-char hex)',
    },
  ],
  tools: {
    access: ['flow_simulate_transaction', 'flow_simulate_template'],
    config: {
      tool: (params) =>
        params.mode === 'template'
          ? 'flow_simulate_template'
          : 'flow_simulate_transaction',
      params: (params) => {
        if (params.mode === 'template') {
          return {
            templateId: params.templateId,
            arguments: params.arguments ?? '{}',
            network: params.network ?? 'mainnet',
            signerAddress: params.signerAddress || undefined,
          }
        }
        return {
          cadence: params.cadence,
          arguments: params.arguments ?? '[]',
          network: params.network ?? 'mainnet',
          signerAddress: params.signerAddress || undefined,
        }
      },
    },
  },
  inputs: {
    mode: { type: 'string', description: 'Simulation mode: raw or template' },
    cadence: { type: 'string', description: 'Raw Cadence transaction code' },
    templateId: { type: 'string', description: 'Template name' },
    arguments: { type: 'string', description: 'Transaction arguments' },
    network: { type: 'string', description: 'Flow network' },
    signerAddress: { type: 'string', description: 'Authorizer address' },
  },
  outputs: {
    content: { type: 'string', description: 'Human-readable simulation summary' },
    simulationSuccess: { type: 'boolean', description: 'Whether simulation passed' },
    events: { type: 'json', description: 'Emitted Cadence events' },
    computationUsed: { type: 'number', description: 'Gas computation used' },
    balanceChanges: { type: 'json', description: 'Token balance changes' },
    error: { type: 'string', description: 'Error if simulation failed' },
  },
}

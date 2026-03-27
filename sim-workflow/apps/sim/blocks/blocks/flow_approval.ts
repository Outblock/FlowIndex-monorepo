import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowApprovalBlock: BlockConfig = {
  type: 'flow_approval',
  name: 'Flow Approval',
  description:
    'Queue transactions for human approval before execution. Supports webhook notifications.',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'action',
      title: 'Action',
      type: 'dropdown',
      options: [
        { label: 'Queue Transaction', id: 'queue' },
        { label: 'Confirm', id: 'confirm' },
        { label: 'Cancel', id: 'cancel' },
        { label: 'List Pending', id: 'list' },
      ],
    },
    {
      id: 'mode',
      title: 'Approval Mode',
      type: 'dropdown',
      options: [
        { label: 'Approve Only', id: 'approve-only' },
        { label: 'Passkey Sign', id: 'passkey-sign' },
      ],
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'cadence',
      title: 'Cadence Transaction',
      type: 'code',
      placeholder: 'transaction() {\n  prepare(signer: &Account) {}\n  execute {}\n}',
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'templateId',
      title: 'Template ID (optional)',
      type: 'short-input',
      placeholder: 'e.g. transfer_tokens_v3',
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'arguments',
      title: 'Arguments',
      type: 'code',
      placeholder: '[]',
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'network',
      title: 'Network',
      type: 'dropdown',
      options: [
        { label: 'Mainnet', id: 'mainnet' },
        { label: 'Testnet', id: 'testnet' },
      ],
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'signerAddress',
      title: 'Signer Address',
      type: 'short-input',
      placeholder: 'Flow address (16-char hex)',
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'webhookUrl',
      title: 'Webhook URL',
      type: 'short-input',
      placeholder: 'https://hooks.example.com/notify',
      condition: { field: 'action', value: 'queue' },
    },
    {
      id: 'pendingId',
      title: 'Pending ID',
      type: 'short-input',
      placeholder: 'UUID of pending transaction',
      condition: { field: 'action', value: ['confirm', 'cancel'] },
    },
    {
      id: 'execute',
      title: 'Execute After Approval',
      type: 'dropdown',
      options: [
        { label: 'Yes', id: 'true' },
        { label: 'No', id: 'false' },
      ],
      condition: { field: 'action', value: 'confirm' },
    },
    {
      id: 'statusFilter',
      title: 'Status Filter',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Pending', id: 'pending' },
        { label: 'Approved', id: 'approved' },
        { label: 'Rejected', id: 'rejected' },
        { label: 'Expired', id: 'expired' },
      ],
      condition: { field: 'action', value: 'list' },
    },
  ],
  tools: {
    access: [
      'flow_queue_transaction',
      'flow_confirm_transaction',
      'flow_cancel_transaction',
      'flow_list_pending',
    ],
    config: {
      tool: (params) => {
        switch (params.action) {
          case 'confirm':
            return 'flow_confirm_transaction'
          case 'cancel':
            return 'flow_cancel_transaction'
          case 'list':
            return 'flow_list_pending'
          default:
            return 'flow_queue_transaction'
        }
      },
      params: (params) => {
        switch (params.action) {
          case 'queue':
            return {
              cadence: params.cadence,
              arguments: params.arguments ?? '[]',
              network: params.network ?? 'mainnet',
              signerAddress: params.signerAddress || undefined,
              templateId: params.templateId || undefined,
              mode: params.mode ?? 'approve-only',
              webhookUrl: params.webhookUrl || undefined,
            }
          case 'confirm':
            return {
              pendingId: params.pendingId,
              execute: params.execute ?? 'true',
            }
          case 'cancel':
            return { pendingId: params.pendingId }
          case 'list':
            return { status: params.statusFilter || undefined }
          default:
            return {}
        }
      },
    },
  },
  inputs: {
    action: { type: 'string', description: 'Action: queue, confirm, cancel, or list' },
    mode: { type: 'string', description: 'Approval mode' },
    cadence: { type: 'string', description: 'Cadence transaction code' },
    templateId: { type: 'string', description: 'Template name' },
    arguments: { type: 'string', description: 'Transaction arguments' },
    network: { type: 'string', description: 'Flow network' },
    signerAddress: { type: 'string', description: 'Authorizer address' },
    webhookUrl: { type: 'string', description: 'Webhook notification URL' },
    pendingId: { type: 'string', description: 'Pending transaction ID' },
    execute: { type: 'string', description: 'Execute after approval' },
    statusFilter: { type: 'string', description: 'Filter by status' },
  },
  outputs: {
    content: { type: 'string', description: 'Status message' },
    pendingId: { type: 'string', description: 'Pending transaction ID' },
    approveUrl: { type: 'string', description: 'Approval callback URL' },
    rejectUrl: { type: 'string', description: 'Rejection callback URL' },
    status: { type: 'string', description: 'Transaction status' },
    txId: { type: 'string', description: 'Executed transaction ID' },
    transactions: { type: 'json', description: 'List of pending transactions' },
  },
}

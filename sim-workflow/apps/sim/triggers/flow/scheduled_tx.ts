import { FlowIcon } from '@/components/icons'
import { buildTriggerSubBlocks } from '@/triggers'
import type { TriggerConfig } from '@/triggers/types'
import { FLOW_TRIGGER_OPTIONS, flowSetupInstructions } from './constants'

export const flowScheduledTxTrigger: TriggerConfig = {
  id: 'flow_scheduled_tx',
  name: 'Flow Scheduled TX Executed',
  provider: 'flow',
  description: 'Triggered when a scheduled transaction executes on Flow',
  version: '1.0.0',
  icon: FlowIcon,

  subBlocks: buildTriggerSubBlocks({
    triggerId: 'flow_scheduled_tx',
    triggerOptions: FLOW_TRIGGER_OPTIONS,
    setupInstructions: flowSetupInstructions('scheduled transaction execution'),
    hideWebhookUrl: true,
    extraFields: [
      {
        id: 'handlerAddress',
        title: 'Handler Address',
        type: 'short-input',
        placeholder: '0x... (handler owner address, optional)',
        description: 'Only trigger for scheduled txs from this handler owner',
        mode: 'trigger',
        condition: { field: 'selectedTriggerId', value: 'flow_scheduled_tx' },
      },
      {
        id: 'handlerName',
        title: 'Handler Name',
        type: 'short-input',
        placeholder: 'e.g. DeFiActions, SwapKeepAliveHandlerV2 (optional)',
        description: 'Only trigger for this specific handler type name',
        mode: 'trigger',
        condition: { field: 'selectedTriggerId', value: 'flow_scheduled_tx' },
      },
      {
        id: 'hideIdle',
        title: 'Hide Idle Runs',
        type: 'dropdown',
        options: [
          { label: 'Show all executions', id: 'false' },
          { label: 'Hide idle (no-op) runs', id: 'true' },
        ],
        description: 'Filter out executions with no meaningful side effects',
        mode: 'trigger',
        condition: { field: 'selectedTriggerId', value: 'flow_scheduled_tx' },
      },
    ],
  }),

  outputs: {
    scheduledId: { type: 'number', description: 'Scheduled transaction ID' },
    handlerOwner: { type: 'string', description: 'Handler owner address' },
    handlerType: { type: 'string', description: 'Handler type identifier' },
    priority: { type: 'string', description: 'Priority level (High/Medium/Low)' },
    executedTxId: { type: 'string', description: 'Executor transaction ID' },
    blockHeight: { type: 'number', description: 'Execution block height' },
    timestamp: { type: 'string', description: 'Execution timestamp' },
    isIdle: { type: 'boolean', description: 'Whether the run was idle (no side effects)' },
    data: { type: 'json', description: 'Full scheduled transaction data' },
  },

  webhook: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  },
}

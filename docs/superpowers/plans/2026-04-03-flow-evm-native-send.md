# Flow EVM Native Send Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sim-workflow block that sends native EVM transactions on Flow using an EVM private key directly (via viem), supporting general transactions and ERC-20 transfers.

**Architecture:** New block `flow_evm_native_send` with tool + API route. The API route uses viem to create a wallet client from a private key, sends the transaction to Flow's official EVM RPC endpoints, waits for receipt, and parses logs. Two modes: general (to/data/value) and erc20 (token/recipient/amount with auto decimals detection).

**Tech Stack:** viem (walletClient, publicClient, parseEther, parseUnits, decodeEventLog), Next.js API route, Zod validation

---

### Task 1: Add viem dependency

**Files:**
- Modify: `sim-workflow/apps/sim/package.json`

- [ ] **Step 1: Install viem**

```bash
cd sim-workflow/apps/sim && bun add viem
```

- [ ] **Step 2: Verify installation**

```bash
cd sim-workflow/apps/sim && bun pm ls | grep viem
```

Expected: viem version listed in output

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/package.json sim-workflow/bun.lock
git commit -m "feat(sim): add viem dependency for EVM native send"
```

---

### Task 2: Add EthIcon to icons.tsx

**Files:**
- Modify: `sim-workflow/apps/sim/components/icons.tsx`

- [ ] **Step 1: Add EthIcon component**

Add the following export near the existing `FlowIcon` in `sim-workflow/apps/sim/components/icons.tsx`:

```typescript
export function EthIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <circle cx="50" cy="50" r="50" fill="#8B5CF6" />
      <path
        d="M50.1 18L49.5 20v39.2l.6.6L70 49.3z"
        fill="rgba(255,255,255,0.6)"
      />
      <path d="M50.1 18L30 49.3l20.1 10.5V18z" fill="#fff" />
      <path
        d="M50.1 63.7l-.3.4v15.4l.3.9L70 53.2z"
        fill="rgba(255,255,255,0.6)"
      />
      <path d="M50.1 80.4V63.7L30 53.2z" fill="#fff" />
      <path
        d="M50.1 59.8L70 49.3l-19.9-11v21.5z"
        fill="rgba(255,255,255,0.2)"
      />
      <path d="M30 49.3l20.1 10.5V38.3z" fill="rgba(255,255,255,0.6)" />
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add sim-workflow/apps/sim/components/icons.tsx
git commit -m "feat(sim): add purple EthIcon for EVM native send block"
```

---

### Task 3: Add params type

**Files:**
- Modify: `sim-workflow/apps/sim/tools/flow/types.ts`

- [ ] **Step 1: Add FlowEvmNativeSendParams interface**

Append to the end of `sim-workflow/apps/sim/tools/flow/types.ts`:

```typescript
/** Parameters for evm_native_send tool */
export interface FlowEvmNativeSendParams {
  mode: string
  to?: string
  data?: string
  value?: string
  tokenAddress?: string
  recipient?: string
  amount?: string
  gasLimit?: string
  privateKey: string
  network?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/types.ts
git commit -m "feat(sim): add FlowEvmNativeSendParams type"
```

---

### Task 4: Create tool definition

**Files:**
- Create: `sim-workflow/apps/sim/tools/flow/evm_native_send.ts`
- Modify: `sim-workflow/apps/sim/tools/flow/index.ts`
- Modify: `sim-workflow/apps/sim/tools/registry.ts`

- [ ] **Step 1: Create tool file**

Create `sim-workflow/apps/sim/tools/flow/evm_native_send.ts`:

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowEvmNativeSendParams } from '@/tools/flow/types'

export interface FlowEvmNativeSendResponse {
  success: boolean
  output: {
    content: string
    transactionHash: string
    status: string
    gasUsed: number
    blockNumber: number
    logs: Array<{ address: string; topics: string[]; data: string; decoded?: { eventName: string; args: Record<string, unknown> } }>
  }
}

export const flowEvmNativeSendTool: ToolConfig<
  FlowEvmNativeSendParams,
  FlowEvmNativeSendResponse
> = {
  id: 'flow_evm_native_send',
  name: 'Flow EVM Native Send',
  description:
    'Send a native EVM transaction on Flow using an EVM private key. Supports general transactions and ERC-20 transfers.',
  version: '1.0.0',

  params: {
    mode: {
      type: 'string',
      required: true,
      description: 'Transaction mode: general or erc20',
    },
    to: {
      type: 'string',
      required: false,
      description: 'Destination address (general mode)',
    },
    data: {
      type: 'string',
      required: false,
      description: 'Hex-encoded calldata (general mode)',
    },
    value: {
      type: 'string',
      required: false,
      description: 'Value in FLOW/ETH units e.g. 0.1 (general mode)',
    },
    tokenAddress: {
      type: 'string',
      required: false,
      description: 'ERC-20 contract address (erc20 mode)',
    },
    recipient: {
      type: 'string',
      required: false,
      description: 'Recipient address (erc20 mode)',
    },
    amount: {
      type: 'string',
      required: false,
      description: 'Human-readable token amount (erc20 mode)',
    },
    gasLimit: {
      type: 'string',
      required: false,
      description: 'Gas limit (optional, auto-estimated if omitted)',
    },
    privateKey: {
      type: 'string',
      required: true,
      description: 'EVM private key (hex)',
    },
    network: {
      type: 'string',
      required: false,
      description: 'Flow EVM network: mainnet or testnet (default: mainnet)',
    },
  },

  request: {
    url: '/api/tools/flow/evm-native-send',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      mode: params.mode,
      to: params.to,
      data: params.data,
      value: params.value,
      tokenAddress: params.tokenAddress,
      recipient: params.recipient,
      amount: params.amount,
      gasLimit: params.gasLimit,
      privateKey: params.privateKey,
      network: params.network ?? 'mainnet',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: {
          content: data.error || 'EVM native transaction failed',
          transactionHash: '',
          status: 'ERROR',
          gasUsed: 0,
          blockNumber: 0,
          logs: [],
        },
        error: data.error,
      } as unknown as FlowEvmNativeSendResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Human-readable transaction summary' },
    transactionHash: { type: 'string', description: 'EVM transaction hash' },
    status: { type: 'string', description: 'success or reverted' },
    gasUsed: { type: 'number', description: 'Gas consumed' },
    blockNumber: { type: 'number', description: 'Block number' },
    logs: { type: 'json', description: 'Parsed event logs' },
  },
}
```

- [ ] **Step 2: Add export to index.ts**

Add to `sim-workflow/apps/sim/tools/flow/index.ts`:

```typescript
export { flowEvmNativeSendTool } from '@/tools/flow/evm_native_send'
```

- [ ] **Step 3: Register in tools/registry.ts**

Add import alongside the existing flow imports:

```typescript
  flowEvmNativeSendTool,
```

Add to the registry object (alphabetically near `flow_evm_call` / `flow_evm_send`):

```typescript
  flow_evm_native_send: flowEvmNativeSendTool,
```

- [ ] **Step 4: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/evm_native_send.ts sim-workflow/apps/sim/tools/flow/index.ts sim-workflow/apps/sim/tools/registry.ts
git commit -m "feat(sim): add flow_evm_native_send tool definition"
```

---

### Task 5: Create block definition

**Files:**
- Create: `sim-workflow/apps/sim/blocks/blocks/flow_evm_native_send.ts`
- Modify: `sim-workflow/apps/sim/blocks/registry.ts`

- [ ] **Step 1: Create block file**

Create `sim-workflow/apps/sim/blocks/blocks/flow_evm_native_send.ts`:

```typescript
import { EthIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowEvmNativeSendBlock: BlockConfig = {
  type: 'flow_evm_native_send',
  name: 'Flow EVM Native Send',
  description:
    'Send a native EVM transaction on Flow using an EVM private key. Supports general transactions and ERC-20 transfers.',
  category: 'tools',
  bgColor: '#8B5CF6',
  icon: EthIcon,
  subBlocks: [
    {
      id: 'mode',
      title: 'Mode',
      type: 'dropdown',
      options: [
        { label: 'General Transaction', id: 'general' },
        { label: 'ERC-20 Transfer', id: 'erc20' },
      ],
    },
    {
      id: 'to',
      title: 'To Address',
      type: 'short-input',
      placeholder: '0x1234...abcd',
      condition: { field: 'mode', value: 'general' },
      required: { field: 'mode', value: 'general' },
    },
    {
      id: 'data',
      title: 'Calldata (hex)',
      type: 'short-input',
      placeholder: '0x...',
      condition: { field: 'mode', value: 'general' },
    },
    {
      id: 'value',
      title: 'Value (FLOW)',
      type: 'short-input',
      placeholder: '0.0',
      condition: { field: 'mode', value: 'general' },
    },
    {
      id: 'tokenAddress',
      title: 'Token Contract Address',
      type: 'short-input',
      placeholder: '0x...',
      condition: { field: 'mode', value: 'erc20' },
      required: { field: 'mode', value: 'erc20' },
    },
    {
      id: 'recipient',
      title: 'Recipient Address',
      type: 'short-input',
      placeholder: '0x...',
      condition: { field: 'mode', value: 'erc20' },
      required: { field: 'mode', value: 'erc20' },
    },
    {
      id: 'amount',
      title: 'Amount',
      type: 'short-input',
      placeholder: '100.5',
      condition: { field: 'mode', value: 'erc20' },
      required: { field: 'mode', value: 'erc20' },
    },
    {
      id: 'gasLimit',
      title: 'Gas Limit (optional)',
      type: 'short-input',
      placeholder: 'Auto-estimate if empty',
    },
    {
      id: 'privateKey',
      title: 'EVM Private Key',
      type: 'short-input',
      placeholder: '0x... or hex without prefix',
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
  ],
  tools: {
    access: ['flow_evm_native_send'],
    config: {
      tool: () => 'flow_evm_native_send',
      params: (params) => ({
        mode: (params.mode as string) || 'general',
        to: params.to as string | undefined,
        data: params.data as string | undefined,
        value: params.value as string | undefined,
        tokenAddress: params.tokenAddress as string | undefined,
        recipient: params.recipient as string | undefined,
        amount: params.amount as string | undefined,
        gasLimit: params.gasLimit as string | undefined,
        privateKey: params.privateKey as string,
        network: (params.network as string) || 'mainnet',
      }),
    },
  },
  inputs: {
    mode: { type: 'string', description: 'Transaction mode: general or erc20' },
    to: { type: 'string', description: 'Destination address (general mode)' },
    data: { type: 'string', description: 'Calldata hex (general mode)' },
    value: { type: 'string', description: 'Value in FLOW (general mode)' },
    tokenAddress: { type: 'string', description: 'ERC-20 contract address (erc20 mode)' },
    recipient: { type: 'string', description: 'Recipient address (erc20 mode)' },
    amount: { type: 'string', description: 'Token amount (erc20 mode)' },
    gasLimit: { type: 'string', description: 'Gas limit' },
    privateKey: { type: 'string', description: 'EVM private key' },
    network: { type: 'string', description: 'mainnet or testnet' },
  },
  outputs: {
    content: { type: 'string', description: 'Human-readable transaction summary' },
    transactionHash: { type: 'string', description: 'EVM transaction hash' },
    status: { type: 'string', description: 'success or reverted' },
    gasUsed: { type: 'number', description: 'Gas consumed' },
    blockNumber: { type: 'number', description: 'Block number' },
    logs: { type: 'json', description: 'Parsed event logs' },
  },
}
```

- [ ] **Step 2: Register in blocks/registry.ts**

Add import (alphabetically near existing Flow EVM imports):

```typescript
import { FlowEvmNativeSendBlock } from '@/blocks/blocks/flow_evm_native_send'
```

Add to the registry object (alphabetically near `flow_evm_call` / `flow_evm_send`):

```typescript
  flow_evm_native_send: FlowEvmNativeSendBlock,
```

- [ ] **Step 3: Commit**

```bash
git add sim-workflow/apps/sim/blocks/blocks/flow_evm_native_send.ts sim-workflow/apps/sim/blocks/registry.ts
git commit -m "feat(sim): add flow_evm_native_send block definition"
```

---

### Task 6: Create API route

**Files:**
- Create: `sim-workflow/apps/sim/app/api/tools/flow/evm-native-send/route.ts`

- [ ] **Step 1: Create the API route**

Create `sim-workflow/apps/sim/app/api/tools/flow/evm-native-send/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  decodeEventLog,
  erc20Abi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { flowMainnet, flowTestnet } from 'viem/chains'

const logger = createLogger('FlowEvmNativeSend')

const Schema = z
  .object({
    mode: z.enum(['general', 'erc20']),
    to: z.string().optional(),
    data: z.string().optional(),
    value: z.string().optional(),
    tokenAddress: z.string().optional(),
    recipient: z.string().optional(),
    amount: z.string().optional(),
    gasLimit: z.string().optional(),
    privateKey: z.string().min(1, 'Private key is required'),
    network: z.enum(['mainnet', 'testnet']).default('mainnet'),
  })
  .refine(
    (d) => d.mode !== 'general' || (d.to && d.to.length > 0),
    { message: 'to is required for general mode', path: ['to'] }
  )
  .refine(
    (d) => d.mode !== 'erc20' || (d.tokenAddress && d.recipient && d.amount),
    { message: 'tokenAddress, recipient, and amount are required for erc20 mode', path: ['tokenAddress'] }
  )

const CHAIN_CONFIG = {
  mainnet: { chain: flowMainnet, rpc: 'https://mainnet.evm.nodes.onflow.org' },
  testnet: { chain: flowTestnet, rpc: 'https://testnet.evm.nodes.onflow.org' },
} as const

export async function POST(request: NextRequest) {
  try {
    const auth = await checkInternalAuth(request)
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const params = Schema.parse(body)

    const key = params.privateKey.startsWith('0x')
      ? (params.privateKey as `0x${string}`)
      : (`0x${params.privateKey}` as `0x${string}`)
    const account = privateKeyToAccount(key)

    const { chain, rpc } = CHAIN_CONFIG[params.network]
    const transport = http(rpc)

    const publicClient = createPublicClient({ chain, transport })
    const walletClient = createWalletClient({ account, chain, transport })

    let hash: `0x${string}`

    if (params.mode === 'erc20') {
      const tokenAddress = params.tokenAddress as `0x${string}`
      const recipientAddress = params.recipient as `0x${string}`

      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      })

      const parsedAmount = parseUnits(params.amount!, decimals)

      logger.info(`ERC-20 transfer: ${params.amount} (${decimals} decimals) to ${params.recipient} on ${params.network}`)

      hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress, parsedAmount],
        ...(params.gasLimit ? { gas: BigInt(params.gasLimit) } : {}),
      })
    } else {
      const to = params.to as `0x${string}`
      const txParams: Record<string, unknown> = { to }

      if (params.value) {
        txParams.value = parseEther(params.value)
      }
      if (params.data) {
        txParams.data = (params.data.startsWith('0x') ? params.data : `0x${params.data}`) as `0x${string}`
      }
      if (params.gasLimit) {
        txParams.gas = BigInt(params.gasLimit)
      }

      logger.info(`EVM send to ${params.to} on ${params.network} (value: ${params.value || '0'})`)

      hash = await walletClient.sendTransaction(txParams as Parameters<typeof walletClient.sendTransaction>[0])
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    const parsedLogs = receipt.logs.map((log) => {
      const base = {
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
      }
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
        return {
          ...base,
          decoded: {
            eventName: decoded.eventName,
            args: Object.fromEntries(
              Object.entries(decoded.args as Record<string, unknown>).map(([k, v]) => [
                k,
                typeof v === 'bigint' ? v.toString() : v,
              ])
            ),
          },
        }
      } catch {
        return base
      }
    })

    const status = receipt.status === 'success' ? 'success' : 'reverted'
    const gasUsed = Number(receipt.gasUsed)
    const blockNumber = Number(receipt.blockNumber)

    const content =
      params.mode === 'erc20'
        ? `ERC-20 transfer ${status}: ${params.amount} tokens to ${params.recipient} | tx: ${hash} | gas: ${gasUsed} | block: ${blockNumber}`
        : `EVM transaction ${status}: to ${params.to} | value: ${params.value || '0'} FLOW | tx: ${hash} | gas: ${gasUsed} | block: ${blockNumber}`

    return NextResponse.json({
      success: true,
      output: {
        content,
        transactionHash: hash,
        status,
        gasUsed,
        blockNumber,
        logs: parsedLogs,
      },
    })
  } catch (error) {
    logger.error('EVM native send failed', { error })
    const message = error instanceof Error ? error.message : 'EVM native transaction failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add sim-workflow/apps/sim/app/api/tools/flow/evm-native-send/route.ts
git commit -m "feat(sim): add evm-native-send API route with viem"
```

---

### Task 7: Build verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd sim-workflow/apps/sim && bunx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 2: Run lint**

```bash
cd sim-workflow/apps/sim && bun run lint
```

Expected: No lint errors

- [ ] **Step 3: Run build**

```bash
cd sim-workflow/apps/sim && bun run build
```

Expected: Build succeeds

- [ ] **Step 4: Fix any issues and commit**

If any errors found, fix them and commit:

```bash
git add -u
git commit -m "fix(sim): resolve build issues for evm native send"
```

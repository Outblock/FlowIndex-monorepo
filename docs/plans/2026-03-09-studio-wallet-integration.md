# Studio Wallet Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Sim Workflow Studio to sign Flow transactions using cloud keys, passkeys, or imported keys instead of raw private key input.

**Architecture:** Extract signer layer from agent-wallet into shared `@flowindex/flow-signer` package. Add wallet store + signer dropdown to Sim Studio blocks. Add unified Flow Send block powered by `@onflow/frw-workflow` strategy pattern.

**Tech Stack:** TypeScript, Zustand, Next.js API routes, FCL, `@noble/curves`, `@onflow/frw-workflow`

**Design Doc:** `docs/plans/2026-03-09-studio-wallet-integration-design.md`

---

## Task 1: Create `@flowindex/flow-signer` Package

**Files:**
- Create: `packages/flow-signer/package.json`
- Create: `packages/flow-signer/tsconfig.json`
- Create: `packages/flow-signer/src/index.ts`
- Create: `packages/flow-signer/src/interface.ts`
- Create: `packages/flow-signer/src/cloud.ts`
- Create: `packages/flow-signer/src/passkey.ts`
- Create: `packages/flow-signer/src/local.ts`
- Create: `packages/flow-signer/src/fcl.ts`

**Step 1: Create package.json**

```json
{
  "name": "@flowindex/flow-signer",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@noble/curves": "^2.0.1",
    "@noble/hashes": "^2.0.1",
    "@onflow/fcl": "^1.21.9",
    "@scure/bip32": "^2.0.1",
    "@scure/bip39": "^2.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 3: Extract interface.ts from `packages/agent-wallet/src/signer/interface.ts`**

Copy the `FlowSigner`, `SignResult`, `SignerInfo` interfaces. Add a `SignerConfig` type to replace `AgentWalletConfig` dependency:

```typescript
export interface SignerConfig {
  flowindexUrl: string
  network?: 'mainnet' | 'testnet'
}

export interface SignResult {
  signature: string
  extensionData?: string
}

export interface SignerInfo {
  type: 'local' | 'cloud' | 'passkey'
  flowAddress?: string
  evmAddress?: string
  keyIndex: number
  sigAlgo: string
  hashAlgo: string
}

export interface FlowSigner {
  init(): Promise<void>
  info(): SignerInfo
  signFlowTransaction(messageHex: string): Promise<SignResult>
  isHeadless(): boolean
}
```

**Step 4: Extract cloud.ts**

Copy from `packages/agent-wallet/src/signer/cloud.ts`. Replace `AgentWalletConfig` with `SignerConfig`. Keep all HTTP logic. Constructor takes `(config: SignerConfig, token: string)`.

**Step 5: Extract passkey.ts**

Copy from `packages/agent-wallet/src/signer/passkey.ts`. Replace `AgentWalletConfig` with `SignerConfig`. Keep polling logic and `PendingTxMeta` interface.

**Step 6: Extract local.ts**

Copy from `packages/agent-wallet/src/signer/local.ts`. Replace `AgentWalletConfig` with `SignerConfig`. Keep crypto imports, BIP-39 derivation, account discovery.

**Step 7: Create fcl.ts — FCL authorization helper**

```typescript
import type { FlowSigner } from './interface.js'

/**
 * Create an FCL-compatible authorization function from a FlowSigner.
 */
export function createAuthzFromSigner(signer: FlowSigner) {
  const info = signer.info()
  return async (account: Record<string, unknown>) => ({
    ...account,
    tempId: `${info.flowAddress}-${info.keyIndex}`,
    addr: info.flowAddress?.replace(/^0x/, ''),
    keyId: info.keyIndex,
    signingFunction: async (signable: { message: string }) => {
      const result = await signer.signFlowTransaction(signable.message)
      return {
        addr: info.flowAddress?.replace(/^0x/, ''),
        keyId: info.keyIndex,
        signature: result.signature,
        ...(result.extensionData ? { extensionData: result.extensionData } : {}),
      }
    },
  })
}
```

**Step 8: Create index.ts barrel export**

```typescript
export type { FlowSigner, SignResult, SignerInfo, SignerConfig } from './interface.js'
export { CloudSigner } from './cloud.js'
export { PasskeySigner } from './passkey.js'
export { LocalSigner } from './local.js'
export { createAuthzFromSigner } from './fcl.js'
```

**Step 9: Build and verify**

Run: `cd packages/flow-signer && bun install && bun run build`
Expected: Clean compile, dist/ directory created with .js + .d.ts files

**Step 10: Commit**

```bash
git add packages/flow-signer/
git commit -m "feat: extract @flowindex/flow-signer from agent-wallet"
```

---

## Task 2: Update agent-wallet to Depend on flow-signer

**Files:**
- Modify: `packages/agent-wallet/package.json`
- Modify: `packages/agent-wallet/src/signer/interface.ts` → re-export from flow-signer
- Modify: `packages/agent-wallet/src/signer/cloud.ts` → import from flow-signer
- Modify: `packages/agent-wallet/src/signer/passkey.ts` → import from flow-signer
- Modify: `packages/agent-wallet/src/signer/local.ts` → import from flow-signer

**Step 1: Add dependency to agent-wallet/package.json**

```json
"dependencies": {
  "@flowindex/flow-signer": "workspace:*",
  // ... existing deps (remove duplicated @noble/*, @scure/* if now in flow-signer)
}
```

**Step 2: Update signer files to re-export from flow-signer**

Replace `packages/agent-wallet/src/signer/interface.ts`:

```typescript
export type { FlowSigner, SignResult, SignerInfo, SignerConfig } from '@flowindex/flow-signer'
```

Update cloud.ts, passkey.ts, local.ts imports to use `@flowindex/flow-signer` for the interface types, or keep as thin wrappers that extend flow-signer classes with agent-wallet-specific config.

**Step 3: Build and verify**

Run: `cd packages/agent-wallet && bun install && bun run build`
Expected: Clean compile, agent-wallet still works identically

**Step 4: Commit**

```bash
git add packages/agent-wallet/
git commit -m "refactor: agent-wallet depends on @flowindex/flow-signer"
```

---

## Task 3: Create Wallet Zustand Store in Sim Studio

**Files:**
- Create: `sim-workflow/apps/sim/stores/wallet/types.ts`
- Create: `sim-workflow/apps/sim/stores/wallet/store.ts`

**Step 1: Create types.ts**

```typescript
export interface CloudKey {
  id: string
  label: string
  flowAddress: string
  publicKey: string
  keyIndex: number
  sigAlgo: string
  hashAlgo: string
  source: 'imported' | 'created'
}

export interface PasskeyAccount {
  credentialId: string
  flowAddress: string
  publicKey: string
  walletName?: string
}

export interface SignerOption {
  id: string
  label: string
  type: 'cloud' | 'passkey' | 'manual'
  flowAddress: string
  keyIndex: number
  sigAlgo: string
  hashAlgo: string
  // For resolving at execution time
  keyId?: string           // cloud key ID
  credentialId?: string    // passkey credential ID
}

export interface WalletState {
  keys: CloudKey[]
  passkeyAccounts: PasskeyAccount[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  // Actions
  fetchWallets: (fiAuthToken: string) => Promise<void>
  getSignerOptions: () => SignerOption[]
  reset: () => void
}
```

**Step 2: Create store.ts**

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createLogger } from '@sim/logger'
import type { WalletState, CloudKey, PasskeyAccount, SignerOption } from './types'

const logger = createLogger('WalletStore')

const FLOWINDEX_API_URL = process.env.NEXT_PUBLIC_FLOWINDEX_API_URL || 'https://flowindex.io'
const STALE_TIME = 5 * 60 * 1000 // 5 minutes

const initialState = {
  keys: [] as CloudKey[],
  passkeyAccounts: [] as PasskeyAccount[],
  isLoading: false,
  error: null as string | null,
  lastFetched: null as number | null,
}

export const useWalletStore = create<WalletState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchWallets: async (fiAuthToken: string) => {
        const { lastFetched, isLoading } = get()
        if (isLoading) return
        if (lastFetched && Date.now() - lastFetched < STALE_TIME) return

        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`${FLOWINDEX_API_URL}/api/v1/wallet/me`, {
            headers: { Authorization: `Bearer ${fiAuthToken}` },
          })
          if (!res.ok) throw new Error(`Wallet API error: ${res.status}`)
          const data = await res.json()
          set({
            keys: data.keys ?? [],
            passkeyAccounts: data.passkey_accounts ?? [],
            isLoading: false,
            lastFetched: Date.now(),
          })
        } catch (err) {
          logger.error('Failed to fetch wallets', { error: err })
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load wallets',
          })
        }
      },

      getSignerOptions: (): SignerOption[] => {
        const { keys, passkeyAccounts } = get()
        const options: SignerOption[] = []

        for (const key of keys) {
          options.push({
            id: `cloud:${key.id}`,
            label: `${key.label || 'Cloud Key'}: ${key.flowAddress} (${key.sigAlgo})`,
            type: 'cloud',
            flowAddress: key.flowAddress,
            keyIndex: key.keyIndex,
            sigAlgo: key.sigAlgo,
            hashAlgo: key.hashAlgo,
            keyId: key.id,
          })
        }

        for (const pk of passkeyAccounts) {
          options.push({
            id: `passkey:${pk.credentialId}`,
            label: `Passkey: ${pk.walletName || pk.flowAddress}`,
            type: 'passkey',
            flowAddress: pk.flowAddress,
            keyIndex: 0,
            sigAlgo: 'ECDSA_P256',
            hashAlgo: 'SHA2_256',
            credentialId: pk.credentialId,
          })
        }

        return options
      },

      reset: () => set(initialState),
    }),
    { name: 'wallet-store' }
  )
)
```

**Step 3: Commit**

```bash
git add sim-workflow/apps/sim/stores/wallet/
git commit -m "feat(studio): add wallet Zustand store for signer options"
```

---

## Task 4: Create Signer Resolver Helper

**Files:**
- Create: `sim-workflow/apps/sim/lib/flow/signer-resolver.ts`
- Modify: `sim-workflow/apps/sim/package.json` — add `@flowindex/flow-signer` dependency

**Step 1: Add flow-signer dependency**

Add to `sim-workflow/apps/sim/package.json` dependencies:
```json
"@flowindex/flow-signer": "workspace:*"
```

Run: `cd sim-workflow && bun install`

**Step 2: Create signer-resolver.ts**

This is the shared helper used by all Flow API routes to resolve a signer from block params.

```typescript
import { CloudSigner, LocalSigner, PasskeySigner, createAuthzFromSigner } from '@flowindex/flow-signer'
import type { FlowSigner, SignerConfig } from '@flowindex/flow-signer'
import { createLogger } from '@sim/logger'

const logger = createLogger('SignerResolver')

export interface SignerParams {
  signerMode?: 'cloud' | 'passkey' | 'manual' | 'legacy'
  signerKeyId?: string
  signerCredentialId?: string
  signerAddress?: string
  signerPrivateKey?: string
}

const FLOWINDEX_URL = process.env.FLOWINDEX_API_URL || 'https://flowindex.io'

/**
 * Resolve a FlowSigner from block execution params.
 * Returns the signer + an FCL authz function.
 */
export async function resolveSignerFromParams(
  params: SignerParams,
  fiAuthToken?: string
): Promise<{ signer: FlowSigner; authz: ReturnType<typeof createAuthzFromSigner> }> {
  const config: SignerConfig = { flowindexUrl: FLOWINDEX_URL }

  // Legacy mode: raw private key (backward compatible)
  if (params.signerMode === 'legacy' || (!params.signerMode && params.signerPrivateKey)) {
    if (!params.signerPrivateKey || !params.signerAddress) {
      throw new Error('signerAddress and signerPrivateKey required for legacy mode')
    }
    const signer = new LocalSigner(config, {
      privateKey: params.signerPrivateKey,
      address: params.signerAddress,
    })
    await signer.init()
    return { signer, authz: createAuthzFromSigner(signer) }
  }

  if (!fiAuthToken) {
    throw new Error('Authentication required for cloud/passkey signing')
  }

  if (params.signerMode === 'cloud') {
    if (!params.signerKeyId) throw new Error('signerKeyId required for cloud mode')
    const signer = new CloudSigner(config, fiAuthToken)
    signer.setActiveKey(params.signerKeyId)
    await signer.init()
    return { signer, authz: createAuthzFromSigner(signer) }
  }

  if (params.signerMode === 'passkey') {
    if (!params.signerCredentialId) throw new Error('signerCredentialId required for passkey mode')
    const signer = new PasskeySigner(config, fiAuthToken)
    signer.setCredentialId(params.signerCredentialId)
    await signer.init()
    return { signer, authz: createAuthzFromSigner(signer) }
  }

  throw new Error(`Unknown signerMode: ${params.signerMode}`)
}

/**
 * Extract fi_auth token from request cookies.
 */
export function extractFiAuthFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  const match = cookieHeader.match(/fi_auth=([^;]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1]).replace(/^"(.*)"$/, '$1')
  } catch {
    return match[1]
  }
}
```

**Step 3: Commit**

```bash
git add sim-workflow/apps/sim/lib/flow/signer-resolver.ts sim-workflow/apps/sim/package.json
git commit -m "feat(studio): add signer resolver helper for Flow API routes"
```

---

## Task 5: Add Flow Send Tool + API Route

**Files:**
- Create: `sim-workflow/apps/sim/tools/flow/flow_send.ts`
- Create: `sim-workflow/apps/sim/app/api/tools/flow/send/route.ts`
- Modify: `sim-workflow/apps/sim/tools/flow/types.ts` — add FlowSendParams
- Modify: `sim-workflow/apps/sim/tools/flow/index.ts` — add export
- Modify: `sim-workflow/apps/sim/tools/registry.ts` — register tool

**Step 1: Add FlowSendParams to types.ts**

Append to `sim-workflow/apps/sim/tools/flow/types.ts`:

```typescript
/** Parameters for flow_send tool */
export interface FlowSendParams {
  signer: string           // JSON: { mode, keyId?, credentialId?, address?, privateKey? }
  sendType: string         // 'token' | 'nft'
  sender: string           // from address (Flow or EVM)
  receiver: string         // to address (Flow or EVM)
  flowIdentifier: string   // vault/collection type identifier
  amount?: string          // token amount
  nftIds?: string          // comma-separated NFT IDs
  network?: string         // mainnet | testnet
}
```

**Step 2: Create flow_send.ts tool definition**

```typescript
import type { ToolConfig } from '@/tools/types'
import type { FlowSendParams } from '@/tools/flow/types'

export interface FlowSendResponse {
  success: boolean
  output: {
    content: string
    transactionId: string
    status: string
  }
}

export const flowSendTool: ToolConfig<FlowSendParams, FlowSendResponse> = {
  id: 'flow_send',
  name: 'Flow Send',
  description: 'Send tokens or NFTs across Flow and EVM networks with automatic strategy routing',
  version: '1.0.0',

  params: {
    signer: { type: 'string', required: true, description: 'Signer configuration JSON' },
    sendType: { type: 'string', required: true, description: 'Asset type: token or nft' },
    sender: { type: 'string', required: true, description: 'Sender address (Flow or EVM)' },
    receiver: { type: 'string', required: true, description: 'Recipient address (Flow or EVM)' },
    flowIdentifier: { type: 'string', required: true, description: 'Token vault or NFT collection type identifier' },
    amount: { type: 'string', required: false, description: 'Token amount (for token transfers)' },
    nftIds: { type: 'string', required: false, description: 'Comma-separated NFT IDs (for NFT transfers)' },
    network: { type: 'string', required: false, description: 'Flow network: mainnet or testnet' },
  },

  request: {
    url: '/api/tools/flow/send',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      signer: params.signer,
      sendType: params.sendType,
      sender: params.sender,
      receiver: params.receiver,
      flowIdentifier: params.flowIdentifier,
      amount: params.amount,
      nftIds: params.nftIds,
      network: params.network ?? 'mainnet',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!data.success) {
      return {
        success: false,
        output: { content: data.error || 'Failed to send', transactionId: '', status: 'ERROR' },
        error: data.error,
      } as unknown as FlowSendResponse
    }
    return { success: true, output: data.output }
  },

  outputs: {
    content: { type: 'string', description: 'Transaction summary' },
    transactionId: { type: 'string', description: 'Flow transaction ID' },
    status: { type: 'string', description: 'Transaction status' },
  },
}
```

**Step 3: Add export to tools/flow/index.ts**

Append: `export { flowSendTool } from '@/tools/flow/flow_send'`

**Step 4: Register in tools/registry.ts**

In the Flow tools imports section add:
```typescript
import { flowSendTool } from '@/tools/flow'
```

In the registry object add:
```typescript
flow_send: flowSendTool,
```

**Step 5: Create API route `/api/tools/flow/send/route.ts`**

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@sim/logger'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { resolveSignerFromParams, extractFiAuthFromRequest } from '@/lib/flow/signer-resolver'
import type { SignerParams } from '@/lib/flow/signer-resolver'

const logger = createLogger('FlowSend')

const ACCESS_NODES: Record<string, string> = {
  mainnet: 'https://rest-mainnet.onflow.org',
  testnet: 'https://rest-testnet.onflow.org',
}

const Schema = z.object({
  signer: z.string().min(1, 'Signer configuration is required'),
  sendType: z.enum(['token', 'nft']),
  sender: z.string().min(1, 'Sender address is required'),
  receiver: z.string().min(1, 'Receiver address is required'),
  flowIdentifier: z.string().min(1, 'Token/collection identifier is required'),
  amount: z.string().optional(),
  nftIds: z.string().optional(),
  network: z.string().optional().default('mainnet'),
})

function isEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

function isFlowAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{16}$/.test(addr)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkInternalAuth(request)
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const parsed = Schema.parse(body)

    const accessNode = ACCESS_NODES[parsed.network]
    if (!accessNode) {
      return NextResponse.json(
        { success: false, error: `Invalid network: ${parsed.network}` },
        { status: 400 }
      )
    }

    // Parse signer config
    let signerParams: SignerParams
    try {
      signerParams = JSON.parse(parsed.signer)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid signer JSON' },
        { status: 400 }
      )
    }

    const fiAuthToken = extractFiAuthFromRequest(request)
    const { signer, authz } = await resolveSignerFromParams(signerParams, fiAuthToken ?? undefined)

    // Configure FCL
    const fcl = await import('@onflow/fcl')
    fcl.config().put('accessNode.api', accessNode)

    const signerInfo = signer.info()
    const senderAddr = parsed.sender
    const receiverAddr = parsed.receiver
    const isCrossVM =
      (isFlowAddress(senderAddr) && isEvmAddress(receiverAddr)) ||
      (isEvmAddress(senderAddr) && isFlowAddress(receiverAddr))

    logger.info(`Flow Send: ${parsed.sendType} from ${senderAddr} to ${receiverAddr}`, {
      crossVM: isCrossVM,
      network: parsed.network,
    })

    // Build and send transaction using the appropriate Cadence template
    // For now, delegate to the FRW workflow strategy pattern
    // TODO: Integrate @onflow/frw-workflow SendTransaction()
    // For MVP, use direct FCL with the resolved signer for basic transfers

    let txId: string
    type FclAuthz = Parameters<typeof fcl.mutate>[0] extends { proposer?: infer P } ? P : never
    const typedAuthz = authz as unknown as FclAuthz

    if (parsed.sendType === 'token' && !isCrossVM) {
      // Simple Flow-to-Flow token transfer
      const cadence = `
        import FungibleToken from 0xFungibleToken
        import FlowToken from 0xFlowToken

        transaction(amount: UFix64, to: Address) {
          let vault: @{FungibleToken.Vault}
          prepare(signer: auth(BorrowValue) &Account) {
            let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
              from: /storage/flowTokenVault
            ) ?? panic("Could not borrow vault")
            self.vault <- vaultRef.withdraw(amount: amount)
          }
          execute {
            let receiver = getAccount(to)
              .capabilities.get<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
              .borrow() ?? panic("Could not borrow receiver")
            receiver.deposit(from: <- self.vault)
          }
        }
      `
      txId = await fcl.mutate({
        cadence,
        args: (arg: typeof fcl.arg, t: typeof fcl.t) => [
          arg(parsed.amount, t.UFix64),
          arg(receiverAddr, t.Address),
        ],
        proposer: typedAuthz,
        payer: typedAuthz,
        authorizations: [typedAuthz] as unknown as FclAuthz[],
        limit: 9999,
      })
    } else {
      // For cross-VM, NFT, bridge, child account transfers:
      // Will be powered by @onflow/frw-workflow in a future task
      return NextResponse.json(
        { success: false, error: 'Cross-VM and NFT transfers coming soon. Use specific blocks for now.' },
        { status: 501 }
      )
    }

    logger.info(`Transaction submitted: ${txId}`)
    const txStatus = await fcl.tx(txId).onceSealed()
    const statusLabel = txStatus.errorMessage ? 'ERROR' : 'SEALED'
    const content = txStatus.errorMessage
      ? `Transaction ${txId} failed: ${txStatus.errorMessage}`
      : `Transaction ${txId} sealed successfully`

    return NextResponse.json({
      success: true,
      output: { content, transactionId: txId, status: statusLabel },
    })
  } catch (error) {
    logger.error('Failed to send', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send' },
      { status: 500 }
    )
  }
}
```

**Step 6: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/flow_send.ts \
        sim-workflow/apps/sim/tools/flow/types.ts \
        sim-workflow/apps/sim/tools/flow/index.ts \
        sim-workflow/apps/sim/tools/registry.ts \
        sim-workflow/apps/sim/app/api/tools/flow/send/
git commit -m "feat(studio): add Flow Send tool and API route"
```

---

## Task 6: Add Flow Send Block

**Files:**
- Create: `sim-workflow/apps/sim/blocks/blocks/flow_send.ts`
- Modify: `sim-workflow/apps/sim/blocks/registry.ts` — register block

**Step 1: Create flow_send.ts block definition**

```typescript
import { FlowIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const FlowSendBlock: BlockConfig = {
  type: 'flow_send',
  name: 'Flow Send',
  description: 'Send tokens or NFTs across Flow and EVM networks',
  category: 'tools',
  bgColor: '#00EF8B',
  icon: FlowIcon,
  subBlocks: [
    {
      id: 'signer',
      title: 'Signer',
      type: 'dropdown',
      options: [
        { label: 'Use Default', id: 'default' },
        // Dynamic options populated by wallet store at runtime
      ],
      placeholder: 'Select a signer...',
      required: true,
    },
    {
      id: 'sendType',
      title: 'Type',
      type: 'dropdown',
      options: [
        { label: 'Token', id: 'token' },
        { label: 'NFT', id: 'nft' },
      ],
      defaultValue: 'token',
    },
    {
      id: 'sender',
      title: 'From',
      type: 'short-input',
      placeholder: '0x... (Flow or EVM address)',
      required: true,
    },
    {
      id: 'receiver',
      title: 'To',
      type: 'short-input',
      placeholder: '0x... (Flow or EVM address)',
      required: true,
    },
    {
      id: 'flowIdentifier',
      title: 'Token / Collection',
      type: 'short-input',
      placeholder: 'A.1654653399040a61.FlowToken.Vault',
      required: true,
    },
    {
      id: 'amount',
      title: 'Amount',
      type: 'short-input',
      placeholder: '10.0',
      condition: { field: 'sendType', value: 'token' },
      required: { field: 'sendType', value: 'token' },
    },
    {
      id: 'nftIds',
      title: 'NFT IDs',
      type: 'short-input',
      placeholder: '1, 2, 3 (comma-separated)',
      condition: { field: 'sendType', value: 'nft' },
      required: { field: 'sendType', value: 'nft' },
    },
    {
      id: 'network',
      title: 'Network',
      type: 'dropdown',
      options: [
        { label: 'Mainnet', id: 'mainnet' },
        { label: 'Testnet', id: 'testnet' },
      ],
      defaultValue: 'mainnet',
    },
  ],
  tools: {
    access: ['flow_send'],
    config: {
      tool: () => 'flow_send',
      params: (params) => ({
        signer: typeof params.signer === 'string' ? params.signer : JSON.stringify(params.signer),
        sendType: params.sendType as string,
        sender: params.sender as string,
        receiver: params.receiver as string,
        flowIdentifier: params.flowIdentifier as string,
        amount: params.amount as string | undefined,
        nftIds: params.nftIds as string | undefined,
        network: params.network as string | undefined,
      }),
    },
  },
  inputs: {
    sender: { type: 'string', description: 'Sender address' },
    receiver: { type: 'string', description: 'Receiver address' },
    amount: { type: 'string', description: 'Token amount' },
    flowIdentifier: { type: 'string', description: 'Token/collection identifier' },
  },
  outputs: {
    content: { type: 'string', description: 'Transaction summary' },
    transactionId: { type: 'string', description: 'Transaction ID' },
    status: { type: 'string', description: 'Transaction status' },
  },
}
```

**Step 2: Register in blocks/registry.ts**

Add import:
```typescript
import { FlowSendBlock } from '@/blocks/blocks/flow_send'
```

Add to registry (alphabetically near other flow_ entries):
```typescript
flow_send: FlowSendBlock,
```

**Step 3: Commit**

```bash
git add sim-workflow/apps/sim/blocks/blocks/flow_send.ts sim-workflow/apps/sim/blocks/registry.ts
git commit -m "feat(studio): add Flow Send block with signer dropdown"
```

---

## Task 7: Add Signer Dropdown to Existing Flow Transaction Blocks

**Files to modify (12 blocks):**
- `sim-workflow/apps/sim/tools/flow/send_transaction.ts`
- `sim-workflow/apps/sim/tools/flow/transfer_flow.ts`
- `sim-workflow/apps/sim/tools/flow/transfer_ft.ts`
- `sim-workflow/apps/sim/tools/flow/transfer_nft.ts`
- `sim-workflow/apps/sim/tools/flow/evm_send.ts`
- `sim-workflow/apps/sim/tools/flow/stake.ts`
- `sim-workflow/apps/sim/tools/flow/unstake.ts`
- `sim-workflow/apps/sim/tools/flow/withdraw_rewards.ts`
- `sim-workflow/apps/sim/tools/flow/create_account.ts`
- `sim-workflow/apps/sim/tools/flow/add_key.ts`
- `sim-workflow/apps/sim/tools/flow/remove_key.ts`
- `sim-workflow/apps/sim/tools/flow/batch_transfer.ts`

Also the corresponding blocks that reference these tools.

**Step 1: Update tool param types**

For each of the 12 tool types in `types.ts`, add optional `signer` param alongside existing `signerAddress` + `signerPrivateKey` (backward compatible):

```typescript
export interface FlowSendTransactionParams {
  script: string
  arguments?: string
  // New: structured signer
  signer?: string  // JSON: { mode, keyId?, credentialId?, address?, privateKey? }
  // Legacy: raw key (still supported)
  signerAddress: string
  signerPrivateKey: string
  network?: string
}
```

**Step 2: Update each tool definition**

Add `signer` param to each tool's `params` object:

```typescript
signer: {
  type: 'string',
  required: false,
  description: 'Signer configuration JSON (overrides signerAddress/signerPrivateKey)',
},
```

Update `request.body` to pass `signer` if present.

**Step 3: Update each API route to use signer resolver**

For each of the 12 API routes under `app/api/tools/flow/*/route.ts`:

Replace the direct `signWithKey()` + `createAuthz()` pattern with:

```typescript
import { resolveSignerFromParams, extractFiAuthFromRequest } from '@/lib/flow/signer-resolver'
import { createAuthzFromSigner } from '@flowindex/flow-signer'

// In POST handler:
let authz
if (body.signer) {
  const signerParams = JSON.parse(body.signer)
  const fiAuth = extractFiAuthFromRequest(request)
  const resolved = await resolveSignerFromParams(signerParams, fiAuth ?? undefined)
  authz = resolved.authz
} else {
  // Legacy: use existing signWithKey logic
  authz = createAuthz(fcl, signerAddress, signerPrivateKey)
}
```

This keeps backward compatibility — existing workflows with raw keys still work.

**Step 4: Update corresponding block definitions**

For each block that has `signerAddress` + `signerPrivateKey` subBlocks, add a `signer` dropdown as the first subBlock and make the old fields conditional on `signer === 'manual'`:

```typescript
{
  id: 'signer',
  title: 'Signer',
  type: 'dropdown',
  options: [
    { label: 'Manual Key', id: 'manual' },
    // Dynamic cloud/passkey options loaded at runtime
  ],
  defaultValue: 'manual',
},
{
  id: 'signerAddress',
  title: 'Signer Address',
  type: 'short-input',
  condition: { field: 'signer', value: 'manual' },
  required: { field: 'signer', value: 'manual' },
},
{
  id: 'signerPrivateKey',
  title: 'Private Key',
  type: 'short-input',
  condition: { field: 'signer', value: 'manual' },
  required: { field: 'signer', value: 'manual' },
},
```

**Step 5: Commit**

```bash
git add sim-workflow/apps/sim/tools/flow/ sim-workflow/apps/sim/app/api/tools/flow/ sim-workflow/apps/sim/blocks/blocks/
git commit -m "feat(studio): add signer dropdown to all Flow transaction blocks"
```

---

## Task 8: Integrate `@onflow/frw-workflow` for Full Send Strategy

**Files:**
- Modify: `sim-workflow/apps/sim/package.json` — add `@onflow/frw-workflow`
- Create: `sim-workflow/apps/sim/lib/flow/cadence-service-adapter.ts`
- Modify: `sim-workflow/apps/sim/app/api/tools/flow/send/route.ts` — replace MVP with full strategy

**Step 1: Add frw-workflow dependency**

```bash
cd sim-workflow/apps/sim && bun add @onflow/frw-workflow
```

If not published to npm, add as git dependency or copy the send module locally.

**Step 2: Create CadenceService adapter**

The FRW `SendTransaction()` expects a `cadenceService` object. We create an adapter that wraps our `FlowSigner`:

```typescript
// lib/flow/cadence-service-adapter.ts
import type { FlowSigner } from '@flowindex/flow-signer'
import { createAuthzFromSigner } from '@flowindex/flow-signer'
import { createLogger } from '@sim/logger'

const logger = createLogger('CadenceServiceAdapter')

/**
 * Creates a CadenceService-compatible object from a FlowSigner.
 * This bridges our signer layer to FRW workflow's strategy pattern.
 */
export function createCadenceServiceFromSigner(signer: FlowSigner, fclInstance: any) {
  const authz = createAuthzFromSigner(signer)

  return {
    async sendTransaction(cadence: string, args: any[] = []) {
      type FclAuthz = Parameters<typeof fclInstance.mutate>[0] extends { proposer?: infer P } ? P : never
      const typedAuthz = authz as unknown as FclAuthz

      const txId = await fclInstance.mutate({
        cadence,
        args: () => args,
        proposer: typedAuthz,
        payer: typedAuthz,
        authorizations: [typedAuthz] as unknown as FclAuthz[],
        limit: 9999,
      })
      return txId
    },

    async executeScript(cadence: string, args: any[] = []) {
      return await fclInstance.query({ cadence, args: () => args })
    },
  }
}
```

**Step 3: Update send route to use full strategy**

Replace the MVP token-only logic in `app/api/tools/flow/send/route.ts` with:

```typescript
import { SendTransaction } from '@onflow/frw-workflow'
import { createCadenceServiceFromSigner } from '@/lib/flow/cadence-service-adapter'

// Build SendPayload from parsed params
const payload = {
  type: parsed.sendType as 'token' | 'nft',
  assetType: isEvmAddress(senderAddr) ? 'evm' : 'flow',
  proposer: signerInfo.flowAddress || senderAddr,
  receiver: receiverAddr,
  sender: senderAddr,
  flowIdentifier: parsed.flowIdentifier,
  childAddrs: [], // TODO: fetch from account if applicable
  ids: parsed.nftIds ? parsed.nftIds.split(',').map(Number) : [],
  amount: parsed.amount || '0.0',
  decimal: 8,
  coaAddr: '', // TODO: detect from account
  isCrossVM,
  tokenContractAddr: parsed.flowIdentifier.split('.').slice(0, 2).join('.'),
}

const cadenceService = createCadenceServiceFromSigner(signer, fcl)
const result = await SendTransaction(payload, cadenceService, { network: parsed.network })
```

**Step 4: Commit**

```bash
git add sim-workflow/apps/sim/lib/flow/cadence-service-adapter.ts \
        sim-workflow/apps/sim/app/api/tools/flow/send/route.ts \
        sim-workflow/apps/sim/package.json
git commit -m "feat(studio): integrate frw-workflow strategy pattern for Flow Send"
```

---

## Task 9: Dynamic Signer Dropdown Options (Runtime)

**Files:**
- Create: `sim-workflow/apps/sim/hooks/use-signer-options.ts`
- Modify: Block rendering code to populate signer dropdowns dynamically

**Step 1: Create useSingerOptions hook**

```typescript
// hooks/use-signer-options.ts
import { useEffect } from 'react'
import { useWalletStore } from '@/stores/wallet/store'

/**
 * Hook to load and return signer options for block dropdowns.
 * Fetches wallets from FlowIndex if not already loaded.
 */
export function useSignerOptions() {
  const { fetchWallets, getSignerOptions, isLoading } = useWalletStore()

  useEffect(() => {
    // Get fi_auth token from cookie
    const match = document.cookie.match(/fi_auth=([^;]+)/)
    if (match) {
      const token = decodeURIComponent(match[1]).replace(/^"(.*)"$/, '$1')
      fetchWallets(token)
    }
  }, [fetchWallets])

  const signerOptions = getSignerOptions()

  return {
    options: [
      { label: 'Use Default', id: 'default' },
      ...signerOptions.map((s) => ({ label: s.label, id: s.id })),
      { label: 'Manual Key', id: 'manual' },
    ],
    isLoading,
  }
}
```

**Step 2: Wire into block rendering**

The exact integration point depends on how Sim Studio renders dropdown options. Look at how existing blocks with dynamic options work (e.g., credential dropdowns) and follow the same pattern. The `signer` dropdown should call `useSignerOptions()` to populate its options list.

**Step 3: Commit**

```bash
git add sim-workflow/apps/sim/hooks/use-signer-options.ts
git commit -m "feat(studio): add useSignerOptions hook for dynamic signer dropdowns"
```

---

## Task 10: Workflow-Level Default Signer

**Files:**
- Modify: workflow metadata/settings to include `defaultSigner` field
- Modify: block execution to resolve `default` signer from workflow settings

**Step 1: Add defaultSigner to workflow metadata**

In the workflow store or settings schema, add:

```typescript
interface WorkflowMetadata {
  // ... existing fields
  defaultSigner?: string  // SignerOption.id (e.g., "cloud:key-uuid" or "passkey:cred-id")
}
```

**Step 2: Add Default Signer to Workflow Settings UI**

In the workflow settings panel, add a Signer dropdown using the same `useSignerOptions()` hook.

**Step 3: Resolve default at execution time**

In the block execution pipeline, when `signer === 'default'`, look up the workflow's `defaultSigner` and pass that to the API route instead.

**Step 4: Commit**

```bash
git commit -m "feat(studio): add workflow-level default signer setting"
```

---

## Summary of Deliverables

| Task | What | Files |
|------|------|-------|
| 1 | `@flowindex/flow-signer` package | 8 new files |
| 2 | agent-wallet depends on flow-signer | 5 modified |
| 3 | Wallet Zustand store | 2 new files |
| 4 | Signer resolver helper | 1 new + 1 modified |
| 5 | Flow Send tool + API route | 2 new + 3 modified |
| 6 | Flow Send block | 1 new + 1 modified |
| 7 | Signer dropdown on 12 existing blocks | ~24 modified |
| 8 | frw-workflow integration | 1 new + 2 modified |
| 9 | Dynamic signer options hook | 1 new |
| 10 | Workflow default signer | ~3 modified |

**Recommended execution order:** Tasks 1-4 are foundation (do first). Tasks 5-6 are the new block. Task 7 is the bulk migration. Tasks 8-10 are polish.

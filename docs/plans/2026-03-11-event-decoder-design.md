# Event Decoder Shared Package Design

**Date:** 2026-03-11
**Package:** `@flowindex/event-decoder`
**Location:** `packages/event-decoder/`

## Problem

The runner's simulation dialog shows raw event JSON. The frontend already has rich event parsing in `deriveFromEvents.ts` and summary building in `TransactionRow.tsx`, but these are coupled to the frontend app. Additionally, some event categories (DeFi, staking, system events, capabilities) are only decoded on the backend in Go. We need a shared pure-TS package that both frontend and runner can use to turn raw events into human-readable results.

## Package Structure

```
packages/event-decoder/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # All types
│   ├── decode.ts             # Main: decodeEvents() orchestrator
│   ├── tokens.ts             # FT/NFT transfer parsing + withdraw/deposit pairing
│   ├── evm.ts                # EVM decoding (RLP direct call, TransactionExecuted)
│   ├── system.ts             # Core events: account, contract, capability, inbox
│   ├── defi.ts               # DEX swap/liquidity event parsing
│   ├── staking.ts            # Staking/delegation/epoch event parsing
│   ├── tags.ts               # deriveTags() from event types (port of tx_contracts_worker.go)
│   ├── summary.ts            # buildSummary() → human-readable one-liner
│   ├── cadence.ts            # Cadence value/event field parsing helpers
│   └── constants.ts          # Known addresses, contract sets, DEX patterns
├── package.json              # "@flowindex/event-decoder"
├── tsconfig.json
└── tsup.config.ts
```

## Public API

```typescript
import {
  decodeEvents,
  buildSummary,
  deriveTags,
  type DecodedEvents,
  type DecodedSummaryItem,
} from '@flowindex/event-decoder'

// Core decode — processes all event categories
const result: DecodedEvents = decodeEvents(events, script?)

// Human-readable one-liner
const summary: string = buildSummary(result)
// → "Swapped 10.5 FLOW → 25.3 USDC (IncrementFi)"

// Tag derivation (for badge display)
const tags: string[] = deriveTags(events)
// → ['SWAP', 'FT_TRANSFER']
```

## Event Format Compatibility

Simulation returns `{ type: string; payload: any }`. Frontend backend API returns `{ type: string; payload: any; event_index?: number; contract_address?: string }`. The decoder reads `event.type` and `event.payload` as primary fields — both formats work with zero adapters.

## Types

```typescript
// Input: raw event from simulation or backend API
interface RawEvent {
  type: string;
  payload: any;
  event_index?: number;
  contract_address?: string;
  block_height?: number;
}

// Output
interface DecodedEvents {
  transfers: FTTransfer[];
  nftTransfers: NFTTransfer[];
  evmExecutions: EVMExecution[];
  defiEvents: DefiEvent[];
  stakingEvents: StakingEvent[];
  systemEvents: SystemEvent[];
  fee: number;
  tags: string[];
  contractImports: string[];
}

interface FTTransfer {
  token: string;           // A.{addr}.{name}
  from_address: string;
  to_address: string;
  amount: string;
  event_index: number;
  transfer_type: 'transfer' | 'mint' | 'burn';
  evm_to_address?: string;
  evm_from_address?: string;
}

interface NFTTransfer {
  token: string;
  from_address: string;
  to_address: string;
  token_id: string;
  event_index: number;
  transfer_type: 'transfer' | 'mint' | 'burn';
}

interface EVMExecution {
  hash: string;
  from: string;
  to: string;
  gas_used: string;
  gas_limit: string;
  gas_price: string;
  value: string;
  status: string;
  event_index: number;
  block_number?: number;
  type?: number;
  nonce?: number;
  position?: number;
}

interface DefiEvent {
  dex: string;              // 'incrementfi' | 'bloctoswap' | 'metapier'
  action: string;           // 'Swap' | 'AddLiquidity' | 'RemoveLiquidity'
  pairId: string;           // A.addr.SwapPair
  amountIn: string;
  amountOut: string;
  tokenIn?: string;
  tokenOut?: string;
  event_index: number;
}

interface StakingEvent {
  action: string;           // 'TokensStaked' | 'TokensUnstaked' | 'RewardsPaid' | etc.
  nodeId: string;
  delegatorId?: number;
  amount: string;
  event_index: number;
}

// Covers: AccountCreated, AccountKey*, AccountContract*, Capability*, Inbox*
interface SystemEvent {
  category: 'account' | 'key' | 'contract' | 'capability' | 'inbox';
  action: string;           // 'created' | 'key_added' | 'contract_deployed' | 'capability_published' | etc.
  address: string;
  detail: string;           // Human-readable: "Deployed MyToken" or "Set up USDC vault at /storage/usdcVault"
  event_index: number;
  // Additional fields depending on category:
  contractName?: string;    // for contract events
  keyIndex?: number;        // for key events
  path?: string;            // for capability events
  capabilityType?: string;  // for capability events (e.g. "FungibleToken.Vault")
}
```

## Event Categories

### 1. Token Transfers (port from `frontend/app/lib/deriveFromEvents.ts`)

Existing logic: classify events, parse token legs, pair withdraw/deposit by resource ID, detect mint/burn, enrich cross-VM transfers with EVM bridge events.

### 2. EVM (port from `deriveFromEvents.ts`)

Existing logic: parse `EVM.TransactionExecuted`, decode direct call RLP payloads (0xff prefix), extract hash/from/to/value/gas.

### 3. Account Lifecycle

| Event | `action` | `detail` |
|---|---|---|
| `flow.AccountCreated` | `created` | "Created account 0x1234" |
| `flow.AccountKeyAdded` | `key_added` | "Added key #0 (ECDSA_P256, weight 1000)" |
| `flow.AccountKeyRemoved` | `key_removed` | "Removed key #2" |

### 4. Contract Management

| Event | `action` | `detail` |
|---|---|---|
| `flow.AccountContractAdded` | `contract_deployed` | "Deployed MyToken to 0x1234" |
| `flow.AccountContractUpdated` | `contract_updated` | "Updated MyToken on 0x1234" |
| `flow.AccountContractRemoved` | `contract_removed` | "Removed MyToken from 0x1234" |

### 5. Storage & Capabilities

| Event | `action` | `detail` |
|---|---|---|
| `flow.StorageCapabilityControllerIssued` | `storage_capability_issued` | "Issued storage capability for FungibleToken.Vault at /storage/usdcVault" |
| `flow.AccountCapabilityControllerIssued` | `account_capability_issued` | "Issued account capability" |
| `flow.CapabilityPublished` | `capability_published` | "Published capability at /public/usdcReceiver" |
| `flow.CapabilityUnpublished` | `capability_unpublished` | "Unpublished capability at /public/..." |
| `flow.StorageCapabilityControllerDeleted` | `storage_capability_deleted` | "Removed storage capability" |
| `flow.StorageCapabilityControllerTargetChanged` | `storage_capability_retarget` | "Changed capability target to /storage/..." |
| `flow.AccountCapabilityControllerDeleted` | `account_capability_deleted` | "Removed account capability" |

**Pattern detection in `buildSummary()`:**
- StorageCapabilityControllerIssued(type contains `FungibleToken.Vault`) + CapabilityPublished → **"Enabled USDC token"**
- StorageCapabilityControllerIssued(type contains `NonFungibleToken.Collection`) + CapabilityPublished → **"Enabled TopShot NFT collection"**

### 6. DeFi (port from `backend/internal/ingester/defi_worker.go`)

| Event Pattern | `action` | `detail` |
|---|---|---|
| `.SwapPair.Swap` | `Swap` | "Swapped 10.5 FLOW → 25.3 USDC (IncrementFi)" |
| `.BloctoSwapPair.Swap` | `Swap` | "Swapped ... (BloctoSwap)" |
| `.MetaPierSwapPair.Swap` | `Swap` | "Swapped ... (MetaPier)" |
| `.SwapPair.AddLiquidity` | `AddLiquidity` | "Added liquidity to FLOW/USDC pool" |
| `.SwapPair.RemoveLiquidity` | `RemoveLiquidity` | "Removed liquidity from FLOW/USDC pool" |

Fields parsed: `amount0In`, `amount1Out`, `amountIn`, `amountOut`, `token0Symbol`, `token1Symbol`, `token0Key`, `token1Key`, `reserve0`, `reserve1`, `price`

### 7. Staking (port from `backend/internal/ingester/staking_worker.go`)

| Event | `action` | `detail` |
|---|---|---|
| `FlowIDTableStaking.TokensStaked` | `TokensStaked` | "Staked 100 FLOW" |
| `FlowIDTableStaking.TokensUnstaked` | `TokensUnstaked` | "Unstaked 50 FLOW" |
| `FlowIDTableStaking.TokensCommitted` | `TokensCommitted` | "Committed 200 FLOW to stake" |
| `FlowIDTableStaking.RewardsPaid` | `RewardsPaid` | "Received 5.2 FLOW staking reward" |
| `FlowIDTableStaking.DelegatorRewardsPaid` | `DelegatorRewardsPaid` | "Received 2.1 FLOW delegation reward" |
| `FlowIDTableStaking.NewNodeCreated` | `NewNodeCreated` | "Registered new node (role: Consensus)" |
| `FlowStakingCollection.*` | same | Same patterns via staking collection |
| `LiquidStaking.*` / `stFlowToken.*` | `LiquidStake` | "Liquid staked 100 FLOW" |

### 8. Inbox

| Event | `action` | `detail` |
|---|---|---|
| `flow.InboxValuePublished` | `inbox_published` | "Published capability to 0x5678" |
| `flow.InboxValueClaimed` | `inbox_claimed` | "Claimed capability from 0x1234" |
| `flow.InboxValueUnpublished` | `inbox_unpublished` | "Unpublished inbox value" |

## Migration Plan

### Frontend

`frontend/app/lib/deriveFromEvents.ts` becomes a thin re-export:

```typescript
export { decodeEvents as deriveEnrichments } from '@flowindex/event-decoder'
export type { FTTransfer, NFTTransfer, EVMExecution, DecodedEvents as DerivedEnrichments } from '@flowindex/event-decoder'
```

`TransactionRow.tsx` imports `buildSummary` and `deriveTags` from the package. The frontend-specific parts (tag-based summaries from backend `tx.tags`, template_description fallback) stay in the component as a wrapper.

### Runner

`TransactionPreview.tsx` imports `decodeEvents` and `buildSummary` to replace raw event display with:
1. Summary line at top
2. Decoded transfers / swaps / staking actions
3. System events (account, contract, capability changes)
4. Raw events in collapsed section (kept for debugging)

## Dependencies

- **Zero external deps** — all logic is pure TypeScript
- **Build:** tsup (already a root devDep)
- **Workspace:** added to root `workspaces` (already includes `packages/*`)

## Source Files to Extract

| Source | Lines | Destination |
|---|---|---|
| `frontend/app/lib/deriveFromEvents.ts` | ~813 | `tokens.ts`, `evm.ts`, `cadence.ts`, `constants.ts`, `types.ts` |
| `frontend/app/components/TransactionRow.tsx` (buildSummaryLine, deriveActivityType, deriveAllActivityBadges) | ~200 | `summary.ts`, `tags.ts` |
| `backend/internal/ingester/defi_worker.go` (DEX patterns, field extraction) | ~175 | `defi.ts` |
| `backend/internal/ingester/staking_worker.go` (event classification, field extraction) | ~170 | `staking.ts` |
| `backend/internal/ingester/tx_contracts_worker.go` (tag derivation) | ~50 | `tags.ts` |
| New: Flow core event handling | new | `system.ts` |

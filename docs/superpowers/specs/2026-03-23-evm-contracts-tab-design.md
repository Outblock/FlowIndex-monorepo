# EVM Contracts Tab — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add an EVM contracts tab to the existing `/contracts` page, allowing users to browse both Cadence and EVM smart contracts in one place. EVM contract data is proxied from Blockscout. Clicking an EVM contract navigates to a new FlowIndex internal detail page with source code, ABI, read/write interactions, and transaction history.

## Requirements

1. **Tab switching** on `/contracts` page: Cadence (default) / EVM, persisted in URL as `?tab=cadence|evm`
2. **EVM list** shows verified smart contracts from Blockscout's `/api/v2/smart-contracts` endpoint (which returns verified contracts). To also show all contract addresses, we can supplement with `/api/v2/addresses?type=contract` or query the Blockscout DB directly via `s.blockscoutDB` — but MVP starts with verified contracts list since that's what Blockscout's reference page shows.
3. **EVM list columns**: Contract (name + address), Balance, Txs, Language/Compiler version, Settings (optimization), Verified status, License
4. **Sorting**: by Balance, Txs, and other columns (Blockscout API supports this)
5. **Search**: by contract name or address (via Blockscout `q` param)
6. **Detail page** at `/contracts/evm/$address` with full contract explorer
7. **Read contract** interaction via Blockscout API proxy
8. **Write contract** interaction via wallet + RPC (frontend-only, no backend proxy needed)
9. **Verify & publish** via Blockscout API proxy

## Architecture

### Data Flow

```
Frontend <-> FlowIndex Backend (proxy) <-> Blockscout API (evm.flowindex.io)
```

All EVM contract data is fetched from Blockscout's API v2. The FlowIndex backend acts as a transparent proxy, keeping the frontend decoupled from Blockscout directly (avoids CORS, keeps API surface unified).

**Exception — Write Contract:** Write transactions are submitted directly from the user's wallet to the Flow-EVM JSON-RPC endpoint. The backend is not involved in transaction submission. The flow is:
1. Frontend reads method ABI from the Blockscout proxy
2. Frontend encodes call data using the ABI (via viem/ethers)
3. Frontend sends transaction via user's connected wallet (EIP-1193 provider from `packages/evm-wallet`)
4. Transaction goes to Flow-EVM RPC, not through Blockscout

### Backend — New API Endpoints

All GET endpoints proxy to Blockscout via existing `proxyBlockscout()`. POST endpoints require a new `proxyBlockscoutPOST()` helper that forwards `r.Method`, `r.Body`, and `Content-Type` header (the current `proxyBlockscout` hardcodes `http.MethodGet`).

| FlowIndex Endpoint | Blockscout Target | Method | Description |
|---|---|---|---|
| `GET /flow/evm/smart-contracts` | `/api/v2/smart-contracts` | GET | List verified smart contracts (supports sort/search/pagination) |
| `GET /flow/evm/smart-contracts/counters` | `/api/v2/smart-contracts/counters` | GET | Total/verified contract counts |
| `GET /flow/evm/smart-contracts/{address}` | `/api/v2/smart-contracts/{address}` | GET | Contract detail (metadata, source, ABI, compiler info) |
| `GET /flow/evm/smart-contracts/{address}/methods-read` | `/api/v2/smart-contracts/{address}/methods-read` | GET | Read-only methods list |
| `GET /flow/evm/smart-contracts/{address}/methods-write` | `/api/v2/smart-contracts/{address}/methods-write` | GET | Write methods list (ABI only, execution is client-side) |
| `POST /flow/evm/smart-contracts/{address}/query-read-method` | `/api/v2/smart-contracts/{address}/query-read-method` | POST | Execute a read call |
| `POST /flow/evm/smart-contracts/{address}/verification/via/{type}` | `/api/v2/smart-contracts/{address}/verification/via/{type}` | POST | Verify contract (supports: `standard-input`, `flattened-code`, `multi-part`, `vyper-code`) |

**Implementation notes:**
- Add handlers in `v1_handlers_evm.go` following the existing Blockscout proxy pattern
- Address params must be normalized via `normalizeAddr()` (strip/add `0x`, lowercase) — same as existing EVM handlers
- Extend `proxyBlockscout` to support POST: create `proxyBlockscoutWithBody()` that uses `r.Method` instead of hardcoded GET, and forwards `r.Body` + `Content-Type` header
- Verification is async in Blockscout — returns immediately, frontend can poll the contract detail endpoint to check `is_verified` status
- The `/counters` route must be registered BEFORE `/{address}` to avoid the router matching "counters" as an address

**Reused existing endpoints** (no new backend work needed):
- `GET /flow/evm/address/{address}/transactions` — contract transactions
- `GET /flow/evm/address/{address}/token-transfers` — token transfers
- `GET /flow/evm/address/{address}/internal-transactions` — internal txs

### Frontend — Contracts List Page (`/contracts`)

**Changes to `frontend/app/routes/contracts/index.tsx`:**

1. Add two top-level tabs above the existing filter row: **Cadence** | **EVM**
2. URL state: `?tab=cadence` (default) or `?tab=evm`
3. When tab=cadence: render existing Cadence contracts UI unchanged
4. When tab=evm: render new `EVMContractsList` component

**`EVMContractsList` component:**
- Fetches from `/flow/evm/smart-contracts` with query params for sort, search, pagination
- Displays table with columns: Contract (name + truncated address), Balance (FLOW), Txs, Language/Compiler, Settings (optimization icon), Verified (checkmark/cross), License
- Search input: filter by contract name or address (Blockscout `q` param)
- Sortable column headers (Balance, Txs)
- Shows total/verified counts from `/smart-contracts/counters` (parse string values to numbers for display)

**Pagination:**
- Blockscout uses opaque `next_page_params` tokens (not offset-based)
- Use **Previous / Next** navigation (no page numbers) — different from Cadence's offset pagination
- Store `next_page_params` in component state; serialize to URL as encoded JSON in `?page_params=...` for shareability
- The existing `Pagination` component (`currentPage` + `hasNext` props) won't work directly — create a simple `CursorPagination` component with Prev/Next buttons

### Frontend — EVM Contract Detail Page

**New route: `frontend/app/routes/contracts/evm/$address.tsx`**

**Layout:**
- Header: contract name (if verified), address with copy button, balance, creation tx link
- Verification status badge (Verified / Unverified / Partial Match)
- Active tab persisted in URL: `/contracts/evm/0x1234?tab=source` (for deep linking / shareability)

**Tabs:**

1. **Source** (verified only)
   - Solidity source code with syntax highlighting (Prism, language: solidity)
   - Compiler info: version, optimization, runs, EVM version
   - Constructor arguments (decoded)
   - Multi-file support: file explorer sidebar (like Blockscout)

2. **ABI** (verified only)
   - JSON viewer, copy button

3. **Bytecode**
   - Creation bytecode + deployed bytecode
   - Always available (even unverified)

4. **Read Contract** (verified only)
   - List of read methods from `methods-read` endpoint
   - Each method: expandable, input fields for params, "Query" button
   - Results displayed inline
   - Calls `query-read-method` POST endpoint via backend proxy

5. **Write Contract** (verified only)
   - List of write methods from `methods-write` endpoint
   - Input fields for params, "Write" button
   - Requires wallet connection (EIP-1193 provider from `packages/evm-wallet`)
   - Transaction encoded client-side from ABI, submitted via wallet to Flow-EVM RPC
   - No backend proxy needed for tx submission

6. **Transactions** — reuse `EVMTransactionList`, data from existing `/flow/evm/address/{address}/transactions`

7. **Token Transfers** — reuse `EVMTokenTransfers`, data from existing `/flow/evm/address/{address}/token-transfers`

8. **Internal Txs** — reuse `EVMInternalTxList`, data from existing `/flow/evm/address/{address}/internal-transactions`

**Unverified contract behavior:**
- Default tab: **Bytecode** (since Source/ABI/Read/Write are unavailable)
- Source, ABI, Read, Write tabs: shown as **disabled** with tooltip "Contract not verified"
- Prominent "Verify & Publish" CTA button in the header area
- Transactions/Token Transfers/Internal Txs tabs always available

### Frontend — New Types

Add to `frontend/app/types/blockscout.ts`:

```typescript
// Reusable address param (used across Blockscout API responses)
export interface BSAddressParam {
  hash: string
  name: string | null
  is_contract: boolean
  is_verified: boolean | null
  implementation_name: string | null
}

export interface BSSmartContract {
  address: BSAddressParam
  name: string | null
  compiler_version: string | null
  optimization_enabled: boolean | null
  optimization_runs: number | null
  evm_version: string | null
  verified_at: string | null
  is_verified: boolean
  source_code: string | null
  abi: any[] | null
  constructor_args: string | null
  creation_bytecode: string | null
  deployed_bytecode: string | null
  language: string | null
  license_type: string | null
  tx_count: number
  coin_balance: string | null
  additional_sources: Array<{
    file_path: string
    source_code: string
  }> | null
}

export interface BSSmartContractListItem {
  address: BSAddressParam
  name: string | null
  compiler_version: string | null
  optimization_enabled: boolean | null
  is_verified: boolean
  language: string | null
  license_type: string | null
  tx_count: number
  coin_balance: string | null
  verified_at: string | null
}

export interface BSSmartContractCounters {
  smart_contracts: string   // parse to number for display
  verified_smart_contracts: string
  new_smart_contracts_24h: string
  verified_smart_contracts_24h: string
  new_verified_smart_contracts_24h: string
}

export interface BSMethodRead {
  type: string
  method_id: string
  name: string
  inputs: Array<{ name: string; type: string; value?: string }>
  outputs: Array<{ name: string; type: string; value?: string }>
  stateMutability: string
}

export interface BSMethodWrite {
  type: string
  method_id: string
  name: string
  inputs: Array<{ name: string; type: string }>
  stateMutability: string
}
```

## Navigation

- `/contracts` → defaults to `?tab=cadence`
- `/contracts?tab=evm` → EVM contracts list
- Click EVM contract row → `/contracts/evm/{address}`
- `/contracts/evm/{address}?tab=source|abi|bytecode|read|write|txs|transfers|internal`
- Sidebar "Contracts" link → `/contracts` (existing, no change)

## Reused Components

- `EVMTransactionList` — for Transactions tab in detail page
- `EVMTokenTransfers` — for Token Transfers tab
- `EVMInternalTxList` — for Internal Txs tab
- `AddressLink` — for address display

## Out of Scope

- Syncing Blockscout data into FlowIndex database
- Custom indexing of EVM contracts
- EVM contract deployment from FlowIndex UI
- Merging Cadence and EVM contracts into a unified list
- Listing ALL (unverified) contracts in MVP — can be added later via `/api/v2/addresses?type=contract` or direct Blockscout DB query

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Blockscout API rate limits | Backend proxy can add caching; `blockscoutAPIKey` already appended |
| Blockscout API changes | Proxy layer isolates frontend from breaking changes |
| Large source code files | Lazy-load source tabs, paginate if needed |
| Pagination style mismatch | New `CursorPagination` component for Blockscout's opaque tokens |
| Verification async delay | Poll contract detail endpoint; show "Verification pending" state |

# Deploy Dashboard Design

## Goal

Split the Runner into two modes — **Editor** (current Monaco editor) and **Deploy** (full-page Vercel-like dashboard). The deploy dashboard shows users their on-chain contracts with insights (holders, dependents, versions, tx volume) and integrates the existing GitHub CD pipeline.

## Architecture

**SPA with client-side routing.** Add `react-router-dom` to the existing Vite SPA. Deploy page components are lazy-loaded. Auth (Supabase) and FCL wallet state shared at the app root.

### Routes

```
/              → redirect to /editor
/editor        → Monaco editor (current App component, unchanged)
/deploy        → Deploy dashboard (new)
/deploy/:id    → Contract detail page (address.ContractName)
```

### Shared Layout

Top nav bar across both modes:
- Logo + "FlowIndex Runner"
- Mode tabs: **Editor** | **Deploy**
- User menu (auth state)

Editor mode retains its full header (LSP, network, Run button). Deploy mode uses a clean dashboard layout.

## Address Management

Users bind Flow addresses via FCL wallet signature verification.

### Flow

1. User clicks "Add Address" on deploy dashboard
2. Connects FCL wallet (Lilico, Flow Wallet, etc.)
3. App generates challenge: `"Verify address 0x{addr} for FlowIndex at {timestamp}"`
4. User signs via `fcl.currentUser.signUserMessage()`
5. Signature sent to edge function → verifies using on-chain account keys
6. Address saved to `runner_verified_addresses`

### DB Table

```sql
CREATE TABLE runner_verified_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, address, network)
);
```

Multiple addresses per user. Each address shows contracts from that account on the selected network.

## Data Sources

- **Contract insights**: Direct calls to `flowindex.io/flow/v1/*` API (no proxy)
  - `/flow/contract?address={addr}` — list contracts for address
  - `/flow/contract/{identifier}` — detail with versions
  - `/flow/contract/{identifier}/events` — event types
  - `/flow/contract/{identifier}/dependencies` — import graph
  - `/flow/ft/{token}/top-account` — holder data (for FT contracts)
  - `/flow/nft/{type}/top-account` — holder data (for NFT contracts)
- **Deploy data**: Runner server + Supabase (existing CD pipeline)
  - `runner_deploy_environments` — environment configs
  - `runner_deployments` — deploy history
  - `runner_github_connections` — repo links

## Dashboard Layout

### /deploy — Main Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ ◇ FlowIndex Runner   [Editor] [Deploy]            👤 user  │
├──────────┬──────────────────────────────────────────────────┤
│ Addresses│  My Contracts                                    │
│          │                                                  │
│ ● 0x1234 │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│   mainnet│  │ MyToken  │ │ MyNFT   │ │ Staking  │       │
│          │  │ FT · v3  │ │ NFT · v1│ │ v2       │       │
│ ○ 0x5678 │  │ 1.2k hold│ │ 340 hold│ │ 12 deps  │       │
│   testnet│  │ ✅ 2h ago │ │ ✅ 3d   │ │ ⚠ no CD  │       │
│          │  └──────────┘ └──────────┘ └──────────┘       │
│ [+ Add]  │                                                  │
│          │  Recent Deployments                              │
│──────────│  ┌───────────────────────────────────────┐      │
│ GitHub   │  │ MyToken v3 → mainnet  ✅  2h ago      │      │
│ ● linked │  │ MyNFT  v1 → testnet  ✅  3d ago      │      │
│ repo/name│  └───────────────────────────────────────┘      │
└──────────┴──────────────────────────────────────────────────┘
```

**Left sidebar:**
- Address list with network badges
- Add Address button
- GitHub connection status + link

**Main area:**
- Contract cards grid: name, kind (FT/NFT/Contract), version, holder/dependent count, last deploy status
- Recent Deployments list (aggregated across all contracts)
- Contracts without CD show "⚠ no CD" — click to set up

### /deploy/:id — Contract Detail

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back   MyToken (A.0x1234.MyToken)               mainnet  │
├───────────┬───────────┬───────────┬─────────────────────────┤
│ 1,234     │ 12        │ v3        │ Jan 1, 2024             │
│ holders   │ dependents│ version   │ first deployed          │
├───────────┴───────────┴───────────┴─────────────────────────┤
│ [Holders Trend]              [Transaction Volume]           │
│  Charts (Recharts)                                          │
├─────────────────────────────────────────────────────────────┤
│ Events: Deposit(12k) Withdraw(8k) Mint(200)                │
│ Imports: FungibleToken, MetadataViews, ViewResolver         │
├─────────────────────────────────────────────────────────────┤
│ CD Pipeline                        [Settings]               │
│ ● GitHub: owner/repo (main branch)                          │
│ ● Environment: Prod → mainnet                               │
│                                                             │
│ Deploy History                     [Dry Run] [Rollback]     │
│  v3  abc1234  "Add minting"   ✅ success   2h ago          │
│  v2  def5678  "Fix transfer"  ✅ success   3d ago          │
│  v1  ghi9012  "Initial"       ✅ success   1w ago          │
└─────────────────────────────────────────────────────────────┘
```

**Stat cards:** holders, dependents, version count, first deployed date
**Charts:** Recharts (already in project) — holder trend line, tx volume bar chart
**Events section:** Event types with counts
**Dependencies:** Imported contracts list
**CD Pipeline:** Existing GitHub deploy integration (moved from editor sidebar)

## Migration from Current Deploy UI

- Move `DeployPanel` and `DeploySettings` from editor sidebar to deploy dashboard
- Editor sidebar: remove deploy section, keep only file explorer + git panel
- GitHub connection state shared at app root, accessible from both modes

## Components (New)

```
runner/src/deploy/
├── DeployDashboard.tsx    — Main /deploy page
├── ContractDetail.tsx     — /deploy/:id page
├── AddressSidebar.tsx     — Address list + add
├── ContractCard.tsx       — Grid card per contract
├── ContractStats.tsx      — Stat cards row
├── ContractCharts.tsx     — Recharts holders/tx charts
├── ContractEvents.tsx     — Event types list
├── ContractDeps.tsx       — Dependencies list
├── AddAddressModal.tsx    — FCL sign + verify flow
└── DeployHistory.tsx      — Reused from existing
```

## Edge Function Additions

- `POST /github/verify-address` — Verify FCL signature, bind address to user
- `GET /github/addresses` — List user's verified addresses
- `DELETE /github/addresses/:id` — Remove bound address

## Workflow Dispatch Fix

The `Resource not accessible by integration` error on dry-run/rollback is because the GitHub App needs `actions: write` permission. This needs to be added to the GitHub App's settings.

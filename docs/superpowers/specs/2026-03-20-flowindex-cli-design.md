# FlowIndex CLI — Design Spec

## Overview

A unified command-line tool for Flow developers and FlowIndex platform users. Query on-chain data with zero setup; unlock platform features (webhooks, workflows, wallet) after login.

**Package:** `@flowindex/cli`
**Binary:** `flowindex`
**Install:** `npm i -g @flowindex/cli` or `npx @flowindex/cli`
**Location:** `packages/cli/` in the monorepo

## Goals

1. Give Flow developers a fast way to query indexed blockchain data from the terminal — what Flow CLI can't do (search, filters, aggregation, EVM, tokens, NFTs).
2. Give FlowIndex platform users CLI access to webhooks, workflows, wallet, and API keys.
3. Unify Cadence and EVM under one interface — auto-detect chain context, never force users to specify.
4. Reuse existing SDKs and packages rather than rewrite logic.

## Non-Goals

- Replace Flow CLI for project scaffolding, emulator, or deployment.
- Provide a GUI or TUI dashboard (text output only, pipe-friendly).
- Support self-hosted FlowIndex instances in v1 (hardcode `api.flowindex.io`).

## Tech Stack

- **Language:** TypeScript
- **Framework:** Commander.js (already used by `agent-wallet`)
- **Monorepo:** workspace package at `packages/cli/`
- **Build:** tsup → ESM bundle (matches `agent-wallet` and other ESM-first packages in the repo)
- **Publish:** npm as `@flowindex/cli` with `bin: { "flowindex": "./dist/cli.js" }`

## Unified Chain Model

The CLI treats Flow as one chain. Users never need to specify Cadence vs EVM.

**Auto-detection rules:**

| Input | Detection | Example |
|-------|-----------|---------|
| 64-char hex (no `0x`) | Flow transaction hash | `flowindex tx a1b2c3...` |
| 66-char `0x`-prefixed hex | EVM transaction hash | `flowindex tx 0xabc...` |
| `0x` + 64-char hex | Ambiguous — try EVM tx first, fallback to Flow tx (strip `0x`) | `flowindex tx 0xa1b2c3...` |
| 16-char hex (no `0x`) | Flow address | `flowindex account e467b9dd11fa00df` |
| 42-char `0x`-prefixed hex | EVM address | `flowindex account 0x1234...abcd` |
| `.find` / `.fn` suffix | Flow name service → resolve to address | `flowindex account hao.find` |
| Numeric | Block height | `flowindex block 85000000` |
| Anything else | Search query | `flowindex search FlowToken` |

**Edge cases:**
- If a `0x`-prefixed 66-char input fails as EVM tx, retry as Flow tx (strip `0x` prefix). Show which interpretation was used.
- Name service is extensible — `.find` and `.fn` in v1, more suffixes can be added.
- When a Flow transaction contains EVM sub-transactions, show both layers in the output.

## Command Reference

### Data Commands (no auth required)

```
flowindex search <query>
    Search across transactions, accounts, contracts, tokens, NFTs, blocks, nodes.
    Options: --type tx|account|contract|token|nft|block|node, --limit N

flowindex block [height]
    Show block details. Default: latest block.
    Options: --txs (include transaction list), --format json|csv

flowindex tx <hash>
    Show transaction details. Auto-detects Cadence or EVM hash.
    Cadence tx: status, script, events, authorizers, gas.
    EVM tx: from, to, value, gas, logs, internal txs.
    Cross-VM tx: shows both Cadence wrapper and EVM inner tx.
    Options: --events, --format json

flowindex account <address>
    Account overview: balance, keys, contracts, COA (if linked).
    Auto-detects Flow address or EVM address.
    Flow address → calls /flow/v1/account/{address}
    EVM address → calls /flow/v1/evm/address/{address}
    Options:
      --transfers         Recent transfers
      --ft                FT holdings with USD values
      --nft               NFT holdings
      --contracts         Deployed contracts
      --keys              Account keys
      --staking           Staking info (if node operator/delegator)
      --limit N           Limit results for list sub-queries (default 20)
      --format json|csv

flowindex token [symbol]
    Without args: list all indexed FT tokens with prices.
    With symbol: token details, price, supply, top holders.
    Options: --holders, --transfers, --limit N (default 20), --offset N, --format json|csv

flowindex nft [collection]
    Without args: list indexed NFT collections.
    With collection: collection details, items, holders.
    Options: --items, --holders, --limit N (default 20), --offset N, --format json|csv

flowindex contract <identifier>
    Contract details, source code, versions, dependencies.
    Identifier: "A.address.ContractName" or just "ContractName" (search).
    Options: --source, --versions, --deps, --format json

flowindex stats
    Network overview: block height, tx rate, epoch, staking info, FLOW price.
    Options: --format json

flowindex node [node-id]
    Without args: list staking nodes.
    With node-id: node details, delegators, rewards.
    Options: --limit N, --offset N, --format json|csv
```

### Global Flags

```
--format json|csv|table   Output format (default: table for TTY, json for pipes)
--network mainnet|testnet Network selection (default: mainnet; testnet support planned)
--quiet                   Minimal output — only essential data (e.g., just the tx hash)
--no-color                Disable colored output
```

### Auth Commands

```
flowindex auth login
    Open browser for OAuth login (Supabase auth on flowindex.io).
    In non-TTY/CI environments: exits with error directing user to --token or env var.
    Alternative: flowindex auth login --token <api-key>
    Stores credentials in ~/.config/flowindex/credentials.json (mode 0600)

flowindex auth logout
    Clear stored credentials.

flowindex auth status
    Show current auth state: logged in user, API key info, rate limit tier.
```

### Platform Commands (auth required)

```
flowindex webhook list
    List active webhook endpoints with their subscriptions.
    Options: --limit N, --offset N, --format json|csv

flowindex webhook create <url>
    Create webhook endpoint and subscribe to events.
    Options: --events "Transfer,ContractDeployed", --filter "address=0x..."

flowindex webhook delete <id>
    Delete a webhook endpoint and all its subscriptions.

flowindex webhook logs <id>
    Show recent delivery logs for a webhook.
    Options: --limit N, --status success|failed

flowindex workflow list
    List workflows in your Sim Studio workspace.
    Options: --limit N, --format json|csv

flowindex workflow run <id>
    Execute a workflow.
    Options: --input '{"key":"value"}', --wait (block until complete),
             --timeout 300 (seconds, for --wait mode, default 300)

flowindex workflow status <job-id>
    Check workflow execution status.

flowindex workflow logs <job-id>
    Show execution logs for a workflow run.

flowindex wallet balance
    Show wallet balances (FLOW + FTs).

flowindex wallet send <to> <amount>
    Send FLOW or tokens. Opens browser for passkey signing approval.
    Uses the existing agent-wallet approval flow (create approval request →
    open browser → user signs with passkey → CLI polls for completion).
    Options: --token USDC (default: FLOW)

flowindex wallet sign <message>
    Sign a message. Opens browser for passkey approval.

flowindex key list
    List API keys.

flowindex key create
    Create a new API key.
    Options: --name "my-key", --scopes "read,webhook"

flowindex key revoke <id>
    Revoke an API key.
```

### Config Commands

```
flowindex config set <key> <value>
    Set config value. Keys: output-format (table|json|csv), color (true|false), network (mainnet|testnet).

flowindex config get <key>
    Get config value.

flowindex config list
    Show all config.

flowindex config reset
    Reset to defaults.
```

## Authentication Model

| Tier | Auth | Rate Limit | Access |
|------|------|------------|--------|
| Anonymous | None | 30 req/min | Data commands only |
| Authenticated | OAuth or API key | 300 req/min | All commands |

**Login flow (browser OAuth):**
1. `flowindex auth login` opens browser to `https://flowindex.io/cli/auth`
2. User logs in via Supabase (Google, passkey, etc.)
3. Browser redirects to `http://localhost:<random-port>/callback` with tokens
4. CLI stores in `~/.config/flowindex/credentials.json` (mode 0600):
   - `access_token` (JWT)
   - `refresh_token`
   - `expires_at` (timestamp)
5. On each request: if `expires_at` is within 60s, refresh using `refresh_token`
6. If refresh fails (refresh token expired): prompt user to re-login
7. In non-TTY / `CI=true` environments: skip browser, error with instructions to use `--token`

**API key flow:**
1. `flowindex auth login --token <key>` stores key directly
2. Or set `FLOWINDEX_API_KEY` env var (CI/CD friendly)
3. API keys don't expire, no refresh needed

## Output Formatting

**Default:** Human-readable tables with colors when TTY detected; JSON when piped.

```
$ flowindex tx a1b2c3d4...
Transaction a1b2c3d4e5f6...

  Status       Sealed
  Block        85,234,567
  Time         2026-03-20 14:32:01 UTC
  Payer        e467b9dd11fa00df
  Authorizers  e467b9dd11fa00df
  Gas Used     42

  Events (3)
  ├─ FlowToken.TokensWithdrawn  from=e467b9dd  amount=1.5
  ├─ FlowToken.TokensDeposited  to=1654653b    amount=1.5
  └─ FlowFees.FeesDeducted      amount=0.00001
```

**JSON mode:** `--format json` or `FLOWINDEX_OUTPUT=json` env var. Outputs raw API response, pipe to `jq`.

**CSV mode:** `--format csv` for list commands (token, nft, node, webhook list, etc.). Non-list commands ignore CSV and fall back to JSON.

**Quiet mode:** `--quiet` for scripts — output only essential data (e.g., just the tx hash).

**Pagination:** All list commands support `--limit N` (default 20) and `--offset N`. Output includes a "Showing X of Y" footer in table mode. JSON mode includes `{ data: [...], hasMore: bool }`.

## Config & Credential Storage

```
~/.config/flowindex/
├── config.json         # User preferences (output-format, color, network)
└── credentials.json    # Auth tokens or API key (file mode 0600)
```

Respects `XDG_CONFIG_HOME` if set. All config overridable via env vars prefixed `FLOWINDEX_`.

## Code Reuse Strategy

| CLI Feature | Existing Package | Reuse |
|-------------|-----------------|-------|
| Chain queries (tx, account, block, token, nft) | `packages/agent-wallet/src/flowindex/client.ts` | Extract + extend into shared `packages/api-client/` |
| Webhook management | `packages/webhooks-sdk/` | Import with `baseUrl` override from CLI config |
| Workflow execution | None (Sim Studio has no public SDK yet) | Phase 3: add HTTP API to Sim Studio, then build client |
| Wallet operations | `packages/agent-wallet/src/tools/` | Reuse approval-flow pattern (browser-based passkey signing) |
| Auth (OAuth flow) | New code | CLI-specific browser OAuth + token storage |
| Output formatting | New code | CLI-specific table/json/csv renderers |

**Key refactor:** Extract HTTP client + query logic from `agent-wallet/src/flowindex/client.ts` into a shared `packages/api-client/`. The existing client has `getAccount`, `getFlowBalance`, `getFtBalances`, `getNftCollections`, `getTransaction`, `simulateTransaction`. The CLI needs additional methods (blocks, token lists, contract details, stats, staking, EVM queries, search) — these will be written as new methods in the shared client.

**Webhooks SDK note:** The existing `packages/webhooks-sdk/` is branded as `FlowScan` with default `baseUrl: https://api.flowscan.io`. The CLI must inject `baseUrl` from config (pointing to `api.flowindex.io`). A future cleanup should rebrand the SDK, but not a blocker for v1.

**Workflow dependency:** Sim Studio currently has no public REST API for triggering workflows externally. Phase 3 requires adding API endpoints to Sim Studio first. This is a backend prerequisite, not a CLI task.

**Wallet signing:** Passkeys (WebAuthn) require a browser — they cannot run in Node.js. The CLI uses the same pattern as `agent-wallet` cloud-interactive mode: create an approval request via API → open browser for user to sign with passkey → poll for completion. No private keys touch the CLI process.

## Package Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── cli.ts                  # Entry point, Commander setup, global flags
│   ├── commands/
│   │   ├── search.ts
│   │   ├── block.ts
│   │   ├── tx.ts
│   │   ├── account.ts
│   │   ├── token.ts
│   │   ├── nft.ts
│   │   ├── contract.ts
│   │   ├── stats.ts
│   │   ├── node.ts
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   └── status.ts
│   │   ├── webhook/
│   │   │   ├── create.ts
│   │   │   ├── list.ts
│   │   │   ├── delete.ts
│   │   │   └── logs.ts
│   │   ├── workflow/
│   │   │   ├── list.ts
│   │   │   ├── run.ts
│   │   │   ├── status.ts
│   │   │   └── logs.ts
│   │   ├── wallet/
│   │   │   ├── balance.ts
│   │   │   ├── send.ts
│   │   │   └── sign.ts
│   │   ├── key/
│   │   │   ├── create.ts
│   │   │   ├── list.ts
│   │   │   └── revoke.ts
│   │   └── config/
│   │       ├── set.ts
│   │       ├── get.ts
│   │       ├── list.ts
│   │       └── reset.ts
│   ├── lib/
│   │   ├── api-client.ts       # HTTP client (wraps packages/api-client)
│   │   ├── auth.ts             # Token storage, refresh, OAuth flow
│   │   ├── config.ts           # Config file management
│   │   ├── detect.ts           # Auto-detect input type (address, tx hash, etc.)
│   │   ├── output.ts           # Table, JSON, CSV formatters
│   │   └── errors.ts           # Error handling, user-friendly messages
│   └── index.ts                # Programmatic API export
└── test/
    ├── detect.test.ts
    ├── commands/
    │   └── ...
    └── fixtures/
```

## Implementation Priority

**Phase 1 — Core data commands (MVP)**
- `flowindex tx`, `flowindex account`, `flowindex block`, `flowindex search`
- Auto-detection logic (`lib/detect.ts`)
- Output formatting (table + JSON)
- Config management (`flowindex config`)
- Extract `packages/api-client/` from `agent-wallet`
- Publish to npm

**Phase 2 — Auth + extended data**
- `flowindex auth login/logout/status` (browser OAuth + API key)
- `flowindex token`, `flowindex nft`, `flowindex contract`, `flowindex stats`, `flowindex node`
- Rate limit handling (display remaining quota, warn on approach)
- Credential storage with auto-refresh

**Phase 3 — Platform commands** (requires Sim Studio API work)
- `flowindex webhook` (via webhooks-sdk with baseUrl override)
- `flowindex workflow` (requires new Sim Studio HTTP API endpoints)
- `flowindex key`

**Phase 4 — Wallet + future**
- `flowindex wallet` (balance, send, sign via browser approval flow)
- `flowindex ai "<natural language query>"` (future)
- `flowindex watch <address>` (WebSocket live feed, future)
- Shell completions for bash/zsh (future)

## Resolved Decisions

1. **Shared API client:** Create `packages/api-client/` in Phase 1. It's the third consumer of FlowIndex API calls (after MCP server and frontend). Delaying means duplicating logic.
2. **Shell completions:** Defer to post-v1. Commander.js supports this natively when ready.
3. **No args behavior:** `flowindex` with no args shows help (standard CLI convention). No interactive REPL.
4. **Module format:** ESM (matches `agent-wallet` and other packages in the repo).
5. **Network flag:** `--network mainnet|testnet` as global flag. v1 only supports mainnet; testnet returns "not yet supported" error.

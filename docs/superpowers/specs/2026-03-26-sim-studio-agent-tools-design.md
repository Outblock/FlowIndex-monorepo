# Sim Studio Agent Tools: Template Discovery + Preflight Simulation

**Date**: 2026-03-26
**Status**: Draft
**Scope**: MVP — Template Discovery + Preflight Simulation (Approval Queue deferred to v2)

## Context

FlowIndex has a comprehensive agent-wallet MCP package (`@flowindex/agent-wallet`) with 27 tools covering wallet management, Cadence template execution, transaction simulation, approval queues, and EVM operations. Sim Studio already handles most transaction signing and sending via local blocks (`flow_send_transaction`, `flow_evm_send`, etc.) using `@flowindex/flow-signer`.

The gap analysis identified 4 missing capabilities in Sim Studio. This MVP addresses the first two:

1. **Template Discovery** — Agent can browse and inspect 71 audited Cadence templates
2. **Preflight Simulation** — Agent can simulate transactions on mainnet-fork before execution

Deferred to v2:
- Approval Queue (confirm/cancel pending transactions)
- High-level EVM blocks (ERC-20 balance, token transfers without raw calldata)

## Decision: Local Blocks over MCP

We chose to implement these as **local Sim Studio blocks/tools** rather than connecting agent-wallet as a remote MCP server because:

- **Security**: Private keys never leave the Sim Studio process. HTTP transport would require transmitting credentials to an external MCP service.
- **Simplicity**: No additional HTTP service to deploy or manage.
- **Consistency**: Follows the existing pattern of `flow_send_transaction` and other Flow blocks.
- **Reuse**: Both blocks share the same `@flowindex/flow-signer` infrastructure already in use.

agent-wallet MCP continues to serve Claude Desktop and other stdio-based MCP clients independently.

## Architecture

```
Agent Block (tool-input)                Visual Workflow (drag & drop)
  ├── flow_list_templates  (tool)         ├── [flow_templates] block
  ├── flow_get_template    (tool)         └── [flow_simulate] block
  ├── flow_simulate_transaction (tool)              ↓
  └── flow_simulate_template    (tool)    [flow_send_transaction] block (existing)

Tools layer (apps/sim/tools/flow/)
  └── 4 new tool files, registered in tools/registry.ts

Blocks layer (apps/sim/blocks/blocks/)
  └── 2 new block files, registered in blocks/registry.ts

API Routes (apps/sim/app/api/tools/flow/)
  └── 4 new route handlers

Dependency
  └── @flowindex/agent-wallet (workspace:*) — via new "./templates" subpath export
```

## Tool Layer (4 tools)

### 1. `flow_list_templates`

- **Input**: `category?` — optional filter (base, token, collection, bridge, evm, hybrid-custody, lost-and-found)
- **Output**: `{templates: [{id, name, description, category, type}]}`
- **Implementation**: Import `listTemplates()` from `@flowindex/agent-wallet/templates` (new subpath export — see Dependencies section). Returns cached metadata only (< 10KB), no `.cdc` source loaded.

### 2. `flow_get_template`

- **Input**: `templateId` (string)
- **Output**: `{id, name, description, category, cadence, arguments}`
- **Implementation**: Import `getTemplate(name)` from `@flowindex/agent-wallet/templates`. This function handles `.cdc` file resolution internally (via `import.meta.url` relative paths), loads a single file on demand, and returns the Cadence source + argument schema (from curated metadata or regex extraction).

### 3. `flow_simulate_transaction`

- **Input**: `cadence` (string), `arguments` (JSON-CDC array), `network` (mainnet/testnet), `signerAddress?` (string)
- **Output**: `{success, error?, events, computation_used, balance_changes}`
- **Implementation**: `POST` to `FLOW_SIMULATOR_URL/simulate` (default: `https://simulator.flowindex.io/api`). Only available on mainnet (simulator runs mainnet-fork). Testnet requests return an error.

**Simulator Request Format**:
```json
{
  "cadence": "transaction() { ... }",
  "arguments": [{"type": "Address", "value": "0x1234"}],
  "authorizers": ["f8d6e0586b0a20c7"],
  "payer": "f8d6e0586b0a20c7"
}
```

**Simulator Response Format**:
```json
{
  "success": true,
  "error": null,
  "events": [{"type": "A.1654653399040a61.FlowToken.TokensWithdrawn", "payload": "..."}],
  "computation_used": 145,
  "balance_changes": [{"address": "...", "token": "FlowToken", "delta": "-100.0"}]
}
```

- No auth required (public API, mutex-serialized)
- Addresses: 16-char hex, `0x` prefix accepted but normalized to no-prefix internally
- Arguments: JSON-CDC format (`{type, value}` pairs)
- Each request is snapshot-isolated (no state leakage between simulations)

### 4. `flow_simulate_template`

- **Input**: `templateId` (string), `arguments` (key-value JSON, e.g. `{amount: "100.0", to: "abcdef1234567890"}`), `network`, `signerAddress?`
- **Output**: Same as `flow_simulate_transaction`
- **Implementation**: Resolves template via `getTemplate()` in-process (not via HTTP round-trip), converts key-value arguments to JSON-CDC format using the template's argument schema, then calls the simulator API directly. The JSON-CDC conversion uses each argument's declared Cadence type (e.g. `UFix64`, `Address`) to build `{type, value}` pairs.

## Block Layer (2 blocks)

### Block 1: `flow_templates`

**Type**: `flow_templates`, **Category**: `tools`

**SubBlocks**:
| SubBlock | Type | Condition | Description |
|----------|------|-----------|-------------|
| Action | dropdown | — | `list` or `get` |
| Category | dropdown | action = list | all / base / token / collection / bridge / evm / hybrid-custody / lost-and-found |
| Template ID | combobox | action = get | Search or select template name (populated via `fetchOptions` calling `/api/tools/flow/list-templates`) |

**Output**:
- `action=list` → `{templates: [{id, name, description, category, type}]}`
- `action=get` → `{id, name, description, cadence, arguments}`

### Block 2: `flow_simulate`

**Type**: `flow_simulate`, **Category**: `tools`

**SubBlocks**:
| SubBlock | Type | Condition | Description |
|----------|------|-----------|-------------|
| Mode | dropdown | — | `raw` or `template` |
| Cadence | code | mode = raw | Raw Cadence transaction code |
| Template ID | combobox | mode = template | Select template (populated via `fetchOptions` calling `/api/tools/flow/list-templates`) |
| Arguments | code | — | Transaction arguments (JSON-CDC for raw mode, key-value for template mode) |
| Network | dropdown | — | mainnet / testnet |
| Signer Address | text | — | Optional, 16-char hex Flow address |

**Output**:
```typescript
{
  success: boolean
  error?: string
  events: Array<{type: string, payload: unknown}>
  computation_used: number
  balance_changes: Array<{address: string, token: string, delta: string}>
}
```

## API Routes

| Route | Method | Tool | Auth |
|-------|--------|------|------|
| `/api/tools/flow/list-templates` | POST | `flow_list_templates` | `checkInternalAuth()` |
| `/api/tools/flow/get-template` | POST | `flow_get_template` | `checkInternalAuth()` |
| `/api/tools/flow/simulate-transaction` | POST | `flow_simulate_transaction` | `checkInternalAuth()` |
| `/api/tools/flow/simulate-template` | POST | `flow_simulate_template` | `checkInternalAuth()` |

## Dependencies

**New dependency in `apps/sim/package.json`**:
```json
"@flowindex/agent-wallet": "workspace:*"
```

This resolves to `packages/agent-wallet` in the main repo.

**Prerequisite**: Add a `"./templates"` subpath export to `packages/agent-wallet/package.json`:
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./templates": "./dist/templates/registry.js"
  }
}
```

This isolates the template registry (which only depends on `node:fs` and `node:path`) from the MCP server, signer, and approval code. Sim Studio imports only `listTemplates()` and `getTemplate()` from this subpath — no heavy dependencies (`@modelcontextprotocol/sdk`, `@onflow/fcl`, etc.) are pulled into the Studio bundle.

The registry functions `listTemplates(category?)`, `getTemplate(name)`, and `getTemplates()` are already exported from `registry.ts`.

**Precedent**: `apps/sim` already depends on `@flowindex/flow-signer: "workspace:*"`.

## Environment Variables

| Variable | Default | Scope | Description |
|----------|---------|-------|-------------|
| `FLOW_SIMULATOR_URL` | `https://simulator.flowindex.io/api` | workspace | Simulator API base URL |

Resolved via existing `{{ENV_VAR}}` mechanism in workspace/personal env vars.

## Seed Update

Add to `studio/seed/simstudio_seed.sql`:
- Example workflow demonstrating the **Template Discovery → Simulate → Send** pattern
- Updated skill description for "Cadence MCP Operator" mentioning simulation capability

## Files to Create/Modify

**New files (10)**:
```
apps/sim/tools/flow/list_templates.ts
apps/sim/tools/flow/get_template.ts
apps/sim/tools/flow/simulate_transaction.ts
apps/sim/tools/flow/simulate_template.ts
apps/sim/blocks/blocks/flow_templates.ts
apps/sim/blocks/blocks/flow_simulate.ts
apps/sim/app/api/tools/flow/list-templates/route.ts
apps/sim/app/api/tools/flow/get-template/route.ts
apps/sim/app/api/tools/flow/simulate-transaction/route.ts
apps/sim/app/api/tools/flow/simulate-template/route.ts
```

**Modified files (4)**:
```
apps/sim/tools/registry.ts              — register 4 new tools
apps/sim/blocks/registry.ts             — register 2 new blocks
apps/sim/package.json                   — add @flowindex/agent-wallet dependency
packages/agent-wallet/package.json      — add "./templates" subpath export
```

**Optional (1)**:
```
studio/seed/simstudio_seed.sql      — add example workflow + skill update
```

## Typical Agent Flow

```
User: "Transfer 100 FLOW to 0xabcdef1234567890"

Agent (using tools):
1. flow_list_templates(category: "token")
   → finds "transfer_tokens_v3"
2. flow_get_template("transfer_tokens_v3")
   → gets Cadence source + args schema: {amount: UFix64, to: Address}
3. flow_simulate_template("transfer_tokens_v3", {amount: "100.0", to: "abcdef1234567890"}, "mainnet")
   → {success: true, balance_changes: [{token: "FlowToken", delta: "-100.0"}]}
4. Confirms simulation passed → calls flow_send_transaction (existing block)
```

## V2 Scope (Deferred)

- **Approval Queue**: `flow_queue_transaction`, `flow_confirm_transaction`, `flow_cancel_transaction`, `flow_list_pending` — adds human-in-the-loop approval before signing
- **High-Level EVM Blocks**: `flow_evm_balance`, `flow_evm_token_balance`, `flow_evm_transfer_erc20` — auto-ABI-encoding without raw calldata
- **AgentKit Integration**: PR to Coinbase AgentKit adding Flow EVM support (chain ID 747/545)

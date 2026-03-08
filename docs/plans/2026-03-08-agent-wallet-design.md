# Agent Wallet MCP Server — Design Document

**Date:** 2026-03-08
**Package:** `packages/agent-wallet` (`@flowindex/agent-wallet`)

## Overview

A standalone Node.js MCP server that gives LLMs (Claude Code, Cursor, etc.) the ability to interact with the Flow blockchain and Flow EVM. Supports local signing (private key / mnemonic via wallet-core WASM), cloud custodial signing (FlowIndex API), and passkey signing (WebAuthn browser redirect).

Cadence transactions use pre-vetted FRW templates (not arbitrary code), with optional user approval before signing.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  LLM (Claude Code / Cursor / etc.)                  │
│  ↕ stdio (MCP protocol)                             │
├─────────────────────────────────────────────────────┤
│  packages/agent-wallet  (Node.js MCP Server)        │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ MCP Tools    │  │ Template     │  │ FlowIndex  │ │
│  │ (~22 tools)  │  │ Registry     │  │ API Client │ │
│  │              │  │ (FRW .cdc)   │  │            │ │
│  └──────┬───────┘  └──────────────┘  └────────────┘ │
│         │                                            │
│  ┌──────▼───────┐                                    │
│  │ Approval     │─── on  → 两步确认 / passkey URL   │
│  │ Manager      │─── off → 直接签名                  │
│  └──────┬───────┘                                    │
│         │                                            │
│  ┌──────▼────────────────────────────────┐          │
│  │ Signer Interface                       │          │
│  │  ├── LocalSigner   (wallet-core WASM)  │          │
│  │  ├── CloudSigner   (custodial API)     │          │
│  │  └── PasskeySigner (WebAuthn redirect) │          │
│  └────────────────────────────────────────┘          │
│         │                    │                       │
│  ┌──────▼─────┐    ┌───────▼────────┐               │
│  │ FCL Client  │    │ Viem Client    │               │
│  │ (Flow native)    │ (Flow EVM)     │               │
│  └─────────────┘    └────────────────┘               │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   Flow Access Node     Flow EVM RPC
```

## Configuration

### Minimal (cloud wallet, interactive login)

```json
{
  "mcpServers": {
    "flow-wallet": {
      "command": "npx",
      "args": ["@flowindex/agent-wallet"]
    }
  }
}
```

Zero config starts the server. LLM calls `wallet_login` → returns a URL → user logs in via browser → MCP server receives JWT token via callback.

### Mnemonic (unlocks both Flow + EVM)

```json
{
  "env": {
    "FLOW_MNEMONIC": "word1 word2 ... word12"
  }
}
```

Derives:
- Flow: `m/44'/539'/0'/0/0` (secp256k1)
- EVM: `m/44'/60'/0'/0/0` (EOA address)

### Private Key (Flow only)

```json
{
  "env": {
    "FLOW_PRIVATE_KEY": "0x..."
  }
}
```

### Cloud Wallet (pre-authenticated)

```json
{
  "env": {
    "FLOWINDEX_TOKEN": "eyJ..."
  }
}
```

### Full Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOW_NETWORK` | `mainnet` | `mainnet` / `testnet` |
| `FLOW_MNEMONIC` | — | BIP39 mnemonic. Derives Flow (`m/44'/539'`) + EVM (`m/44'/60'`) |
| `FLOW_PRIVATE_KEY` | — | Hex private key for Flow signing |
| `EVM_PRIVATE_KEY` | — | Hex private key for EVM signing (falls back to mnemonic derivation) |
| `FLOW_ADDRESS` | — | Explicit Flow signer address (auto-discovered if unset) |
| `FLOW_KEY_INDEX` | `0` | Flow account key index |
| `FLOW_SIG_ALGO` | `ECDSA_secp256k1` | `ECDSA_P256` / `ECDSA_secp256k1` |
| `FLOW_HASH_ALGO` | `SHA2_256` | `SHA2_256` / `SHA3_256` |
| `EVM_ACCOUNT_INDEX` | `0` | BIP44 EVM account derivation index |
| `FLOWINDEX_TOKEN` | — | Cloud wallet JWT token (pre-authenticated) |
| `FLOWINDEX_URL` | `https://flowindex.io` | FlowIndex API base URL |
| `APPROVAL_REQUIRED` | `true` | `false` = headless auto-sign |
| `ETHERSCAN_API_KEY` | — | For EVM contract ABI fetching |

### Auto-detection Priority

1. `FLOW_MNEMONIC` → LocalSigner (Flow secp256k1) + viem HDAccount (EVM)
2. `FLOW_PRIVATE_KEY` / `EVM_PRIVATE_KEY` → LocalSigner (respective chain)
3. `FLOWINDEX_TOKEN` → CloudSigner (pre-authenticated)
4. None → CloudSigner (interactive login via `wallet_login` tool)

## MCP Tools (~22 total)

### Wallet & Auth (3 tools)

| Tool | Description |
|------|-------------|
| `wallet_login` | Generate login URL for browser-based auth. Returns `{ url, status }`. Polls for completion. |
| `wallet_status` | Current wallet state: signer type, Flow address, EVM address, balances, network |
| `wallet_switch_account` | Switch active signing account (multi-account scenarios) |

### Flow Cadence Templates (4 tools)

| Tool | Description |
|------|-------------|
| `list_templates` | List available Cadence templates. Filter by category: `token`, `nft`, `evm`, `bridge`, `staking`, `hybrid_custody`, `lost_and_found` |
| `get_template` | View template details: Cadence code, parameter schema, description |
| `execute_template` | Execute a template transaction: `(template_name, args)` → sign → submit → return tx hash |
| `execute_script` | Execute a read-only Cadence script (no signing required) |

### Flow Queries (5 tools, via FlowIndex API)

| Tool | Description |
|------|-------------|
| `get_account` | Account info: balance, keys, contracts, storage |
| `get_flow_balance` | FLOW balance for an address |
| `get_ft_balance` | FT token balances (specific token or all) |
| `get_nft_collection` | NFT collection listing |
| `get_transaction` | Transaction details + status |

### EVM (8 tools, via viem)

| Tool | Description |
|------|-------------|
| `evm_get_balance` | Native token balance |
| `evm_get_token_balance` | ERC20 token balance |
| `evm_transfer` | Native token transfer |
| `evm_transfer_erc20` | ERC20 transfer |
| `evm_read_contract` | Read contract state |
| `evm_write_contract` | Write to contract (requires signing) |
| `evm_get_transaction` | EVM transaction details |
| `evm_wallet_address` | Current EOA address |

### Bridge (2 tools)

| Tool | Description |
|------|-------------|
| `bridge_token_to_evm` | Flow FT → EVM (via FlowEVMBridge template) |
| `bridge_token_from_evm` | EVM → Flow FT |

### Approval (3 tools)

| Tool | Description |
|------|-------------|
| `confirm_transaction` | Confirm a pending transaction |
| `cancel_transaction` | Cancel a pending transaction |
| `list_pending` | List all pending approval transactions |

## Approval Flow

### Matrix

| Signer | APPROVAL=true | APPROVAL=false |
|--------|--------------|----------------|
| LocalSigner (key/mnemonic) | MCP two-step confirm | Auto-sign |
| CloudSigner (custodial) | MCP two-step confirm | Auto-sign server-side |
| PasskeySigner (WebAuthn) | Browser URL required | N/A (forced true) |

### Two-step Confirmation (Local/Cloud, approval=true)

```
LLM: execute_template("transfer_tokens_v3", { to: "0x1234", amount: "10.0" })
  ↓
MCP: Build tx, DO NOT sign. Return preview:
  {
    status: "pending_approval",
    tx_id: "abc-123",
    summary: {
      template: "transfer_tokens_v3",
      description: "Transfer 10.0 FLOW to 0x1234",
      signer: "0x5678",
      estimated_fee: "0.001 FLOW"
    }
  }
  ↓
LLM: Shows user "About to transfer 10 FLOW to 0x1234. Confirm?"
  ↓
User: "yes" / "no"
  ↓
LLM: confirm_transaction("abc-123") or cancel_transaction("abc-123")
  ↓
MCP: Sign → submit → return tx hash
```

### Passkey Flow (always requires browser)

```
LLM: execute_template("transfer_tokens_v3", { ... })
  ↓
MCP: Return approval URL:
  {
    status: "pending_passkey",
    approve_url: "https://flowindex.io/agent/approve/abc-123",
    expires_in: 300
  }
  ↓
LLM: "Please open this link to approve: https://flowindex.io/agent/approve/abc-123"
  ↓
User: Opens link → WebAuthn signature → confirms
  ↓
MCP: Polls/webhook for signature → submits tx → returns result
```

### Login Flow (zero-config)

```
LLM: wallet_login()
  ↓
MCP: Start local HTTP callback server on ephemeral port
     Generate session: https://flowindex.io/agent/auth?session=xxx&callback=http://localhost:PORT
     Return { url, session_id }
  ↓
LLM: "Please log in at: https://flowindex.io/agent/auth?session=xxx"
  ↓
User: Opens URL → OAuth/Passkey login
  ↓
FlowIndex: Redirects to callback with JWT token
  ↓
MCP: Stores token → CloudSigner ready
```

## FRW Cadence Templates

### Source

Copied from [FRW-monorepo/packages/cadence](https://github.com/onflow/FRW-monorepo/tree/dev/packages/cadence). Plan to migrate to `@onflow/frw-cadence` npm dependency when published.

### Categories (~75 templates)

| Category | Templates | Type |
|----------|-----------|------|
| Base | 7 | Scripts (account info, storage, keys) |
| Token | 3 | 2 transactions (enable vault, transfer) + 1 script |
| Collection (NFT) | 4 | Transactions (send, batch send) |
| EVM | 9 | 8 transactions (COA, contract calls) + 1 script |
| Bridge | 13 | Token + NFT bridging (both directions) |
| HybridCustody | 28 | Parent/child account management |
| LostAndFound | 9 | Unclaimed asset recovery |

### Template Registry

Each template is registered with metadata:

```typescript
interface Template {
  name: string;           // e.g. "transfer_tokens_v3"
  category: string;       // e.g. "token"
  type: "transaction" | "script";
  description: string;    // Human-readable description
  cadence: string;        // Raw .cdc code
  args: ArgSchema[];      // Parameter definitions
  network: string[];      // Supported networks
}

interface ArgSchema {
  name: string;
  type: string;           // Cadence type: "Address", "UFix64", "String", etc.
  description: string;
}
```

## File Structure

```
packages/agent-wallet/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── bin/
│   └── cli.ts                       # npx entry point
├── src/
│   ├── index.ts                     # MCP stdio server entry
│   ├── server/
│   │   ├── server.ts                # MCP server init + tool registration
│   │   └── http-server.ts           # Optional HTTP/SSE transport
│   ├── tools/
│   │   ├── wallet.ts                # wallet_login, wallet_status, wallet_switch
│   │   ├── templates.ts             # list_templates, get_template, execute_template, execute_script
│   │   ├── flow-query.ts            # get_account, get_balance, get_transaction, etc.
│   │   ├── evm.ts                   # evm_* tools (via viem)
│   │   └── bridge.ts                # bridge_* tools
│   ├── signer/
│   │   ├── interface.ts             # Signer interface definition
│   │   ├── local.ts                 # wallet-core WASM (mnemonic + private key)
│   │   ├── cloud.ts                 # FlowIndex custodial API
│   │   └── passkey.ts               # WebAuthn redirect + poll
│   ├── approval/
│   │   ├── manager.ts               # Pending tx queue, confirm/cancel logic
│   │   └── passkey-poll.ts          # Passkey approval URL polling
│   ├── templates/
│   │   ├── registry.ts              # Template index (name → code + schema + description)
│   │   └── cadence/                 # FRW .cdc files by category
│   │       ├── token/
│   │       ├── collection/
│   │       ├── evm/
│   │       ├── bridge/
│   │       ├── hybrid-custody/
│   │       └── lost-and-found/
│   ├── flowindex/
│   │   └── client.ts                # FlowIndex REST API client
│   └── config/
│       ├── env.ts                   # Environment variable parsing + defaults
│       └── networks.ts              # Flow + EVM network configs
├── test/
│   └── ...
└── project.json                     # Nx project config
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol (stdio + HTTP/SSE) |
| `@trustwallet/wallet-core` | WASM signing (BIP39, key derivation, ECDSA) |
| `viem` | EVM interaction (transfers, contracts, signing) |
| `@onflow/fcl` | Flow transaction building + submission |
| `@onflow/rlp` | RLP encoding |
| `zod` | Tool parameter validation |

## Security Considerations

- Private keys and mnemonics **never leave the MCP server process**
- Keys are only loaded from environment variables, never passed as tool arguments
- Template-based execution prevents arbitrary Cadence injection
- Approval mechanism gives users control over what gets signed
- Cloud wallet JWT tokens have expiry and can be revoked
- Passkey signing requires physical user interaction (WebAuthn)

## Future Work

- Migrate FRW templates to `@onflow/frw-cadence` npm dependency
- Custom template support (user-provided .cdc with approval)
- Multi-sig support
- Hardware wallet integration (Ledger)
- Transaction simulation before signing
- Gas estimation and fee optimization

# Agent Wallet AI-Authored Cadence Plan

## Summary

`@flowindex/agent-wallet` should remain the primary user-facing MCP server for signing, approval, simulation, and submission. Freeform Cadence authoring should be treated as an advanced mode built on top of `agent-wallet`, not as the default experience.

The product goal is:

1. Keep the default install story simple: one MCP server
2. Allow advanced users to add Cadence authoring and self-correction without leaving the FlowIndex toolchain
3. Avoid making skills a hard dependency for signing or approval

## Problem

Today the wallet story is safe but template-centric:

- `agent-wallet` can sign and submit transactions
- preflight simulation can improve trust before signing
- execution is still oriented around built-in templates

This is good for safety, but it caps agent capability. An agent that can only pick templates cannot truly write or repair Cadence for novel intents.

At the same time, forcing every user to install multiple MCP servers plus project skills is a poor product experience. Most users do not need arbitrary Cadence authoring. They just need a wallet MCP that can safely execute known actions.

## Product Principle

Separate these two concerns:

- **Auto-signing** is a wallet capability
- **Freeform Cadence authoring** is a developer capability

Auto-signing should only require `agent-wallet` plus signer configuration.

Freeform Cadence authoring should layer on top through optional developer tooling:

- `cadence-mcp` for docs, checking, symbol inspection, and security scan
- optional Cadence skill for better coding-agent context
- optional Flow EVM MCP only for EVM or hybrid workflows

## Recommended Product Modes

### 1. Wallet Mode

Target user:

- most end users
- AI assistants that need to transfer, bridge, or manage assets
- teams that prefer templates and approval flows

Install surface:

- `@flowindex/agent-wallet`

Capabilities:

- login and signer management
- template execution
- preflight simulation
- approval queue
- optional autonomous signing when `APPROVAL_REQUIRED=false`

This should remain the default documented path.

### 2. Cadence Developer Mode

Target user:

- developers who want the agent to write Cadence
- contract teams building custom transactions or scripts
- power users who want self-correcting authoring

Install surface:

- `@flowindex/agent-wallet`
- `cadence-mcp`
- optional Cadence skill

Capabilities:

- docs lookup
- LSP type checking
- symbol inspection
- static security scan
- runtime simulation through FlowIndex
- signing and submission through `agent-wallet`

This should be presented as an add-on mode, not the default requirement.

### 3. Hybrid Developer Mode

Target user:

- teams working across Cadence and Flow EVM
- bridge, COA, and hybrid custody workflows

Install surface:

- `@flowindex/agent-wallet`
- `cadence-mcp`
- `flow-evm-mcp`
- optional Cadence skill

This should only be documented when the workflow truly touches Flow EVM.

## Required vs Optional Components

| Component | Required | Why |
|---|---|---|
| `agent-wallet` | Yes | Wallet authority, signing, approval, submission, simulator integration |
| `cadence-mcp` | No | Only needed when the agent must write or repair freeform Cadence |
| Cadence skill | No | Improves coding quality and context retention, but should not gate product usage |
| `flow-evm-mcp` | No | Only needed for Flow EVM and hybrid workflows |

## User Experience Recommendation

The public install story should be:

1. Start with one MCP: `agent-wallet`
2. Add `cadence-mcp` only if the user wants the agent to author custom Cadence
3. Add the Cadence skill only for coding agents such as Codex, Claude Code, or Cursor
4. Add `flow-evm-mcp` only for EVM workflows

In other words, users should never feel that "Flow wallet support" requires installing a whole bundle of tools.

## Raw Cadence Execution

To remove the template ceiling, `agent-wallet` should eventually expose raw Cadence tools in addition to template tools.

Recommended new tools:

- `simulate_cadence_transaction`
- `execute_cadence_transaction`
- `execute_cadence_script`
- optional `deploy_cadence_contract`

These tools should accept raw source plus explicit argument metadata rather than forcing the model through a pre-registered template.

### Proposed `simulate_cadence_transaction`

Input:

```json
{
  "cadence": "transaction(amount: UFix64, to: Address) { ... }",
  "arguments": [
    { "type": "UFix64", "value": "1.0" },
    { "type": "Address", "value": "0x1" }
  ],
  "authorizers": ["0x1234"],
  "payer": "0x1234",
  "scheduled": {
    "advance_seconds": 0,
    "advance_blocks": 0
  }
}
```

Behavior:

- uses FlowIndex simulator
- never signs
- returns events, balance changes, summaries, and any scheduled results

### Proposed `execute_cadence_transaction`

Input:

```json
{
  "cadence": "transaction(amount: UFix64, to: Address) { ... }",
  "arguments": [
    { "type": "UFix64", "value": "1.0" },
    { "type": "Address", "value": "0x1" }
  ],
  "preflight": {
    "simulate": true
  }
}
```

Behavior:

- may run simulation first
- may queue for approval
- signs only through the configured wallet
- returns preflight metadata alongside the execution result

### Proposed `execute_cadence_script`

Input:

```json
{
  "cadence": "access(all) fun main(address: Address): UFix64 { ... }",
  "arguments": [
    { "type": "Address", "value": "0x1" }
  ]
}
```

Behavior:

- read-only
- no signing
- useful for agents that want to build and test helper scripts dynamically

## Safety Policy

Raw Cadence should not inherit the same risk posture as templates.

Recommended policy flags:

- `ALLOW_RAW_CADENCE_SIGNING=false`
- `REQUIRE_SIMULATION_FOR_RAW_CADENCE=true`
- `REQUIRE_APPROVAL_FOR_RAW_CADENCE=true`

Recommended behavior:

- template transactions may auto-sign when approval is disabled
- raw Cadence transactions should default to approval-required
- raw Cadence auto-signing should require an explicit opt-in

This keeps the default wallet safe while still allowing power users to unlock full autonomy.

## Agent Self-Correction Loop

The desired agent loop is:

1. look up docs with `search_docs` or `get_doc`
2. inspect target contracts with `get_contract_source` or `get_contract_code` when interacting with existing contracts
3. draft Cadence
4. run `cadence_check`
5. repair diagnostics
6. run `cadence_security_scan`
7. run FlowIndex simulation
8. inspect events and balance changes
9. only then sign or queue for approval

This loop is the real mechanism behind self-correction. Skills improve the drafting quality, but the correction loop comes from tools.

## Rollout Plan

### Phase 1

- keep public docs centered on `agent-wallet`
- position `cadence-mcp` as an optional developer add-on
- keep skills optional

### Phase 2

- add raw Cadence simulation and read-only script execution to `agent-wallet`
- keep approval mandatory for raw Cadence submission

### Phase 3

- add raw Cadence transaction submission
- gate autonomous signing behind explicit env flags

### Phase 4

- consider a bundled install experience or a single Flow developer MCP if multi-server setup still feels too fragmented

## Recommendation

Do not ask every user to install a series of MCP servers and skills just to get wallet signing.

Instead:

- make `agent-wallet` the one required MCP
- treat `cadence-mcp` as the advanced authoring add-on
- treat the Cadence skill as optional quality improvement for coding agents
- keep `flow-evm-mcp` out of the default install path unless the workflow truly needs it

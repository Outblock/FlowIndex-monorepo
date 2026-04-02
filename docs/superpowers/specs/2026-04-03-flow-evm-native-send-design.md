# Flow EVM Native Send Block — Design Spec

**Date**: 2026-04-03
**Status**: Approved

## Goal

Add a new sim-workflow block that sends native EVM transactions on Flow using an EVM private key directly (not through Cadence wrapping). Supports general transactions and ERC-20 transfer shortcut.

## Decisions

- **Library**: viem (consistent with `packages/agent-wallet` EVM code)
- **Networks**: Flow EVM Mainnet (747) + Testnet (545)
- **Signing**: Manual EVM private key (hex) only
- **Modes**: General transaction + ERC-20 transfer shortcut
- **Icon**: New purple `EthIcon` (ETH diamond), `bgColor: #8B5CF6`
- **RPC**: Flow official EVM RPC (no external deps)
  - Mainnet: `https://mainnet.evm.nodes.onflow.org`
  - Testnet: `https://testnet.evm.nodes.onflow.org`

## Block UI (`flow_evm_native_send`)

| SubBlock | Type | Condition | Description |
|----------|------|-----------|-------------|
| `mode` | dropdown: `general` / `erc20` | — | Transaction mode |
| `to` | short-input | mode=general | Destination address (0x...) |
| `data` | short-input | mode=general | Calldata (hex), optional |
| `value` | short-input | mode=general | Value in FLOW (e.g. `0.1`), optional |
| `tokenAddress` | short-input | mode=erc20 | ERC-20 contract address |
| `recipient` | short-input | mode=erc20 | Recipient address |
| `amount` | short-input | mode=erc20 | Human-readable amount (e.g. `100.5`) |
| `gasLimit` | short-input | — | Gas limit, optional (auto-estimate) |
| `privateKey` | short-input | — | EVM private key (hex) |
| `network` | dropdown: `mainnet` / `testnet` | — | Network selection |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `content` | string | Human-readable transaction summary |
| `transactionHash` | string | EVM transaction hash |
| `status` | string | `success` or `reverted` |
| `gasUsed` | number | Actual gas consumed |
| `blockNumber` | number | Block number |
| `logs` | json | Parsed event logs |

## Tool Definition

- **id**: `flow_evm_native_send`
- **request**: `POST /api/tools/flow/evm-native-send`
- Params map 1:1 to block subBlocks

## API Route Flow

1. `checkInternalAuth(request)`
2. Zod schema validation
3. Select chain config by network (flowMainnet chainId 747 / flowTestnet chainId 545)
4. Create viem `walletClient` + `publicClient` from private key
5. Based on mode:
   - **general**: `sendTransaction({ to, data, value: parseEther(value), gas: gasLimit })`
   - **erc20**: Read `decimals()` via `publicClient.readContract`, then `writeContract` calling `transfer(recipient, parseUnits(amount, decimals))`
6. `waitForTransactionReceipt` for confirmation
7. Parse receipt logs (attempt `decodeEventLog` for known events like Transfer)
8. Return formatted result

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/sim/tools/flow/evm_native_send.ts` | Tool definition |
| `apps/sim/blocks/blocks/flow_evm_native_send.ts` | Block definition |
| `apps/sim/app/api/tools/flow/evm-native-send/route.ts` | API route handler |

### Modified Files

| File | Change |
|------|--------|
| `apps/sim/tools/flow/index.ts` | Export new tool |
| `apps/sim/tools/flow/types.ts` | Add `FlowEvmNativeSendParams` type |
| `apps/sim/tools/registry.ts` | Register `flow_evm_native_send` |
| `apps/sim/blocks/registry.ts` | Register `FlowEvmNativeSendBlock` |
| `apps/sim/components/icons.tsx` | Add purple `EthIcon` |
| `apps/sim/package.json` | Add `viem` dependency (if not present) |

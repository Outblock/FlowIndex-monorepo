# API Audit Test Suite — Design

## Goal

A Go integration test suite that validates ~35 production API endpoints against `flowindex.io`, cross-referencing core blockchain data with the Flow mainnet access node and checking internal consistency for derived data (tokens, transfers, holdings).

## Architecture

**Single test file group** in `backend/internal/api/` with `//go:build integration` tag, extending the existing `api_integration_test.go` pattern.

**Two validation strategies:**

1. **Ground truth tests** (blocks, transactions, accounts, events) — fetch from our API and from `access.mainnet.nodes.onflow.org:9000` via Flow SDK, compare field-by-field
2. **Consistency tests** (FT/NFT transfers, holdings, collections) — fetch related endpoints and verify internal consistency (e.g., transfer counts match, holder counts are plausible, amounts parse correctly)

## Test Bootstrap

A `TestMain` setup phase that:
- Hits `/status` to get `latest_height` and `indexed_height`
- Picks a recent sealed block (e.g., `indexed_height - 10`) as the reference block
- Fetches that block's transactions to get real tx IDs, addresses, token identifiers
- Stores these in a shared `testContext` for all tests

## Endpoint Coverage (~35 endpoints)

### Phase 1 — Core (ground truth + consistency)

| Endpoint | Validation |
|---|---|
| `GET /status` | Fields present, heights reasonable |
| `GET /flow/block/{height}` | Cross-ref: id, parent_id, timestamp, tx_count vs Flow SDK |
| `GET /flow/block/{height}/transaction` | Cross-ref: tx count matches block, tx IDs match |
| `GET /flow/block` | List returns data, pagination works |
| `GET /flow/transaction/{id}` | Cross-ref: payer, status, events, gas_used vs Flow SDK |
| `GET /flow/transaction` | List works, envelope format correct |
| `GET /flow/account/{address}` | Cross-ref: balance, keys, contracts vs Flow SDK |
| `GET /flow/account/{address}/transaction` | Returns data, tx IDs are real |
| `GET /flow/account/{address}/contract/{name}` | Code matches Flow SDK |
| `GET /flow/events/search` | Events match what Flow SDK returns for same block range |

### Phase 2 — Tokens (internal consistency)

| Endpoint | Validation |
|---|---|
| `GET /flow/ft` | List returns tokens, required fields present |
| `GET /flow/ft/{token}` | Details match list entry, decimals/symbol consistent |
| `GET /flow/ft/transfer` | Transfers have valid addresses, amounts > 0, timestamps in range |
| `GET /flow/ft/{token}/holding` | Balances > 0, addresses valid |
| `GET /flow/ft/{token}/top-account` | Sorted descending, balances plausible |
| `GET /flow/ft/stats` | Numbers non-negative |
| `GET /flow/ft/prices` | Prices present for major tokens (FLOW, USDC) |
| `GET /flow/account/{address}/ft` | Vaults returned, balances parseable |
| `GET /flow/account/{address}/ft/transfer` | Direction field correct (deposit/withdraw logic) |
| `GET /flow/nft` | List returns collections, required fields present |
| `GET /flow/nft/{nft_type}` | Details match list entry |
| `GET /flow/nft/transfer` | Transfers have valid sender/receiver, nft_id present |
| `GET /flow/nft/{nft_type}/holding` | Count > 0, addresses valid |
| `GET /flow/nft/{nft_type}/item` | Items have nft_id, owner present |
| `GET /flow/nft/{nft_type}/item/{id}` | Details match list entry |
| `GET /flow/account/{address}/nft` | Collections returned for known NFT holder |
| `GET /flow/nft/stats` | Numbers non-negative |

### Phase 2b — Contracts & EVM

| Endpoint | Validation |
|---|---|
| `GET /flow/contract` | List returns contracts, identifiers valid format |
| `GET /flow/contract/{identifier}` | Code non-empty, address matches identifier |
| `GET /flow/contract/{identifier}/version` | Versions ordered, heights ascending |
| `GET /flow/evm/transaction` | EVM txs have valid hashes (0x + 64 hex) |
| `GET /flow/evm/transaction/{hash}` | Fields present, gas values reasonable |

## Validation Helpers

- `assertEnvelope(t, resp)` — validates `{data, _meta}` shape
- `assertFlowAddress(t, addr)` — validates `0x` + 16 hex chars
- `crossRefBlock(t, apiBlock, flowBlock)` — field-by-field comparison
- `crossRefTransaction(t, apiTx, flowTx)` — field-by-field comparison
- `crossRefAccount(t, apiAcct, flowAcct)` — balance, keys, contracts comparison
- `assertValidTokenIdentifier(t, id)` — validates `A.{addr}.{name}` format
- `assertPositiveAmount(t, amount)` — parses and validates numeric string

## Running

```bash
# Full suite against production
FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -v -timeout 5m

# Specific test
FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestBlockCrossRef -v
```

## Out of Scope (future phases)

- Staking endpoints (~15 endpoints)
- DeFi endpoints (~5 endpoints)
- Analytics/insights endpoints (~10 endpoints)
- Admin endpoints (internal only)
- Wallet/auth endpoints (require auth)
- Load testing / performance
- WebSocket live updates

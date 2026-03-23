# Account Detail — Live Transaction Updates

**Date:** 2026-03-24
**Status:** Approved

## Overview

Add real-time transaction updates to the account detail page via address-scoped WebSocket subscriptions. Similar to Blockscout's live update UX — new transactions appear automatically without page refresh.

## Requirements

- Live transaction updates on the account detail activity tab
- Full address involvement detection: payer, proposer, authorizer, FT/NFT sender/receiver (including passive participation like receiving a transfer)
- Push after workers complete (TokenWorker writes `address_transactions`) for data completeness
- Hybrid UX: auto-prepend when at top, badge notification when scrolled/paginated
- Scope: account detail page only

## Architecture: Address-Scoped WebSocket Subscriptions

Extend the existing Hub + Client WebSocket infrastructure. No new connections or endpoints — reuse `/ws`.

### WebSocket Protocol

**Client → Server:**
```json
{"type": "subscribe_address", "address": "abc123"}
{"type": "unsubscribe_address", "address": "abc123"}
```

- Addresses normalized: lowercase, no `0x` prefix (matches DB convention)
- One client can subscribe to multiple addresses (max 10, to prevent abuse)
- Disconnect auto-cleans subscriptions

**Server → Client:**
```json
{
  "type": "address_transaction",
  "payload": {
    "address": "abc123",
    "transaction": {
      "id": "...",
      "block_height": 12345,
      "status": "sealed",
      "payer_address": "...",
      "proposer_address": "...",
      "timestamp": "...",
      "roles": ["FT_RECEIVER"],
      "template_category": "token_transfer",
      "template_label": "Transfer FLOW",
      "tags": ["FT_TRANSFER"],
      "transfers": [
        {"type": "ft", "token": "FLOW", "from": "xxx", "to": "abc123", "amount": "10.0"}
      ]
    }
  }
}
```

- `roles`: this address's roles in the tx (payer/proposer/authorizer/FT_SENDER/FT_RECEIVER/NFT_SENDER/NFT_RECEIVER)
- `transfers`: FT/NFT transfer summaries so the frontend doesn't need extra API calls
- Existing global `new_block` / `new_transaction` broadcasts are untouched

### Backend Hub Changes

**Client struct:**
```go
type Client struct {
    hub           *Hub
    conn          *websocket.Conn
    send          chan []byte
    subscriptions map[string]bool  // address → subscribed
    subMu         sync.Mutex
}
```

**Hub additions:**
```go
type AddressMessage struct {
    Addresses []string // involved addresses
    Data      []byte   // serialized JSON
}

// New channel on Hub
addressBroadcast chan AddressMessage
```

**Hub `run()` new case:**
- On `addressBroadcast` message: iterate clients, check if any subscription matches the message's addresses
- Send to matching clients only; one send per client even if multiple addresses match
- Skip clients with full send buffers (same as existing broadcast behavior)

**Client read loop:**
- Currently discards all incoming messages
- Change to: parse JSON, handle `subscribe_address` / `unsubscribe_address`
- Normalize address (lowercase, strip `0x`)
- Enforce max 10 subscriptions per client

### Two-Phase Broadcast Triggers

**Phase 1 — Ingester (immediate):**
After `SaveBlockData` writes `address_transactions` with payer/proposer/authorizer roles:
- Collect involved addresses from the saved records
- Quick-check if any Hub client subscribes to these addresses (`HasSubscribers`)
- If yes: build `address_transaction` payload with basic tx info + roles
- Broadcast via `hub.addressBroadcast`

**Phase 2 — TokenWorker (few seconds delay):**
After `ProcessRange` writes FT/NFT transfer `address_transactions`:
- Collect involved addresses (FT_SENDER/FT_RECEIVER/NFT_SENDER/NFT_RECEIVER)
- Quick-check `HasSubscribers`
- If yes: build enriched payload with transfer summaries (token name, amount, from/to)
- Broadcast via `hub.addressBroadcast`

Frontend receives up to two pushes per tx — deduplicates by txID, second push merges roles and transfers.

### HasSubscribers Check

Before doing any DB queries for broadcast payload construction:
```go
func (h *Hub) HasSubscribers(addresses []string) bool {
    h.mutex.Lock()
    defer h.mutex.Unlock()
    for client := range h.clients {
        client.subMu.Lock()
        for _, addr := range addresses {
            if client.subscriptions[addr] {
                client.subMu.Unlock()
                return true
            }
        }
        client.subMu.Unlock()
    }
    return false
}
```

This avoids unnecessary DB queries when no one is listening.

## Frontend Changes

### WebSocketProvider

Add methods to the existing provider:
- `subscribeAddress(address: string)` — sends subscribe message to server
- `unsubscribeAddress(address: string)` — sends unsubscribe message
- On reconnect: automatically re-send all active subscriptions

### New Hook: `useAddressTransactions(address: string)`

```typescript
function useAddressTransactions(address: string) {
  // subscribe on mount, unsubscribe on unmount
  // listen for 'address_transaction' messages matching this address
  // maintain newTransactions[] buffer
  // deduplicate by txID (second push merges roles/transfers)
  // return { newTransactions, clearBuffer }
}
```

### AccountActivityTab Changes

**Auto-prepend mode** (user at top):
- Pagination: `currentPage === 1`
- Timeline: IntersectionObserver detects list top is visible
- New txs prepend to list with green highlight (3s, same as blocks/txs pages)

**Badge mode** (user scrolled/paginated away):
- Sticky badge at top of activity tab content area
- Shows count: "5 new transactions"
- Click → scroll to top + prepend all buffered txs + clear buffer

## Edge Cases

**Deduplication:**
- Frontend `Map<txID, transaction>` buffer; second-phase push updates existing entry
- Before prepending, check if txID already exists in the displayed list

**Connection recovery:**
- Auto re-subscribe on reconnect
- No gap filling — missed txs appear on next page refresh
- Consistent with existing blocks/txs page behavior

**Performance:**
- Hub traversal is O(clients x addresses_per_msg) — fine for normal load (hundreds of clients, 2-5 addresses per tx)
- `HasSubscribers` check prevents unnecessary DB queries
- TokenWorker already processes in batches; broadcast piggybacks on existing batch

**Security:**
- Subscribing to any address is allowed (addresses are public, same as Blockscout)
- Max 10 subscriptions per client
- Subscribe message size bounded by existing WebSocket read buffer (1024 bytes)

## Files to Modify

### Backend
- `internal/api/websocket.go` — Client subscriptions, Hub addressBroadcast, read loop parsing, HasSubscribers
- `internal/ingester/token_worker.go` — Phase 2 broadcast after UpsertAddressTransactions
- `internal/ingester/worker.go` or `internal/repository/postgres.go` — Phase 1 broadcast after SaveBlockData address_transactions
- `internal/api/server.go` — Pass repo to broadcast functions if needed

### Frontend
- `app/contexts/WebSocketContext.tsx` — Add subscribe/unsubscribe to context type
- `app/components/WebSocketProvider.tsx` — Implement subscribe/unsubscribe methods, reconnect re-subscribe
- `app/hooks/useAddressTransactions.ts` — New hook (subscribe, deduplicate, buffer)
- `app/components/account/AccountActivityTab.tsx` — Integrate hook, auto-prepend vs badge logic
- `app/components/account/NewTransactionsBadge.tsx` — New component for sticky badge

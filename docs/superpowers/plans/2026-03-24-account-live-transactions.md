# Account Live Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time transaction updates to the account detail page via address-scoped WebSocket subscriptions, so users see new transactions (including passive receipts) without refreshing.

**Architecture:** Extend the existing Hub+Client WebSocket infrastructure with address subscription channels. MetaWorker (Phase 1) and TokenWorker (Phase 2) broadcast to subscribed clients after writing `address_transactions`. Frontend uses a new `useAddressTransactions` hook with hybrid UX (auto-prepend at top, badge when scrolled).

**Tech Stack:** Go (Gorilla WebSocket), React 19, TypeScript, TanStack Router

**Spec:** `docs/superpowers/specs/2026-03-24-account-live-transactions-design.md`

---

## File Structure

### Backend (modify)
- `backend/internal/api/websocket.go` — Hub + Client subscription logic, address broadcast, HasSubscribers
- `backend/internal/ingester/meta_worker.go` — Phase 1 broadcast trigger (payer/proposer/authorizer)
- `backend/internal/ingester/token_worker.go` — Phase 2 broadcast trigger (FT/NFT sender/receiver with transfer summaries)

### Frontend (modify)
- `frontend/app/contexts/WebSocketContext.tsx` — Add subscribeAddress/unsubscribeAddress to context type
- `frontend/app/components/WebSocketProvider.tsx` — Implement subscribe/unsubscribe methods, reconnect re-subscribe
- `frontend/app/components/account/AccountActivityTab.tsx` — Integrate live updates with hybrid UX

### Frontend (create)
- `frontend/app/hooks/useAddressTransactions.ts` — New hook for address-scoped WS subscription + dedup buffer
- `frontend/app/components/account/NewTransactionsBadge.tsx` — Sticky badge for "N new transactions"

---

## Task 1: Backend — Hub + Client Address Subscriptions

**Files:**
- Modify: `backend/internal/api/websocket.go`

- [ ] **Step 1: Add subscription fields to Client and AddressMessage to Hub**

In `websocket.go`, update the `Client` struct and `Hub` struct:

```go
type Client struct {
	hub           *Hub
	conn          *websocket.Conn
	send          chan []byte
	subscriptions map[string]bool // address -> subscribed
	subMu         sync.Mutex
}

type AddressMessage struct {
	Addresses []string // all involved addresses for this message
	Data      []byte   // pre-serialized JSON
}

type Hub struct {
	clients          map[*Client]bool
	broadcast        chan []byte
	addressBroadcast chan AddressMessage
	register         chan *Client
	unregister       chan *Client
	mutex            sync.Mutex
}
```

Update the `hub` var initialization to include `addressBroadcast: make(chan AddressMessage, 64)`.

Update `handleWebSocket` to initialize `subscriptions: make(map[string]bool)` on the new Client.

- [ ] **Step 2: Add addressBroadcast case to Hub.run()**

Add a new `case` in the Hub `run()` select loop:

```go
case msg := <-h.addressBroadcast:
	h.mutex.Lock()
	for client := range h.clients {
		client.subMu.Lock()
		matched := false
		for _, addr := range msg.Addresses {
			if client.subscriptions[addr] {
				matched = true
				break
			}
		}
		client.subMu.Unlock()
		if matched {
			select {
			case client.send <- msg.Data:
			default:
				close(client.send)
				delete(h.clients, client)
			}
		}
	}
	h.mutex.Unlock()
```

- [ ] **Step 3: Parse client messages for subscribe/unsubscribe**

Replace the read loop in `handleWebSocket` (currently discards all messages):

```go
// Old:
// for {
// 	_, _, err := conn.ReadMessage()
// 	if err != nil {
// 		break
// 	}
// }

// New:
for {
	_, raw, err := conn.ReadMessage()
	if err != nil {
		break
	}
	var msg struct {
		Type    string `json:"type"`
		Address string `json:"address"`
	}
	if json.Unmarshal(raw, &msg) != nil {
		continue
	}
	addr := normalizeWSAddress(msg.Address)
	if addr == "" {
		continue
	}
	client.subMu.Lock()
	switch msg.Type {
	case "subscribe_address":
		if len(client.subscriptions) < 10 {
			client.subscriptions[addr] = true
		}
	case "unsubscribe_address":
		delete(client.subscriptions, addr)
	}
	client.subMu.Unlock()
}
```

Add the normalize helper:

```go
// normalizeWSAddress lowercases and strips 0x prefix to match DB convention.
func normalizeWSAddress(addr string) string {
	addr = strings.TrimSpace(strings.ToLower(addr))
	addr = strings.TrimPrefix(addr, "0x")
	return addr
}
```

- [ ] **Step 4: Add HasSubscribers helper**

```go
// HasSubscribers returns true if any connected client is subscribed to at least
// one of the given addresses. Call this before doing DB work for broadcast payloads.
func HasSubscribers(addresses []string) bool {
	hub.mutex.Lock()
	defer hub.mutex.Unlock()
	for client := range hub.clients {
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

- [ ] **Step 5: Add WSAddressTransaction type and BroadcastAddressTransaction function**

```go
// WSAddressTransfer is an individual token transfer within a transaction.
type WSAddressTransfer struct {
	Type   string `json:"type"`   // "ft" or "nft"
	Token  string `json:"token"`  // contract identifier
	From   string `json:"from"`
	To     string `json:"to"`
	Amount string `json:"amount,omitempty"` // FT only
	NFTId  string `json:"nft_id,omitempty"` // NFT only
}

// WSAddressTransaction is the payload for address-scoped tx notifications.
type WSAddressTransaction struct {
	Address     string              `json:"address"`
	Transaction WSTransaction       `json:"transaction"`
	Roles       []string            `json:"roles"`
	Transfers   []WSAddressTransfer `json:"transfers,omitempty"`
}

// BroadcastAddressTransaction sends a transaction notification to all clients
// subscribed to any of the given addresses.
func BroadcastAddressTransaction(addresses []string, tx WSTransaction, rolesByAddr map[string][]string, transfers []WSAddressTransfer) {
	// Build per-address payloads. Each subscribed address gets its own roles.
	// Group addresses that share the same roles+transfers to minimize serialization.
	for _, addr := range addresses {
		payload := WSAddressTransaction{
			Address:     addr,
			Transaction: tx,
			Roles:       rolesByAddr[addr],
			Transfers:   transfers,
		}
		msg := BroadcastMessage{Type: "address_transaction", Payload: payload}
		data, err := json.Marshal(msg)
		if err != nil {
			continue
		}
		hub.addressBroadcast <- AddressMessage{
			Addresses: []string{addr},
			Data:      data,
		}
	}
}
```

- [ ] **Step 6: Verify it compiles**

```bash
cd backend && go build ./...
```

- [ ] **Step 7: Commit**

```bash
git add backend/internal/api/websocket.go
git commit -m "feat(ws): add address-scoped WebSocket subscriptions

Hub tracks per-client address subscriptions. Clients send
subscribe_address/unsubscribe_address messages. New addressBroadcast
channel delivers messages only to matching subscribers."
```

---

## Task 2: Backend — Phase 1 Broadcast (MetaWorker)

**Files:**
- Modify: `backend/internal/ingester/meta_worker.go`
- Modify: `backend/internal/api/websocket.go` (add helper)

The MetaWorker calls `BackfillAddressTransactionsAndStatsRange` which writes payer/proposer/authorizer roles. After this completes, broadcast to subscribers.

- [ ] **Step 1: Add BuildPhase1Broadcast helper to websocket.go**

This function takes transactions from a height range and broadcasts basic tx info with payer/proposer/authorizer roles:

```go
// BroadcastPhase1Transactions broadcasts basic tx info (payer/proposer/authorizer)
// to address-subscribed clients. Called by MetaWorker after writing address_transactions.
func BroadcastPhase1Transactions(txs []models.Transaction) {
	if len(txs) == 0 {
		return
	}

	// Collect all involved addresses
	addrSet := make(map[string]bool)
	for _, tx := range txs {
		if tx.PayerAddress != "" {
			addrSet[strings.ToLower(tx.PayerAddress)] = true
		}
		if tx.ProposerAddress != "" {
			addrSet[strings.ToLower(tx.ProposerAddress)] = true
		}
		for _, auth := range tx.Authorizers {
			if auth != "" {
				addrSet[strings.ToLower(auth)] = true
			}
		}
	}
	allAddrs := make([]string, 0, len(addrSet))
	for a := range addrSet {
		allAddrs = append(allAddrs, a)
	}
	if !HasSubscribers(allAddrs) {
		return
	}

	for _, tx := range txs {
		ts := tx.Timestamp
		if ts.IsZero() {
			ts = tx.CreatedAt
		}
		wsTx := WSTransaction{
			ID:              tx.ID,
			BlockHeight:     tx.BlockHeight,
			Status:          tx.Status,
			PayerAddress:    tx.PayerAddress,
			ProposerAddress: tx.ProposerAddress,
			Timestamp:       ts,
			ExecutionStatus: tx.ExecutionStatus,
			ErrorMessage:    tx.ErrorMessage,
			IsEVM:           tx.IsEVM,
			ScriptHash:      tx.ScriptHash,
		}

		// Build roles per address for this tx
		rolesByAddr := make(map[string][]string)
		payer := strings.ToLower(tx.PayerAddress)
		proposer := strings.ToLower(tx.ProposerAddress)
		if payer != "" {
			rolesByAddr[payer] = append(rolesByAddr[payer], "PAYER")
		}
		if proposer != "" {
			rolesByAddr[proposer] = append(rolesByAddr[proposer], "PROPOSER")
		}
		for _, auth := range tx.Authorizers {
			a := strings.ToLower(auth)
			if a != "" {
				rolesByAddr[a] = append(rolesByAddr[a], "AUTHORIZER")
			}
		}

		addrs := make([]string, 0, len(rolesByAddr))
		for a := range rolesByAddr {
			addrs = append(addrs, a)
		}
		BroadcastAddressTransaction(addrs, wsTx, rolesByAddr, nil)
	}
}
```

- [ ] **Step 2: Add Phase 1 trigger to MetaWorker**

In `meta_worker.go`, after the `BackfillAddressTransactionsAndStatsRange` call, fetch the raw transactions for the range and broadcast:

```go
// After: w.repo.BackfillAddressTransactionsAndStatsRange(ctx, fromHeight, toHeight)

// Phase 1 WS broadcast: notify address subscribers about payer/proposer/authorizer roles
txs, err := w.repo.GetRawTransactionsInRange(ctx, fromHeight, toHeight)
if err != nil {
	log.Printf("[meta_worker] failed to fetch txs for WS broadcast: %v", err)
} else {
	api.BroadcastPhase1Transactions(txs)
}
```

This requires importing `"flowscan-clone/internal/api"` in meta_worker.go.

- [ ] **Step 3: Ensure GetRawTransactionsInRange exists in repository**

Check if `GetRawTransactionsInRange` already exists. If not, add it to `backend/internal/repository/postgres_ingest.go` or appropriate query file:

```go
// GetRawTransactionsInRange returns raw transactions for a block height range [from, to).
func (r *Repository) GetRawTransactionsInRange(ctx context.Context, fromHeight, toHeight uint64) ([]models.Transaction, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, block_height, proposer_address, payer_address, authorizers,
		       status, execution_status, error_message, is_evm, script_hash,
		       timestamp, created_at
		FROM raw.transactions
		WHERE block_height >= $1 AND block_height < $2
		ORDER BY block_height, transaction_index
	`, fromHeight, toHeight)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []models.Transaction
	for rows.Next() {
		var tx models.Transaction
		if err := rows.Scan(
			&tx.ID, &tx.BlockHeight, &tx.ProposerAddress, &tx.PayerAddress, &tx.Authorizers,
			&tx.Status, &tx.ExecutionStatus, &tx.ErrorMessage, &tx.IsEVM, &tx.ScriptHash,
			&tx.Timestamp, &tx.CreatedAt,
		); err != nil {
			return nil, err
		}
		txs = append(txs, tx)
	}
	return txs, rows.Err()
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add backend/internal/api/websocket.go backend/internal/ingester/meta_worker.go backend/internal/repository/
git commit -m "feat(ws): Phase 1 broadcast — payer/proposer/authorizer

MetaWorker broadcasts address_transaction to WebSocket subscribers
immediately after writing address_transactions with basic roles."
```

---

## Task 3: Backend — Phase 2 Broadcast (TokenWorker)

**Files:**
- Modify: `backend/internal/ingester/token_worker.go`
- Modify: `backend/internal/api/websocket.go` (add Phase 2 helper)

- [ ] **Step 1: Add BroadcastPhase2Transactions to websocket.go**

```go
// BroadcastPhase2Transactions broadcasts enriched transfer info to address-subscribed
// clients. Called by TokenWorker after writing FT/NFT address_transactions.
func BroadcastPhase2Transactions(addrTxs []models.AddressTransaction, ftTransfers []models.TokenTransfer, nftTransfers []models.TokenTransfer, txMap map[string]models.Transaction) {
	if len(addrTxs) == 0 {
		return
	}

	// Collect all addresses from transfer roles
	addrSet := make(map[string]bool)
	for _, at := range addrTxs {
		addrSet[strings.ToLower(at.Address)] = true
	}
	allAddrs := make([]string, 0, len(addrSet))
	for a := range addrSet {
		allAddrs = append(allAddrs, a)
	}
	if !HasSubscribers(allAddrs) {
		return
	}

	// Group roles and transfers by txID
	type txInfo struct {
		rolesByAddr map[string][]string
		transfers   []WSAddressTransfer
		addrs       map[string]bool
	}
	byTx := make(map[string]*txInfo)

	for _, at := range addrTxs {
		addr := strings.ToLower(at.Address)
		ti, ok := byTx[at.TransactionID]
		if !ok {
			ti = &txInfo{
				rolesByAddr: make(map[string][]string),
				addrs:       make(map[string]bool),
			}
			byTx[at.TransactionID] = ti
		}
		ti.rolesByAddr[addr] = append(ti.rolesByAddr[addr], at.Role)
		ti.addrs[addr] = true
	}

	// Build transfer summaries
	for _, ft := range ftTransfers {
		ti, ok := byTx[ft.TransactionID]
		if !ok {
			continue
		}
		ti.transfers = append(ti.transfers, WSAddressTransfer{
			Type:   "ft",
			Token:  ft.ContractName,
			From:   ft.FromAddress,
			To:     ft.ToAddress,
			Amount: ft.Amount,
		})
	}
	for _, nt := range nftTransfers {
		ti, ok := byTx[nt.TransactionID]
		if !ok {
			continue
		}
		ti.transfers = append(ti.transfers, WSAddressTransfer{
			Type:  "nft",
			Token: nt.ContractName,
			From:  nt.FromAddress,
			To:    nt.ToAddress,
			NFTId: nt.TokenID,
		})
	}

	// Broadcast per tx
	for txID, ti := range byTx {
		tx, ok := txMap[txID]
		if !ok {
			continue
		}
		ts := tx.Timestamp
		if ts.IsZero() {
			ts = tx.CreatedAt
		}
		wsTx := WSTransaction{
			ID:              tx.ID,
			BlockHeight:     tx.BlockHeight,
			Status:          tx.Status,
			PayerAddress:    tx.PayerAddress,
			ProposerAddress: tx.ProposerAddress,
			Timestamp:       ts,
			ExecutionStatus: tx.ExecutionStatus,
			ErrorMessage:    tx.ErrorMessage,
			IsEVM:           tx.IsEVM,
			ScriptHash:      tx.ScriptHash,
		}
		addrs := make([]string, 0, len(ti.addrs))
		for a := range ti.addrs {
			addrs = append(addrs, a)
		}
		BroadcastAddressTransaction(addrs, wsTx, ti.rolesByAddr, ti.transfers)
	}
}
```

- [ ] **Step 2: Add Phase 2 trigger to TokenWorker**

In `token_worker.go`, after the existing `UpsertAddressTransactions(ctx, addrTxs)` block (around line 658-662), add:

```go
// Phase 2 WS broadcast: notify address subscribers about FT/NFT transfer roles
if len(addrTxs) > 0 {
	// Build txID -> Transaction map from the events we already have
	txIDs := make(map[string]bool)
	for _, at := range addrTxs {
		txIDs[at.TransactionID] = true
	}
	txMap := make(map[string]models.Transaction)
	// Fetch minimal tx info for broadcast
	ids := make([]string, 0, len(txIDs))
	for id := range txIDs {
		ids = append(ids, id)
	}
	if rawTxs, err := w.repo.GetTransactionsByIDs(ctx, ids); err == nil {
		for _, tx := range rawTxs {
			txMap[tx.ID] = tx
		}
	}
	api.BroadcastPhase2Transactions(addrTxs, ftTransfers, nftTransfers, txMap)
}
```

This requires importing `"flowscan-clone/internal/api"` in token_worker.go.

- [ ] **Step 3: Add GetTransactionsByIDs if it doesn't exist**

Check and add to repository if needed:

```go
// GetTransactionsByIDs fetches raw transactions by their IDs.
func (r *Repository) GetTransactionsByIDs(ctx context.Context, ids []string) ([]models.Transaction, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, block_height, proposer_address, payer_address, authorizers,
		       status, execution_status, error_message, is_evm, script_hash,
		       timestamp, created_at
		FROM raw.transactions
		WHERE id = ANY($1)
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []models.Transaction
	for rows.Next() {
		var tx models.Transaction
		if err := rows.Scan(
			&tx.ID, &tx.BlockHeight, &tx.ProposerAddress, &tx.PayerAddress, &tx.Authorizers,
			&tx.Status, &tx.ExecutionStatus, &tx.ErrorMessage, &tx.IsEVM, &tx.ScriptHash,
			&tx.Timestamp, &tx.CreatedAt,
		); err != nil {
			return nil, err
		}
		txs = append(txs, tx)
	}
	return txs, rows.Err()
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add backend/internal/api/websocket.go backend/internal/ingester/token_worker.go backend/internal/repository/
git commit -m "feat(ws): Phase 2 broadcast — FT/NFT transfer roles

TokenWorker broadcasts enriched address_transaction with transfer
summaries after writing FT/NFT sender/receiver address_transactions."
```

---

## Task 4: Frontend — WebSocket Provider Address Subscriptions

**Files:**
- Modify: `frontend/app/contexts/WebSocketContext.tsx`
- Modify: `frontend/app/components/WebSocketProvider.tsx`

- [ ] **Step 1: Extend WebSocket context types**

In `WebSocketContext.tsx`, add `subscribeAddress` and `unsubscribeAddress` to the context:

```typescript
export const WSMessageContext = createContext({
    subscribe: (_listener: (data: any) => void) => () => { },
    subscribeAddress: (_address: string) => { },
    unsubscribeAddress: (_address: string) => { },
});
```

- [ ] **Step 2: Implement address subscription in WebSocketProvider**

In `WebSocketProvider.tsx`:

1. Add a `subscribedAddressesRef = useRef(new Set<string>())` to track active subscriptions.

2. Add `subscribeAddress` function that:
   - Normalizes address (lowercase, strip `0x`)
   - Adds to `subscribedAddressesRef.current`
   - Sends `{"type": "subscribe_address", "address": "..."}` via `wsRef.current.send()`

3. Add `unsubscribeAddress` function that:
   - Removes from `subscribedAddressesRef.current`
   - Sends `{"type": "unsubscribe_address", "address": "..."}` via `wsRef.current.send()`

4. In `ws.onopen`, after `setIsConnected(true)`, re-subscribe all addresses:
   ```typescript
   subscribedAddressesRef.current.forEach(addr => {
       ws.send(JSON.stringify({ type: 'subscribe_address', address: addr }));
   });
   ```

5. Update `messageValue` to include the new functions.

- [ ] **Step 3: Verify frontend compiles**

```bash
cd frontend && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/contexts/WebSocketContext.tsx frontend/app/components/WebSocketProvider.tsx
git commit -m "feat(ws): add address subscription methods to WebSocket provider

subscribeAddress/unsubscribeAddress send messages to backend hub.
Auto re-subscribes on reconnect."
```

---

## Task 5: Frontend — useAddressTransactions Hook

**Files:**
- Create: `frontend/app/hooks/useAddressTransactions.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useContext, useEffect, useRef, useCallback, useState } from 'react';
import { WSMessageContext } from '../contexts/WebSocketContext';

export interface AddressTransaction {
    id: string;
    block_height: number;
    status: string;
    payer_address?: string;
    proposer_address?: string;
    timestamp: string;
    execution_status?: string;
    error_message?: string;
    is_evm?: boolean;
    script_hash?: string;
    template_category?: string;
    template_label?: string;
    tags?: string[];
    roles: string[];
    transfers?: Array<{
        type: 'ft' | 'nft';
        token: string;
        from: string;
        to: string;
        amount?: string;
        nft_id?: string;
    }>;
}

/**
 * Subscribes to live transaction updates for a specific address.
 * Handles deduplication (Phase 1 + Phase 2 merging) and buffering.
 */
export function useAddressTransactions(address: string) {
    const { subscribe, subscribeAddress, unsubscribeAddress } = useContext(WSMessageContext);
    const [buffer, setBuffer] = useState<Map<string, AddressTransaction>>(new Map());
    const bufferRef = useRef(buffer);
    bufferRef.current = buffer;

    // Normalize address
    const normalizedAddr = address.toLowerCase().replace(/^0x/, '');

    // Subscribe to address on mount
    useEffect(() => {
        subscribeAddress(normalizedAddr);
        return () => unsubscribeAddress(normalizedAddr);
    }, [normalizedAddr, subscribeAddress, unsubscribeAddress]);

    // Listen for address_transaction messages
    useEffect(() => {
        return subscribe((msg: any) => {
            if (msg.type !== 'address_transaction') return;
            const payload = msg.payload;
            if (payload.address !== normalizedAddr) return;

            const tx = payload.transaction;
            const id = tx.id;

            setBuffer(prev => {
                const next = new Map(prev);
                const existing = next.get(id);
                if (existing) {
                    // Merge: combine roles (dedup) and update transfers
                    const mergedRoles = Array.from(new Set([...existing.roles, ...payload.roles]));
                    next.set(id, {
                        ...existing,
                        ...tx,
                        roles: mergedRoles,
                        transfers: payload.transfers?.length ? payload.transfers : existing.transfers,
                    });
                } else {
                    next.set(id, {
                        ...tx,
                        roles: payload.roles || [],
                        transfers: payload.transfers || [],
                    });
                }
                return next;
            });
        });
    }, [subscribe, normalizedAddr]);

    const newTransactions = Array.from(buffer.values());

    const clearBuffer = useCallback(() => {
        setBuffer(new Map());
    }, []);

    return { newTransactions, clearBuffer, bufferSize: buffer.size };
}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && bun run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/hooks/useAddressTransactions.ts
git commit -m "feat: add useAddressTransactions hook

Subscribes to address-scoped WebSocket updates, deduplicates
Phase 1 + Phase 2 pushes, and maintains a buffered transaction list."
```

---

## Task 6: Frontend — NewTransactionsBadge Component

**Files:**
- Create: `frontend/app/components/account/NewTransactionsBadge.tsx`

- [ ] **Step 1: Create the badge component**

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

interface Props {
    count: number;
    onClick: () => void;
}

export function NewTransactionsBadge({ count, onClick }: Props) {
    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.button
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={onClick}
                    className="sticky top-0 z-10 w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm font-medium cursor-pointer transition-colors"
                >
                    <ArrowUp className="w-3.5 h-3.5" />
                    {count} new transaction{count !== 1 ? 's' : ''}
                </motion.button>
            )}
        </AnimatePresence>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/components/account/NewTransactionsBadge.tsx
git commit -m "feat: add NewTransactionsBadge component

Sticky banner showing count of buffered live transactions,
with click-to-load interaction."
```

---

## Task 7: Frontend — Integrate Live Updates into AccountActivityTab

**Files:**
- Modify: `frontend/app/components/account/AccountActivityTab.tsx`

This is the largest frontend task. It integrates `useAddressTransactions` with the existing pagination/timeline logic.

- [ ] **Step 1: Add imports and hook call**

At the top of `AccountActivityTab.tsx`, add:

```typescript
import { useAddressTransactions } from '../../hooks/useAddressTransactions';
import { NewTransactionsBadge } from './NewTransactionsBadge';
```

Inside the `AccountActivityTab` component, after the existing state declarations, add:

```typescript
const { newTransactions, clearBuffer, bufferSize } = useAddressTransactions(address);
const [newTxIds, setNewTxIds] = useState<Set<string>>(new Set());
const listTopRef = useRef<HTMLDivElement | null>(null);
const [isAtTop, setIsAtTop] = useState(true);
```

- [ ] **Step 2: Add IntersectionObserver for list top detection**

```typescript
// Detect if user is viewing the top of the list
useEffect(() => {
    const el = listTopRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
        ([entry]) => setIsAtTop(entry.isIntersecting),
        { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
}, []);
```

- [ ] **Step 3: Add auto-prepend / badge logic**

```typescript
// Auto-prepend when at top and on first page, otherwise buffer for badge
useEffect(() => {
    if (newTransactions.length === 0) return;
    if (filterMode !== 'all') return; // Only live update the 'all' tab

    const shouldAutoPrepend =
        (viewMode === 'pages' && currentPage === 1 && isAtTop) ||
        (viewMode === 'timeline' && isAtTop);

    if (shouldAutoPrepend) {
        const mapped = newTransactions.map(tx => ({
            ...tx,
            payer: tx.payer_address || tx.proposer_address,
            proposer: tx.proposer_address,
            blockHeight: tx.block_height,
        }));

        if (viewMode === 'pages') {
            setTransactions(prev => dedup([...mapped, ...prev]));
        } else {
            setTimelineTxs(prev => dedup([...mapped, ...prev]));
            setTimelineOffset(prev => prev + mapped.length);
        }

        // Highlight new txs
        const ids = mapped.map(t => t.id);
        setNewTxIds(prev => new Set([...prev, ...ids]));
        setTimeout(() => {
            setNewTxIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
        }, 3000);

        clearBuffer();
    }
    // When not at top, newTransactions stay in buffer → badge shows count
}, [newTransactions, isAtTop, currentPage, viewMode, filterMode]);
```

- [ ] **Step 4: Add badge click handler**

```typescript
const handleBadgeClick = useCallback(() => {
    const mapped = newTransactions.map(tx => ({
        ...tx,
        payer: tx.payer_address || tx.proposer_address,
        proposer: tx.proposer_address,
        blockHeight: tx.block_height,
    }));

    if (viewMode === 'pages') {
        setCurrentPage(1);
        setTransactions(prev => dedup([...mapped, ...prev]));
    } else {
        setTimelineTxs(prev => dedup([...mapped, ...prev]));
        setTimelineOffset(prev => prev + mapped.length);
    }

    const ids = mapped.map(t => t.id);
    setNewTxIds(prev => new Set([...prev, ...ids]));
    setTimeout(() => {
        setNewTxIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
        });
    }, 3000);

    clearBuffer();
    listTopRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [newTransactions, viewMode, clearBuffer]);
```

- [ ] **Step 5: Add badge and highlight to render**

In the JSX for the 'all' activity tab, before the transaction list, add:

```tsx
<div ref={listTopRef} />
{!isAtTop && filterMode === 'all' && (
    <NewTransactionsBadge count={bufferSize} onClick={handleBadgeClick} />
)}
```

For each transaction row in both pagination and timeline rendering, add the green highlight class:

```tsx
className={`... ${newTxIds.has(tx.id) ? 'bg-emerald-500/10 transition-colors duration-500' : ''}`}
```

- [ ] **Step 6: Verify frontend compiles and lint passes**

```bash
cd frontend && bun run build && bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/components/account/AccountActivityTab.tsx
git commit -m "feat: integrate live transaction updates in account activity tab

Auto-prepends new transactions when at top of list, shows sticky
badge with count when scrolled away. Green highlight for 3 seconds
on new entries. Supports both pagination and timeline modes."
```

---

## Task 8: End-to-End Testing

- [ ] **Step 1: Start local services**

```bash
docker compose up -d --build
```

- [ ] **Step 2: Test WebSocket subscription**

Open browser devtools on an account page. Check the WebSocket connection in the Network tab:
1. Verify `subscribe_address` message is sent on page load
2. Verify `unsubscribe_address` is sent when navigating away
3. Verify re-subscribe happens after WebSocket reconnection

- [ ] **Step 3: Test live updates**

Send a transaction to/from the viewed account:
1. Verify Phase 1 notification appears (payer/proposer/authorizer roles)
2. Verify Phase 2 notification arrives and merges (adds transfer details)
3. Verify green highlight appears for 3 seconds

- [ ] **Step 4: Test badge behavior**

1. Scroll down on the account activity tab
2. Send a transaction to the account
3. Verify badge appears with count
4. Click badge → verify scroll to top + transactions prepended

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address any issues found during e2e testing"
```

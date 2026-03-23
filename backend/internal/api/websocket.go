package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"flowscan-clone/internal/broadcast"
	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"

	"github.com/gorilla/websocket"
)

// liveStats holds approximate counters that are periodically refreshed from
// the status cache and included in every new_block WS message so the frontend
// can render stats without polling /status.
var liveStats struct {
	totalTransactions atomic.Int64
	totalAddresses    atomic.Int64
	totalContracts    atomic.Int64
}

// UpdateLiveStats is called by buildStatusPayload to keep the atomic counters
// in sync with the latest DB estimates.
func UpdateLiveStats(totalTxs, totalAddrs, totalContracts int64) {
	liveStats.totalTransactions.Store(totalTxs)
	liveStats.totalAddresses.Store(totalAddrs)
	liveStats.totalContracts.Store(totalContracts)
}

// --- WebSocket Hub ---

type AddressMessage struct {
	Addresses []string
	Data      []byte
}

type Hub struct {
	clients          map[*Client]bool
	broadcast        chan []byte
	addressBroadcast chan AddressMessage
	register         chan *Client
	unregister       chan *Client
	mutex            sync.Mutex
}

type Client struct {
	hub           *Hub
	conn          *websocket.Conn
	send          chan []byte
	subscriptions map[string]bool
	subMu         sync.Mutex
}

var hub = &Hub{
	broadcast:        make(chan []byte),
	addressBroadcast: make(chan AddressMessage, 64),
	register:         make(chan *Client),
	unregister:       make(chan *Client),
	clients:          make(map[*Client]bool),
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mutex.Unlock()
		case message := <-h.broadcast:
			h.mutex.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mutex.Unlock()
		case amsg := <-h.addressBroadcast:
			h.mutex.Lock()
			for client := range h.clients {
				client.subMu.Lock()
				matched := false
				for _, addr := range amsg.Addresses {
					if client.subscriptions[addr] {
						matched = true
						break
					}
				}
				client.subMu.Unlock()
				if matched {
					select {
					case client.send <- amsg.Data:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
			h.mutex.Unlock()
		}
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}

	hub.register <- client

	go func() {
		defer func() {
			hub.unregister <- client
			conn.Close()
		}()
		for {
			message, ok := <-client.send
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			w.Close()
		}
	}()

	client.readPump()
}

// wsClientMessage is the JSON structure sent by WebSocket clients.
type wsClientMessage struct {
	Type    string `json:"type"`
	Address string `json:"address"`
}

// readPump reads and processes incoming WebSocket messages from a client.
func (c *Client) readPump() {
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var msg wsClientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		addr := normalizeWSAddress(msg.Address)
		if addr == "" {
			continue
		}
		switch msg.Type {
		case "subscribe_address":
			c.subMu.Lock()
			if len(c.subscriptions) < 10 {
				c.subscriptions[addr] = true
			}
			c.subMu.Unlock()
		case "unsubscribe_address":
			c.subMu.Lock()
			delete(c.subscriptions, addr)
			c.subMu.Unlock()
		}
	}
}

// normalizeWSAddress lowercases and strips 0x prefix from an address.
func normalizeWSAddress(addr string) string {
	addr = strings.TrimSpace(strings.ToLower(addr))
	addr = strings.TrimPrefix(addr, "0x")
	return addr
}

type BroadcastMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type WSBlock struct {
	Height            uint64    `json:"height"`
	ID                string    `json:"id"`
	Timestamp         time.Time `json:"timestamp"`
	TxCount           int       `json:"tx_count"`
	EventCount        int       `json:"event_count"`
	TotalTransactions int64     `json:"total_transactions,omitempty"`
	TotalAddresses    int64     `json:"total_addresses,omitempty"`
	TotalContracts    int64     `json:"total_contracts,omitempty"`
}

type WSTransaction struct {
	ID               string    `json:"id"`
	BlockHeight      uint64    `json:"block_height"`
	Status           string    `json:"status"`
	PayerAddress     string    `json:"payer_address,omitempty"`
	ProposerAddress  string    `json:"proposer_address,omitempty"`
	Timestamp        time.Time `json:"timestamp"`
	ExecutionStatus  string    `json:"execution_status,omitempty"`
	ErrorMessage     string    `json:"error_message,omitempty"`
	IsEVM            bool      `json:"is_evm,omitempty"`
	ScriptHash       string    `json:"script_hash,omitempty"`
	TemplateCategory string    `json:"template_category,omitempty"`
	TemplateLabel    string    `json:"template_label,omitempty"`
	Tags             []string  `json:"tags,omitempty"`
}

func BroadcastNewBlock(block models.Block) {
	ts := block.Timestamp
	if ts.IsZero() {
		ts = block.CreatedAt
	}
	payload := WSBlock{
		Height:            block.Height,
		ID:                block.ID,
		Timestamp:         ts,
		TxCount:           block.TxCount,
		EventCount:        block.EventCount,
		TotalTransactions: liveStats.totalTransactions.Load(),
		TotalAddresses:    liveStats.totalAddresses.Load(),
		TotalContracts:    liveStats.totalContracts.Load(),
	}
	msg := BroadcastMessage{Type: "new_block", Payload: payload}
	data, _ := json.Marshal(msg)
	hub.broadcast <- data
}

func BroadcastNewTransaction(tx models.Transaction) {
	ts := tx.Timestamp
	if ts.IsZero() {
		ts = tx.CreatedAt
	}
	payload := WSTransaction{
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
	msg := BroadcastMessage{Type: "new_transaction", Payload: payload}
	data, _ := json.Marshal(msg)
	hub.broadcast <- data
}

// MakeBroadcastNewTransactions returns a batch broadcast callback that enriches
// transactions with template_category, template_label, and tags derived from
// events before broadcasting over WebSocket.
func MakeBroadcastNewTransactions(repo *repository.Repository) func([]models.Transaction, []models.Event) {
	return func(txs []models.Transaction, events []models.Event) {
		if len(txs) == 0 {
			return
		}

		// Derive tags from events (same logic as tx_contracts_worker)
		tagsByTx := deriveTagsFromEvents(txs, events)

		// Collect unique script hashes for batch enrichment
		hashSet := make(map[string]bool)
		for _, tx := range txs {
			if tx.ScriptHash != "" {
				hashSet[tx.ScriptHash] = true
			}
		}
		hashes := make([]string, 0, len(hashSet))
		for h := range hashSet {
			hashes = append(hashes, h)
		}

		// Batch lookup: script_templates (category/label) + script_imports (contract identifiers)
		categoryByHash := make(map[string]string)
		labelByHash := make(map[string]string)
		if len(hashes) > 0 {
			ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
			defer cancel()

			if templates, err := repo.GetScriptTemplatesByHashes(ctx, hashes); err == nil {
				for hash, tmpl := range templates {
					if tmpl.Category != "" {
						categoryByHash[hash] = tmpl.Category
					}
					if tmpl.Label != "" {
						labelByHash[hash] = tmpl.Label
					}
				}
			}

			// For hashes without a template category, derive from imports
			uncovered := make([]string, 0)
			for _, h := range hashes {
				if _, ok := categoryByHash[h]; !ok {
					uncovered = append(uncovered, h)
				}
			}
			if len(uncovered) > 0 {
				if imports, err := repo.GetScriptImportsByHashes(ctx, uncovered); err == nil {
					for hash, contractIDs := range imports {
						cat := deriveCategoryFromImports(contractIDs)
						// Skip "token_transfer" for WS broadcasts — we can't distinguish
						// real FT transfers from gas-only txs without fee-filtered transfer
						// records. The tx_contracts_worker will assign the proper FT_TRANSFER
						// tag later once it processes the block.
						if cat != "" && cat != "token_transfer" {
							categoryByHash[hash] = cat
						}
					}
				}
			}
		}

		// Broadcast each tx with enrichment
		for _, tx := range txs {
			ts := tx.Timestamp
			if ts.IsZero() {
				ts = tx.CreatedAt
			}
			payload := WSTransaction{
				ID:               tx.ID,
				BlockHeight:      tx.BlockHeight,
				Status:           tx.Status,
				PayerAddress:     tx.PayerAddress,
				ProposerAddress:  tx.ProposerAddress,
				Timestamp:        ts,
				ExecutionStatus:  tx.ExecutionStatus,
				ErrorMessage:     tx.ErrorMessage,
				IsEVM:            tx.IsEVM,
				ScriptHash:       tx.ScriptHash,
				TemplateCategory: categoryByHash[tx.ScriptHash],
				TemplateLabel:    labelByHash[tx.ScriptHash],
				Tags:             tagsByTx[tx.ID],
			}
			msg := BroadcastMessage{Type: "new_transaction", Payload: payload}
			data, _ := json.Marshal(msg)
			hub.broadcast <- data
		}
	}
}

// HasSubscribers returns true if any connected client is subscribed to at least
// one of the given addresses. Callers use this to skip expensive DB lookups
// when nobody is listening.
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

// WSAddressTransfer represents a token transfer included in an address transaction notification.
type WSAddressTransfer struct {
	Type   string `json:"type"`
	Token  string `json:"token"`
	From   string `json:"from"`
	To     string `json:"to"`
	Amount string `json:"amount,omitempty"`
	NFTId  string `json:"nft_id,omitempty"`
}

// WSAddressTransaction is the per-address payload sent to subscribers.
type WSAddressTransaction struct {
	Address     string              `json:"address"`
	Transaction WSTransaction       `json:"transaction"`
	Roles       []string            `json:"roles"`
	Transfers   []WSAddressTransfer `json:"transfers,omitempty"`
}

// BroadcastAddressTransaction sends an address-scoped transaction notification
// to all clients subscribed to the given address.
func BroadcastAddressTransaction(payload WSAddressTransaction) {
	addr := normalizeWSAddress(payload.Address)
	if addr == "" {
		return
	}
	msg := BroadcastMessage{Type: "address_transaction", Payload: payload}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	hub.addressBroadcast <- AddressMessage{
		Addresses: []string{addr},
		Data:      data,
	}
}

// deriveTagsFromEvents derives tx tags from event types, mirroring tx_contracts_worker logic.
func deriveTagsFromEvents(txs []models.Transaction, events []models.Event) map[string][]string {
	tagsByTx := make(map[string][]string)
	seen := make(map[string]map[string]bool) // txID -> tag -> seen

	addTag := func(txID, tag string) {
		if seen[txID] == nil {
			seen[txID] = make(map[string]bool)
		}
		if seen[txID][tag] {
			return
		}
		seen[txID][tag] = true
		tagsByTx[txID] = append(tagsByTx[txID], tag)
	}

	// Check IsEVM flag on transactions
	for _, tx := range txs {
		if tx.IsEVM {
			addTag(tx.ID, "EVM")
		}
	}

	// Derive tags from event types
	for _, evt := range events {
		evtType := evt.Type
		switch {
		case strings.Contains(evtType, "EVM.TransactionExecuted"):
			addTag(evt.TransactionID, "EVM")
		case strings.Contains(evtType, "NFTStorefront"):
			addTag(evt.TransactionID, "MARKETPLACE")
		case strings.Contains(evtType, "AccountContractAdded") || strings.Contains(evtType, "AccountContractUpdated"):
			addTag(evt.TransactionID, "CONTRACT_DEPLOY")
		case evtType == "flow.AccountCreated":
			addTag(evt.TransactionID, "ACCOUNT_CREATED")
		case strings.Contains(evtType, "AccountKeyAdded") || strings.Contains(evtType, "AccountKeyRemoved"):
			addTag(evt.TransactionID, "KEY_UPDATE")
		case strings.Contains(evtType, "FlowTransactionScheduler"):
			addTag(evt.TransactionID, "SCHEDULED_TX")
		case strings.Contains(evtType, ".SwapPair.Swap") ||
			strings.Contains(evtType, ".BloctoSwapPair.Swap") ||
			strings.Contains(evtType, ".MetaPierSwapPair.Swap"):
			addTag(evt.TransactionID, "SWAP")
		case strings.Contains(evtType, ".SwapPair.AddLiquidity") ||
			strings.Contains(evtType, ".SwapPair.RemoveLiquidity"):
			addTag(evt.TransactionID, "LIQUIDITY")
		case strings.Contains(evtType, "FlowIDTableStaking") || strings.Contains(evtType, "FlowStakingCollection"):
			addTag(evt.TransactionID, "STAKING")
		case strings.Contains(evtType, "LiquidStaking") || strings.Contains(evtType, "stFlowToken"):
			addTag(evt.TransactionID, "LIQUID_STAKING")
		// Note: FungibleToken.Deposited/Withdrawn and NonFungibleToken.Deposited/Withdrawn
		// are NOT matched here — they fire on nearly every tx due to gas fees.
		// FT_TRANSFER/NFT_TRANSFER tags are derived by tx_contracts_worker from
		// actual token_transfers records (which filter out fee movements).
		}
	}

	return tagsByTx
}

// deriveCategoryFromImports picks the highest-priority category from contract identifiers.
func deriveCategoryFromImports(contractIDs []string) string {
	bestCategory := ""
	bestPriority := 999
	for _, cid := range contractIDs {
		name := cid
		if parts := strings.SplitN(cid, ".", 3); len(parts) == 3 {
			name = parts[2]
		}
		if cat, found := importCategoryMap[name]; found {
			if p, ok := categoryPriority[cat]; ok && p < bestPriority {
				bestPriority = p
				bestCategory = cat
			}
		}
	}
	if bestCategory == "" && len(contractIDs) > 0 {
		bestCategory = "contract_call"
	}
	return bestCategory
}

// sendAddressPayload converts a models.Transaction + roles/transfers into a
// WSAddressTransaction and sends it via BroadcastAddressTransaction.
func sendAddressPayload(address string, tx models.Transaction, roles []string, transfers []broadcast.TransferInfo) {
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
	var wsTransfers []WSAddressTransfer
	for _, t := range transfers {
		wsTransfers = append(wsTransfers, WSAddressTransfer{
			Type: t.Type, Token: t.Token, From: t.From, To: t.To, Amount: t.Amount, NFTId: t.NFTId,
		})
	}
	payload := WSAddressTransaction{
		Address:     address,
		Transaction: wsTx,
		Roles:       roles,
		Transfers:   wsTransfers,
	}
	BroadcastAddressTransaction(payload)
}

func init() {
	go hub.run()

	// Register broadcast hooks so the ingester package can trigger address
	// notifications without importing api (breaking the import cycle).
	broadcast.HasSubscribers = HasSubscribers
	broadcast.SendAddressPayload = sendAddressPayload
}

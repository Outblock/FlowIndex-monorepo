// Package broadcast provides decoupled WebSocket address-broadcast hooks.
//
// The api package registers HasSubscribers and SendAddressTransaction at init;
// the ingester package calls BroadcastPhase1Transactions / BroadcastPhase2Transactions
// without importing api, breaking the import cycle.
package broadcast

import (
	"strings"

	"flowscan-clone/internal/models"
)

// --- Hooks set by api package at startup ---

// HasSubscribers returns true if any WS client subscribes to at least one of
// the given (lowercased, no-0x) addresses. Nil means "no subscribers".
var HasSubscribers func(addresses []string) bool

// SendAddressPayload marshals and sends a per-address WS message.
// signature: (address string, tx models.Transaction, roles []string, transfers []TransferInfo)
var SendAddressPayload func(address string, tx models.Transaction, roles []string, transfers []TransferInfo)

// TransferInfo holds a token transfer for WS broadcast.
type TransferInfo struct {
	Type   string // "ft" or "nft"
	Token  string
	From   string
	To     string
	Amount string
	NFTId  string
}

// BroadcastPhase1Transactions broadcasts basic tx info (payer/proposer/authorizer roles)
// to subscribed address clients. Called by MetaWorker.
func BroadcastPhase1Transactions(txs []models.Transaction) {
	if len(txs) == 0 || HasSubscribers == nil || SendAddressPayload == nil {
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
		for addr, roles := range rolesByAddr {
			SendAddressPayload(addr, tx, roles, nil)
		}
	}
}

// BroadcastPhase2Transactions broadcasts enriched tx info (FT/NFT transfer roles)
// to subscribed address clients. Called by TokenWorker.
func BroadcastPhase2Transactions(addrTxs []models.AddressTransaction, ftTransfers []models.TokenTransfer, nftTransfers []models.TokenTransfer, txMap map[string]models.Transaction) {
	if len(addrTxs) == 0 || HasSubscribers == nil || SendAddressPayload == nil {
		return
	}
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

	type txAddrInfo struct {
		roles     []string
		transfers []TransferInfo
	}
	byTxAddr := make(map[string]*txAddrInfo)
	makeKey := func(txID, addr string) string { return txID + "|" + addr }

	for _, at := range addrTxs {
		addr := strings.ToLower(at.Address)
		k := makeKey(at.TransactionID, addr)
		ti, ok := byTxAddr[k]
		if !ok {
			ti = &txAddrInfo{}
			byTxAddr[k] = ti
		}
		ti.roles = append(ti.roles, at.Role)
	}

	for _, ft := range ftTransfers {
		transfer := TransferInfo{
			Type: "ft", Token: ft.ContractName, From: ft.FromAddress, To: ft.ToAddress, Amount: ft.Amount,
		}
		for _, addr := range []string{strings.ToLower(ft.FromAddress), strings.ToLower(ft.ToAddress)} {
			k := makeKey(ft.TransactionID, addr)
			if ti, ok := byTxAddr[k]; ok {
				ti.transfers = append(ti.transfers, transfer)
			}
		}
	}
	for _, nt := range nftTransfers {
		transfer := TransferInfo{
			Type: "nft", Token: nt.ContractName, From: nt.FromAddress, To: nt.ToAddress, NFTId: nt.TokenID,
		}
		for _, addr := range []string{strings.ToLower(nt.FromAddress), strings.ToLower(nt.ToAddress)} {
			k := makeKey(nt.TransactionID, addr)
			if ti, ok := byTxAddr[k]; ok {
				ti.transfers = append(ti.transfers, transfer)
			}
		}
	}

	for compositeKey, ti := range byTxAddr {
		parts := strings.SplitN(compositeKey, "|", 2)
		txID, addr := parts[0], parts[1]
		tx, ok := txMap[txID]
		if !ok {
			continue
		}
		SendAddressPayload(addr, tx, ti.roles, ti.transfers)
	}
}

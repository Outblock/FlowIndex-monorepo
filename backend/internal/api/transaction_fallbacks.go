package api

import (
	"context"
	"sort"
	"strings"

	"flowscan-clone/internal/ingester"
	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"
)

func hasTransferSummaryData(summary repository.TransferSummary) bool {
	return len(summary.FT) > 0 || len(summary.NFT) > 0
}

func mergeTransactionsByRecency(primary, fallback []models.Transaction) []models.Transaction {
	if len(fallback) == 0 {
		return primary
	}

	merged := make([]models.Transaction, 0, len(primary)+len(fallback))
	seen := make(map[string]bool, len(primary)+len(fallback))

	for _, tx := range fallback {
		if seen[tx.ID] {
			continue
		}
		seen[tx.ID] = true
		merged = append(merged, tx)
	}
	for _, tx := range primary {
		if seen[tx.ID] {
			continue
		}
		seen[tx.ID] = true
		merged = append(merged, tx)
	}

	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].BlockHeight != merged[j].BlockHeight {
			return merged[i].BlockHeight > merged[j].BlockHeight
		}
		if merged[i].TransactionIndex != merged[j].TransactionIndex {
			return merged[i].TransactionIndex > merged[j].TransactionIndex
		}
		return merged[i].ID > merged[j].ID
	})

	return merged
}

func normalizeAddressForMatch(address string) string {
	return strings.TrimPrefix(strings.ToLower(strings.TrimSpace(address)), "0x")
}

func addressMatchesCandidate(candidate string, addresses ...string) bool {
	candidate = normalizeAddressForMatch(candidate)
	if candidate == "" {
		return false
	}
	for _, addr := range addresses {
		if candidate == normalizeAddressForMatch(addr) {
			return true
		}
	}
	return false
}

func tokenIdentifier(contractAddress, contractName string) string {
	contractAddress = normalizeAddressForMatch(contractAddress)
	contractName = strings.TrimSpace(contractName)
	if contractAddress == "" {
		return ""
	}
	if contractName == "" {
		return contractAddress
	}
	return "A." + contractAddress + "." + contractName
}

func deriveTransferRowsFromEvents(events []models.Event) ([]repository.FTTransferRow, []repository.NFTTransferRow) {
	ftTransfers, nftTransfers := ingester.DeriveTokenTransfersFromEvents(events)

	ftRows := make([]repository.FTTransferRow, 0, len(ftTransfers))
	for _, ft := range ftTransfers {
		token := tokenIdentifier(ft.TokenContractAddress, ft.ContractName)
		if token == "" || ft.ContractName == "FungibleToken" || ft.ContractName == "NonFungibleToken" {
			continue
		}
		ftRows = append(ftRows, repository.FTTransferRow{
			TxID:         ft.TransactionID,
			Token:        token,
			ContractName: ft.ContractName,
			FromAddress:  normalizeAddressForMatch(ft.FromAddress),
			ToAddress:    normalizeAddressForMatch(ft.ToAddress),
			Amount:       ft.Amount,
			EventIndex:   ft.EventIndex,
		})
	}

	nftRows := make([]repository.NFTTransferRow, 0, len(nftTransfers))
	for _, nft := range nftTransfers {
		token := tokenIdentifier(nft.TokenContractAddress, nft.ContractName)
		if token == "" || nft.ContractName == "FungibleToken" || nft.ContractName == "NonFungibleToken" {
			continue
		}
		nftRows = append(nftRows, repository.NFTTransferRow{
			Token:        token,
			ContractName: nft.ContractName,
			FromAddress:  normalizeAddressForMatch(nft.FromAddress),
			ToAddress:    normalizeAddressForMatch(nft.ToAddress),
			TokenID:      nft.TokenID,
			EventIndex:   nft.EventIndex,
		})
	}

	return ftRows, nftRows
}

func buildTransferSummaryFromRows(ftRows []repository.FTTransferRow, nftRows []repository.NFTTransferRow, address, coaAddress string) repository.TransferSummary {
	summary := repository.TransferSummary{
		FT:  make([]repository.FTTransferSummaryItem, 0, len(ftRows)),
		NFT: make([]repository.NFTTransferSummaryItem, 0, len(nftRows)),
	}

	address = normalizeAddressForMatch(address)
	coaAddress = normalizeAddressForMatch(coaAddress)

	for _, ft := range ftRows {
		direction := "transfer"
		counterparty := ""

		if address != "" {
			fromMatches := addressMatchesCandidate(ft.FromAddress, address, coaAddress)
			toMatches := addressMatchesCandidate(ft.ToAddress, address, coaAddress)
			switch {
			case fromMatches && !toMatches:
				direction = "out"
				counterparty = ft.ToAddress
			case toMatches && !fromMatches:
				direction = "in"
				counterparty = ft.FromAddress
			default:
				counterparty = ft.FromAddress
				if counterparty == "" {
					counterparty = ft.ToAddress
				}
			}
		} else {
			counterparty = strings.Trim(strings.Join([]string{ft.FromAddress, ft.ToAddress}, ">"), ">")
		}

		summary.FT = append(summary.FT, repository.FTTransferSummaryItem{
			Token:        ft.Token,
			Amount:       ft.Amount,
			Direction:    direction,
			Counterparty: counterparty,
		})
	}

	for _, nft := range nftRows {
		direction := "transfer"
		counterparty := ""

		if address != "" {
			fromMatches := addressMatchesCandidate(nft.FromAddress, address, coaAddress)
			toMatches := addressMatchesCandidate(nft.ToAddress, address, coaAddress)
			switch {
			case fromMatches && !toMatches:
				direction = "out"
				counterparty = nft.ToAddress
			case toMatches && !fromMatches:
				direction = "in"
				counterparty = nft.FromAddress
			default:
				counterparty = nft.FromAddress
				if counterparty == "" {
					counterparty = nft.ToAddress
				}
			}
		} else {
			counterparty = strings.Trim(strings.Join([]string{nft.FromAddress, nft.ToAddress}, ">"), ">")
		}

		summary.NFT = append(summary.NFT, repository.NFTTransferSummaryItem{
			Collection:   nft.Token,
			Count:        1,
			Direction:    direction,
			Counterparty: counterparty,
		})
	}

	return summary
}

func (s *Server) buildEventFallbackTransferSummaries(ctx context.Context, txs []models.Transaction, address string, existingEventsByTx map[string][]models.Event) (map[string]repository.TransferSummary, map[string]repository.TransferSummary, error) {
	if len(txs) == 0 {
		return map[string]repository.TransferSummary{}, map[string]repository.TransferSummary{}, nil
	}

	eventsByTx := make(map[string][]models.Event, len(existingEventsByTx))
	for txID, events := range existingEventsByTx {
		eventsByTx[txID] = append([]models.Event(nil), events...)
	}

	missingRefs := make([]repository.TxRef, 0, len(txs))
	for _, tx := range txs {
		if len(eventsByTx[tx.ID]) == 0 {
			missingRefs = append(missingRefs, repository.TxRef{ID: tx.ID, BlockHeight: tx.BlockHeight})
		}
	}
	if len(missingRefs) > 0 {
		events, err := s.repo.GetEventsByTxRefs(ctx, missingRefs)
		if err != nil {
			return nil, nil, err
		}
		for _, evt := range events {
			eventsByTx[evt.TransactionID] = append(eventsByTx[evt.TransactionID], evt)
		}
	}

	coaAddress := ""
	if address != "" {
		if coa, err := s.repo.GetCOAByFlowAddress(ctx, address); err == nil && coa != nil {
			coaAddress = coa.COAAddress
		}
	}

	summaries := make(map[string]repository.TransferSummary, len(txs))
	canonicalSummaries := make(map[string]repository.TransferSummary, len(txs))
	for _, tx := range txs {
		events := eventsByTx[tx.ID]
		if len(events) == 0 {
			continue
		}

		ftRows, nftRows := deriveTransferRowsFromEvents(events)
		if len(ftRows) == 0 && len(nftRows) == 0 {
			continue
		}

		summary := buildTransferSummaryFromRows(ftRows, nftRows, address, coaAddress)
		if hasTransferSummaryData(summary) {
			summaries[tx.ID] = summary
		}

		canonicalFTTransfers := canonicalizeFTTransfers(ftRows, nil, buildTxEventContext(events))
		if len(canonicalFTTransfers) == 0 {
			continue
		}
		canonical := buildCanonicalTransferSummaryForContext(canonicalFTTransfers, address, coaAddress)
		if hasTransferSummaryData(canonical) {
			canonicalSummaries[tx.ID] = canonical
		}
	}

	return summaries, canonicalSummaries, nil
}

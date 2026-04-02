package api

import (
	"testing"

	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"
)

func TestMergeTransactionsByRecency(t *testing.T) {
	primary := []models.Transaction{
		{ID: "old-1", BlockHeight: 100, TransactionIndex: 1},
		{ID: "old-2", BlockHeight: 90, TransactionIndex: 2},
	}
	fallback := []models.Transaction{
		{ID: "new-1", BlockHeight: 110, TransactionIndex: 0},
		{ID: "old-1", BlockHeight: 100, TransactionIndex: 1},
	}

	merged := mergeTransactionsByRecency(primary, fallback)
	if len(merged) != 3 {
		t.Fatalf("merged len=%d want 3", len(merged))
	}
	if merged[0].ID != "new-1" || merged[1].ID != "old-1" || merged[2].ID != "old-2" {
		t.Fatalf("unexpected order: %#v", []string{merged[0].ID, merged[1].ID, merged[2].ID})
	}
}

func TestBuildTransferSummaryFromRowsUsesAddressDirection(t *testing.T) {
	ftRows := []repository.FTTransferRow{
		{
			Token:       "A.1654653399040a61.FlowToken",
			FromAddress: "706f78f0b9a6c83b",
			ToAddress:   "84221fe0294044d7",
			Amount:      "764529.30000000",
		},
	}
	nftRows := []repository.NFTTransferRow{
		{
			Token:       "A.1d7e57aa55817448.ExampleNFT",
			FromAddress: "84221fe0294044d7",
			ToAddress:   "706f78f0b9a6c83b",
			TokenID:     "1",
		},
	}

	summary := buildTransferSummaryFromRows(ftRows, nftRows, "0x84221fe0294044d7", "")
	if len(summary.FT) != 1 || summary.FT[0].Direction != "in" {
		t.Fatalf("ft direction=%q want in", summary.FT[0].Direction)
	}
	if len(summary.NFT) != 1 || summary.NFT[0].Direction != "out" {
		t.Fatalf("nft direction=%q want out", summary.NFT[0].Direction)
	}
}

package api

import (
	"testing"

	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"
)

func TestCanonicalizeFTTransfersCrossVM(t *testing.T) {
	rows := []repository.FTTransferRow{
		{
			Token:       "A.1e4aa0b87d10b141.EVMVMBridgedToken_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
			FromAddress: "1da56fcf7fb6915c",
			ToAddress:   "000000000000000000000002bd91ec0b3c1284fe",
			Amount:      "1.00000000",
			EventIndex:  0,
		},
		{
			Token:      defiActionsTokenID,
			Amount:     "1.00000000",
			EventIndex: 10,
		},
		{
			Token:        "A.1654653399040a61.FlowToken",
			ContractName: "FlowToken",
			FromAddress:  "6b00ff876c299c61",
			ToAddress:    "00000000000000000000000249250a5c27ecab3b",
			Amount:       "8.17377164",
			EventIndex:   52,
		},
		{
			Token:        "A.1654653399040a61.FlowToken",
			ContractName: "FlowToken",
			FromAddress:  "6b00ff876c299c61",
			Amount:       "8.17377164",
			EventIndex:   55,
		},
		{
			Token:      "A.1e4aa0b87d10b141.EVMVMBridgedToken_cbf9a7753f9d2d0e8141ebb36d99f87acef98597",
			ToAddress:  "b1d63873c3cc9f79",
			Amount:     "7.02034748",
			EventIndex: 94,
		},
	}

	evmExecs := []repository.EVMTransactionRecord{
		{
			EventIndex:  53,
			FromAddress: "00000000000000000000000249250a5c27ecab3b",
			ToAddress:   "d3bf53dac106a0290b0483ecbc89d40fcc961f3e",
			Data:        "a9059cbb000000000000000000000000000000000000000000000002bd91ec0b3c1284fe000000000000000000000000000000000000000000000000716f1200055cb000",
		},
		{
			EventIndex:  87,
			FromAddress: "000000000000000000000002bd91ec0b3c1284fe",
			ToAddress:   "cbf9a7753f9d2d0e8141ebb36d99f87acef98597",
			Data:        "a9059cbb00000000000000000000000000000000000000000000000249250a5c27ecab3b0000000000000000000000000000000000000000000000260eb073c438dfc000",
		},
	}

	transfers := canonicalizeFTTransfers(rows, evmExecs)
	if len(transfers) != 3 {
		t.Fatalf("expected 3 canonical transfers, got %d", len(transfers))
	}

	if transfers[1].EVMToAddress != "000000000000000000000002bd91ec0b3c1284fe" {
		t.Fatalf("expected FLOW bridge recipient to be inferred, got %q", transfers[1].EVMToAddress)
	}
	if transfers[2].FromAddress != "000000000000000000000002bd91ec0b3c1284fe" {
		t.Fatalf("expected bridged mint sender to be inferred, got %q", transfers[2].FromAddress)
	}
	if transfers[2].TransferType != "transfer" {
		t.Fatalf("expected bridged mint to become transfer, got %q", transfers[2].TransferType)
	}

	summary := buildCanonicalTransferSummary(transfers)
	if len(summary.FT) != 3 {
		t.Fatalf("expected 3 summary items, got %d", len(summary.FT))
	}
	if summary.FT[0].Token != rows[0].Token || summary.FT[2].Token != rows[4].Token {
		t.Fatalf("unexpected summary ordering: %#v", summary.FT)
	}
}

func TestBuildCanonicalTransferSummaryForContextFiltersUnrelatedHops(t *testing.T) {
	transfers := []canonicalFTTransfer{
		{
			Token:        "A.1e4aa0b87d10b141.EVMVMBridgedToken_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
			FromAddress:  "1da56fcf7fb6915c",
			ToAddress:    "000000000000000000000002bd91ec0b3c1284fe",
			EVMToAddress: "000000000000000000000002bd91ec0b3c1284fe",
			Amount:       "1.00000000",
			EventIndex:   0,
			TransferType: "transfer",
			IsCrossVM:    true,
		},
		{
			Token:        "A.6b00ff876c299c61.MOET",
			FromAddress:  "1e4aa0b87d10b141",
			ToAddress:    "6b00ff876c299c61",
			Amount:       "0.57899898",
			EventIndex:   12,
			TransferType: "transfer",
		},
		{
			Token:          "A.1e4aa0b87d10b141.EVMVMBridgedToken_cbf9a7753f9d2d0e8141ebb36d99f87acef98597",
			FromAddress:    "000000000000000000000002bd91ec0b3c1284fe",
			EVMFromAddress: "000000000000000000000002bd91ec0b3c1284fe",
			ToAddress:      "b1d63873c3cc9f79",
			Amount:         "7.02034748",
			EventIndex:     94,
			TransferType:   "transfer",
			IsCrossVM:      true,
		},
	}

	summary := buildCanonicalTransferSummaryForContext(transfers, "1da56fcf7fb6915c", "000000000000000000000002bd91ec0b3c1284fe")
	if len(summary.FT) != 2 {
		t.Fatalf("expected 2 context-aware summary items, got %d", len(summary.FT))
	}
	if summary.FT[0].Direction != "transfer" {
		t.Fatalf("expected first transfer to be self-move, got %q", summary.FT[0].Direction)
	}
	if summary.FT[1].Direction != "out" {
		t.Fatalf("expected second transfer to be outbound, got %q", summary.FT[1].Direction)
	}
	if summary.FT[1].Counterparty != "b1d63873c3cc9f79" {
		t.Fatalf("expected counterparty to be vault address, got %q", summary.FT[1].Counterparty)
	}
}

func TestCanonicalizeFTTransfersMarksBridgeFee(t *testing.T) {
	rows := []repository.FTTransferRow{
		{
			Token:        "A.1654653399040a61.FlowToken",
			ContractName: "FlowToken",
			FromAddress:  "8c228867db0e8644",
			ToAddress:    "1e4aa0b87d10b141",
			Amount:       "0.00010000",
			EventIndex:   2,
		},
		{
			Token:        "A.05b67ba314000b2d.TSHOT",
			ContractName: "TSHOT",
			FromAddress:  "1e4aa0b87d10b141",
			ToAddress:    "8c228867db0e8644",
			Amount:       "9.00000000",
			EventIndex:   9,
		},
	}
	events := []models.Event{
		{
			Type:            "A.1e4aa0b87d10b141.IFlowEVMTokenBridge.BridgedTokensFromEVM",
			ContractName:    "IFlowEVMTokenBridge",
			ContractAddress: "1e4aa0b87d10b141",
			Payload:         []byte(`{"bridgeAddress":"1e4aa0b87d10b141"}`),
		},
	}

	transfers := canonicalizeFTTransfers(rows, nil, buildTxEventContext(events))
	if len(transfers) != 2 {
		t.Fatalf("expected 2 canonical transfers, got %d", len(transfers))
	}

	if !transfers[0].IsBridgeFee {
		t.Fatalf("expected FlowToken leg to be marked as bridge fee")
	}
	if transfers[1].IsBridgeFee {
		t.Fatalf("expected bridged asset not to be marked as bridge fee")
	}

	summary := buildCanonicalTransferSummary(transfers)
	if len(summary.FT) != 1 {
		t.Fatalf("expected bridge fee to be removed from summary, got %d items", len(summary.FT))
	}
	if summary.FT[0].Token != rows[1].Token {
		t.Fatalf("expected summary to keep bridged token, got %q", summary.FT[0].Token)
	}
}

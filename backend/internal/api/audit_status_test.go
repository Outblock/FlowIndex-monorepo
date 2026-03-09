//go:build integration

package api_test

import (
	"testing"
)

func TestAudit_Status(t *testing.T) {
	obj := fetchBareObject(t, "/status")

	// Verify required fields are present
	assertFieldsExist(t, obj, "latest_height", "chain_id")

	// Verify chain_id is non-empty
	chainID := toString(obj["chain_id"])
	assertNonEmpty(t, "chain_id", chainID)

	// Verify latest_height > 100,000,000 (mainnet is well past this)
	latestHeight := toFloat64(obj["latest_height"])
	if latestHeight <= 100_000_000 {
		t.Errorf("latest_height = %v, expected > 100,000,000 for mainnet", latestHeight)
	}

	// If indexed_height present, check gap from latest_height
	if _, ok := obj["indexed_height"]; ok {
		indexedHeight := toFloat64(obj["indexed_height"])
		gap := latestHeight - indexedHeight
		if gap > 1000 {
			t.Logf("WARNING: indexed_height is %.0f blocks behind latest_height (gap=%.0f)", gap, gap)
		}
		t.Logf("status: chain_id=%s latest_height=%.0f indexed_height=%.0f gap=%.0f",
			chainID, latestHeight, indexedHeight, gap)
	} else {
		t.Logf("status: chain_id=%s latest_height=%.0f (indexed_height not present)",
			chainID, latestHeight)
	}
}

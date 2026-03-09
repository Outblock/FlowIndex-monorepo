//go:build integration

package api_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
)

func TestAudit_DefiPairs(t *testing.T) {
	url := ctx.baseURL + "/defi/pair"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET /defi/pair error: %v", err)
	}
	if status == http.StatusNotFound || status == http.StatusNotImplemented {
		t.Skip("endpoint not available (status ", status, ")")
	}
	if status != 200 {
		t.Fatalf("GET /defi/pair status=%d, want 200 (body: %.300s)", status, body)
	}

	// Try envelope format
	items := parseEnvelopeOrBareList(t, body, "/defi/pair")
	if len(items) == 0 {
		t.Skip("no DeFi pairs returned")
	}

	for i, pair := range items {
		label := "pair[" + strconv.Itoa(i) + "]"

		// Must have an id
		id := toString(pair["id"])
		if id == "" {
			id = toString(pair["pair_id"])
		}
		if id == "" {
			t.Errorf("%s: missing id or pair_id (keys: %v)", label, mapKeys(pair))
		}

		// Must have asset fields
		hasAssetField := false
		for _, key := range []string{"asset0_id", "asset1_id", "asset0_symbol", "asset1_symbol"} {
			if _, ok := pair[key]; ok {
				hasAssetField = true
				break
			}
		}
		if !hasAssetField {
			t.Errorf("%s: missing asset fields (keys: %v)", label, mapKeys(pair))
		}
	}
}

func TestAudit_DefiEvents(t *testing.T) {
	url := ctx.baseURL + "/defi/events?limit=10"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET /defi/events error: %v", err)
	}
	if status == http.StatusNotFound || status == http.StatusNotImplemented {
		t.Skip("endpoint not available (status ", status, ")")
	}
	if status != 200 {
		t.Fatalf("GET /defi/events status=%d, want 200 (body: %.300s)", status, body)
	}

	items := parseEnvelopeOrBareList(t, body, "/defi/events")
	if len(items) == 0 {
		t.Skip("no DeFi events returned")
	}

	knownTypes := map[string]bool{
		"Swap":             true,
		"AddLiquidity":     true,
		"RemoveLiquidity":  true,
		"Mint":             true,
		"Burn":             true,
		"Sync":             true,
		"Transfer":         true,
	}

	for i, evt := range items {
		label := "event[" + strconv.Itoa(i) + "]"

		assertFieldsExist(t, evt, "event_type", "timestamp", "transaction_id")

		eventType := toString(evt["event_type"])
		if eventType == "" {
			t.Errorf("%s.event_type is empty", label)
		} else if !knownTypes[eventType] {
			t.Logf("%s: unrecognized event_type=%q (may be valid, just not in known list)", label, eventType)
		}

		assertTimestamp(t, label+".timestamp", toString(evt["timestamp"]))

		txID := toString(evt["transaction_id"])
		if txID == "" {
			t.Errorf("%s.transaction_id is empty", label)
		}
	}
}

func TestAudit_DefiLatestBlock(t *testing.T) {
	url := ctx.baseURL + "/defi/latest-block"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET /defi/latest-block error: %v", err)
	}
	if status == http.StatusNotFound || status == http.StatusNotImplemented {
		t.Skip("endpoint not available (status ", status, ")")
	}
	if status != 200 {
		t.Fatalf("GET /defi/latest-block status=%d, want 200 (body: %.300s)", status, body)
	}

	// Response is envelope with data: [{latest_block: N}]
	items := parseEnvelopeOrBareList(t, body, "/defi/latest-block")
	if len(items) == 0 {
		// Try as bare object
		obj := parseBareObject(t, body, "/defi/latest-block")
		height := toFloat64(obj["latest_block"])
		if height <= 0 {
			t.Errorf("latest_block=%v, want > 0", height)
		}
		return
	}

	height := toFloat64(items[0]["latest_block"])
	if height <= 0 {
		t.Errorf("latest_block=%v, want > 0", height)
	}
}

func TestAudit_DefiLatestSwap(t *testing.T) {
	url := ctx.baseURL + "/defi/latest-swap"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET /defi/latest-swap error: %v", err)
	}
	if status == http.StatusNotFound || status == http.StatusNotImplemented {
		t.Skip("endpoint not available (status ", status, ")")
	}
	if status != 200 {
		t.Fatalf("GET /defi/latest-swap status=%d, want 200 (body: %.300s)", status, body)
	}

	items := parseEnvelopeOrBareList(t, body, "/defi/latest-swap")
	if len(items) == 0 {
		t.Skip("no latest swap data returned")
	}

	swap := items[0]
	// If swap data is present, verify it has basic fields
	if len(swap) > 0 {
		txID := toString(swap["transaction_id"])
		if txID == "" {
			t.Logf("latest swap missing transaction_id (keys: %v)", mapKeys(swap))
		}
		eventType := toString(swap["event_type"])
		if eventType != "" && eventType != "Swap" {
			t.Logf("latest swap event_type=%q, expected 'Swap'", eventType)
		}
	}
}

func TestAudit_DefiAssets(t *testing.T) {
	url := ctx.baseURL + "/defi/asset"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET /defi/asset error: %v", err)
	}
	if status == http.StatusNotFound || status == http.StatusNotImplemented {
		t.Skip("endpoint not available (status ", status, ")")
	}
	if status != 200 {
		t.Fatalf("GET /defi/asset status=%d, want 200 (body: %.300s)", status, body)
	}

	items := parseEnvelopeOrBareList(t, body, "/defi/asset")
	if len(items) == 0 {
		t.Skip("no DeFi assets returned")
	}

	validCount := 0
	for i, asset := range items {
		label := "asset[" + strconv.Itoa(i) + "]"

		assertFieldsExist(t, asset, "id", "symbol")

		id := toString(asset["id"])
		symbol := toString(asset["symbol"])

		if id == "" && symbol == "" {
			t.Logf("%s: both id and symbol are empty (placeholder entry)", label)
			continue
		}

		if id == "" {
			t.Errorf("%s: has symbol=%q but missing id", label, symbol)
		}
		if symbol == "" {
			t.Errorf("%s: has id=%q but missing symbol", label, id)
		}

		validCount++
	}

	if validCount == 0 {
		t.Logf("WARN: all %d assets have empty id/symbol — defi asset data may not be populated", len(items))
	}
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

// parseEnvelopeOrBareList tries to parse response as envelope list, then bare list.
func parseEnvelopeOrBareList(t *testing.T, body []byte, path string) []map[string]interface{} {
	t.Helper()

	// Try envelope first
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		var items []map[string]interface{}
		if json.Unmarshal(env.Data, &items) == nil {
			return items
		}
		// Maybe data is a single object
		var obj map[string]interface{}
		if json.Unmarshal(env.Data, &obj) == nil {
			return []map[string]interface{}{obj}
		}
	}

	// Try bare array
	var items []map[string]interface{}
	if json.Unmarshal(body, &items) == nil {
		return items
	}

	// Try bare object
	var obj map[string]interface{}
	if json.Unmarshal(body, &obj) == nil {
		return []map[string]interface{}{obj}
	}

	t.Fatalf("GET %s: cannot parse response as list (body: %.300s)", path, body)
	return nil
}

// parseBareObject parses response as a bare JSON object.
func parseBareObject(t *testing.T, body []byte, path string) map[string]interface{} {
	t.Helper()
	var obj map[string]interface{}
	if err := json.Unmarshal(body, &obj); err != nil {
		t.Fatalf("GET %s: response is not a JSON object: %v (body: %.300s)", path, err, body)
	}
	return obj
}

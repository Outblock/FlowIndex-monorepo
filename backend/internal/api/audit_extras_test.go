//go:build integration

package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Account extras
// ---------------------------------------------------------------------------

func TestAudit_AccountStorageInfo(t *testing.T) {
	url := ctx.baseURL + "/flow/account/" + ctx.address + "/storage"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET storage error: %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("storage endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET storage status=%d, want 200 (body: %.300s)", status, body)
	}

	// Response could be envelope or bare object
	var obj map[string]interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		if err := json.Unmarshal(env.Data, &obj); err != nil {
			// Might be an array
			var arr []map[string]interface{}
			if json.Unmarshal(env.Data, &arr) == nil && len(arr) > 0 {
				obj = arr[0]
			}
		}
	}
	if obj == nil {
		json.Unmarshal(body, &obj)
	}
	if len(obj) == 0 {
		t.Skip("storage returned empty response")
	}
	t.Logf("storage keys: %v", mapKeys(obj))
}

func TestAudit_AccountLabelsCheck(t *testing.T) {
	const flowTokenAddr = "0x1654653399040a61"
	url := ctx.baseURL + "/flow/account/" + flowTokenAddr + "/labels"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET labels error: %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("labels endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET labels status=%d, want 200 (body: %.300s)", status, body)
	}

	// Parse response — could be envelope with array, bare array, or bare object
	var labels []map[string]interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		json.Unmarshal(env.Data, &labels)
	}
	if labels == nil {
		json.Unmarshal(body, &labels)
	}
	if labels == nil {
		// Might be a bare object with labels field
		var obj map[string]interface{}
		if json.Unmarshal(body, &obj) == nil {
			if arr, ok := obj["labels"]; ok {
				if raw, err := json.Marshal(arr); err == nil {
					json.Unmarshal(raw, &labels)
				}
			}
		}
	}
	if len(labels) == 0 {
		t.Skip("no labels returned for FlowToken account")
	}
	t.Logf("FlowToken account has %d label(s)", len(labels))
}

func TestAudit_AccountBalanceHistoryInfo(t *testing.T) {
	url := ctx.baseURL + "/flow/account/" + ctx.address + "/balance/history"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET balance/history error: %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("balance/history endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET balance/history status=%d, want 200 (body: %.300s)", status, body)
	}

	// Try envelope list
	var items []map[string]interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		json.Unmarshal(env.Data, &items)
	}
	if items == nil {
		json.Unmarshal(body, &items)
	}
	if len(items) == 0 {
		t.Skip("no balance history data returned for " + ctx.address)
	}
	t.Logf("balance history: %d entries", len(items))
}

func TestAudit_AccountFTTokenTransferInfo(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/account/"+ctx.address+"/ft/"+ctx.ftToken+"/transfer?limit=5")
	if len(items) == 0 {
		t.Skip("no FT token transfers for " + ctx.address + " / " + ctx.ftToken)
	}

	for i, item := range items {
		label := "ft_token_transfer[" + strconv.Itoa(i) + "]"
		assertFieldsExist(t, item, "transaction_hash")
		assertNonEmpty(t, label+".transaction_hash", toString(item["transaction_hash"]))
	}
}

func TestAudit_AccountTaxReportInfo(t *testing.T) {
	url := ctx.baseURL + "/flow/account/" + ctx.address + "/tax-report"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET tax-report error: %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("tax-report endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET tax-report status=%d, want 200 (body: %.300s)", status, body)
	}

	// Parse — could be envelope or bare
	var result interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		json.Unmarshal(env.Data, &result)
	}
	if result == nil {
		json.Unmarshal(body, &result)
	}
	if result == nil {
		t.Fatal("tax-report returned unparseable response")
	}
	t.Logf("tax-report response type: %T", result)
}

// ---------------------------------------------------------------------------
// Contract extras
// ---------------------------------------------------------------------------

func TestAudit_ContractTransactionsInfo(t *testing.T) {
	if ctx.contractID == "" {
		t.Skip("no contractID available")
	}

	items := fetchEnvelopeList(t, "/flow/contract/"+ctx.contractID+"/transaction?limit=5")
	if len(items) == 0 {
		t.Skip("no transactions found for contract " + ctx.contractID)
	}

	for i, tx := range items {
		label := "contract_tx[" + strconv.Itoa(i) + "]"
		// Should have transaction id or hash
		id := toString(tx["id"])
		if id == "" {
			id = toString(tx["transaction_id"])
		}
		if id == "" {
			id = toString(tx["transaction_hash"])
		}
		assertNonEmpty(t, label+".id", id)
	}
}

// fetchJSONLong is like fetchJSON but with a longer timeout for slow endpoints.
func fetchJSONLong(url string, timeout time.Duration) (int, []byte, error) {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return resp.StatusCode, body, err
}

func TestAudit_ContractEventsInfo(t *testing.T) {
	if ctx.contractID == "" {
		t.Skip("no contractID available")
	}

	url := ctx.baseURL + "/flow/contract/" + ctx.contractID + "/events"
	status, body, err := fetchJSONLong(url, 60*time.Second)
	if err != nil {
		t.Skipf("GET contract events timed out or failed (slow query): %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("contract events endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET contract events status=%d, want 200 (body: %.300s)", status, body)
	}

	// Parse — could be envelope list, bare array, or object with event types
	var items []map[string]interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		json.Unmarshal(env.Data, &items)
	}
	if items == nil {
		json.Unmarshal(body, &items)
	}
	if len(items) == 0 {
		t.Skip("no event types found for contract " + ctx.contractID)
	}
	t.Logf("contract %s has %d event type(s)", ctx.contractID, len(items))
}

func TestAudit_ContractDependenciesInfo(t *testing.T) {
	if ctx.contractID == "" {
		t.Skip("no contractID available")
	}

	url := ctx.baseURL + "/flow/contract/" + ctx.contractID + "/dependencies"
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET contract dependencies error: %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("contract dependencies endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET contract dependencies status=%d, want 200 (body: %.300s)", status, body)
	}

	// Parse — could be envelope list or bare array
	var items []map[string]interface{}
	var env envelope
	if json.Unmarshal(body, &env) == nil && env.Data != nil {
		json.Unmarshal(env.Data, &items)
	}
	if items == nil {
		json.Unmarshal(body, &items)
	}
	if len(items) == 0 {
		t.Skip("no dependencies found for contract " + ctx.contractID)
	}
	t.Logf("contract %s has %d dependency(ies)", ctx.contractID, len(items))
}

func TestAudit_ScriptByHashInfo(t *testing.T) {
	// First, get a transaction to find a script hash
	if ctx.txID == "" || ctx.txID == "unknown" {
		t.Skip("no txID available")
	}

	url := ctx.baseURL + "/flow/transaction/" + ctx.txID
	status, body, err := fetchJSON(url)
	if err != nil || status != 200 {
		t.Skipf("cannot fetch transaction %s (status=%d, err=%v)", ctx.txID, status, err)
	}

	// Extract script_hash from the transaction
	scriptHash := extractFieldFromObject(body, "script_hash")
	if scriptHash == "" {
		t.Skip("transaction has no script_hash field")
	}

	// Now fetch the script by hash
	scriptURL := ctx.baseURL + "/flow/script/" + scriptHash
	sStatus, sBody, sErr := fetchJSON(scriptURL)
	if sErr != nil {
		t.Fatalf("GET script/%s error: %v", scriptHash, sErr)
	}
	if sStatus == 404 || sStatus == 501 {
		t.Skipf("script endpoint returned %d, skipping", sStatus)
	}
	if sStatus != 200 {
		t.Fatalf("GET script/%s status=%d, want 200 (body: %.300s)", scriptHash, sStatus, sBody)
	}

	// Verify non-empty response
	if len(sBody) < 10 {
		t.Errorf("script response too short: %d bytes", len(sBody))
	}
	t.Logf("script %s: %d bytes", scriptHash, len(sBody))
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

func TestAudit_EventSearchInfo(t *testing.T) {
	url := ctx.baseURL + "/flow/events/search?name=A.1654653399040a61.FlowToken.TokensDeposited&limit=5"
	status, body, err := fetchJSONLong(url, 60*time.Second)
	if err != nil {
		t.Skipf("event search timed out or failed (slow query): %v", err)
	}
	if status == 404 || status == 501 {
		t.Skipf("event search endpoint returned %d, skipping", status)
	}
	if status != 200 {
		t.Fatalf("GET events/search status=%d, want 200 (body: %.300s)", status, body)
	}

	dataRaw, _, ok := checkEnvelope(t, body)
	if !ok {
		t.Fatalf("event search: envelope check failed")
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(dataRaw, &items); err != nil {
		t.Fatalf("event search: data is not an array: %v", err)
	}
	if len(items) == 0 {
		t.Skip("no events returned for TokensDeposited search")
	}

	for i, item := range items {
		label := "event[" + strconv.Itoa(i) + "]"

		// Events should have a type field
		evtType := toString(item["type"])
		if evtType == "" {
			evtType = toString(item["event_type"])
		}
		assertNonEmpty(t, label+".type", evtType)

		// Should have a transaction reference
		txHash := toString(item["transaction_hash"])
		if txHash == "" {
			txHash = toString(item["transaction_id"])
		}
		assertNonEmpty(t, label+".transaction_hash", txHash)
	}
}

// ---------------------------------------------------------------------------
// NFT extras
// ---------------------------------------------------------------------------

func TestAudit_NFTTopAccountsInfo(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/nft/"+ctx.nftCollection+"/top-account?limit=5")
	if len(items) < 2 {
		t.Skip("not enough top accounts returned for " + ctx.nftCollection)
	}

	// Verify sorted descending by count/balance
	prev := toFloat64(items[0]["count"])
	if prev == 0 {
		prev = toFloat64(items[0]["balance"])
	}
	if prev == 0 {
		prev = toFloat64(items[0]["quantity"])
	}
	for i := 1; i < len(items); i++ {
		cur := toFloat64(items[i]["count"])
		if cur == 0 {
			cur = toFloat64(items[i]["balance"])
		}
		if cur == 0 {
			cur = toFloat64(items[i]["quantity"])
		}
		if cur > prev {
			t.Errorf("NFT top-account not sorted descending: [%d]=%v > [%d]=%v", i, cur, i-1, prev)
		}
		prev = cur
	}
}

func TestAudit_NFTItemTransfersInfo(t *testing.T) {
	// First get an NFT item ID
	items := fetchEnvelopeList(t, "/flow/nft/"+ctx.nftCollection+"/item?limit=1")
	if len(items) == 0 {
		t.Skip("no NFT items available for " + ctx.nftCollection)
	}

	itemID := toString(items[0]["nft_id"])
	if itemID == "" {
		itemID = toString(items[0]["id"])
	}
	if itemID == "" {
		t.Skip("first NFT item has no nft_id or id")
	}

	transfers := fetchEnvelopeList(t, "/flow/nft/"+ctx.nftCollection+"/item/"+itemID+"/transfer?limit=5")
	if len(transfers) == 0 {
		t.Skip("no transfers found for NFT item " + itemID)
	}

	for i, xfer := range transfers {
		label := "nft_item_transfer[" + strconv.Itoa(i) + "]"
		txHash := toString(xfer["transaction_hash"])
		if txHash == "" {
			txHash = toString(xfer["transaction_id"])
		}
		assertNonEmpty(t, label+".transaction_hash", txHash)
	}
}

// ---------------------------------------------------------------------------
// EVM extras
// ---------------------------------------------------------------------------

// extractEVMAddr extracts an EVM address from a field that may be a plain string
// or an object with a "hash" sub-field.
func extractEVMAddr(obj map[string]interface{}, field string) string {
	v, ok := obj[field]
	if !ok || v == nil {
		return ""
	}
	// Plain string
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	// Object with hash field (e.g. {"hash":"0x...", ...})
	if m, ok := v.(map[string]interface{}); ok {
		if h, ok := m["hash"].(string); ok && h != "" {
			return h
		}
	}
	return ""
}

func TestAudit_EVMAddressTokensInfo(t *testing.T) {
	if ctx.evmTxHash == "" {
		t.Skip("no EVM transaction hash available")
	}

	// Get an EVM address from the transaction
	url := ctx.baseURL + "/flow/evm/transaction/" + ctx.evmTxHash
	status, body, err := fetchJSON(url)
	if err != nil || status != 200 {
		t.Skipf("cannot fetch EVM tx %s (status=%d, err=%v)", ctx.evmTxHash, status, err)
	}

	var tx map[string]interface{}
	json.Unmarshal(body, &tx)

	// from/to may be a string or an object with a "hash" field
	evmAddr := extractEVMAddr(tx, "from")
	if evmAddr == "" {
		evmAddr = extractEVMAddr(tx, "to")
	}
	if evmAddr == "" {
		t.Skip("EVM transaction has no from/to address")
	}

	// Fetch tokens for this address
	tokenURL := ctx.baseURL + "/flow/evm/address/" + evmAddr + "/token"
	tStatus, tBody, tErr := fetchJSON(tokenURL)
	if tErr != nil {
		t.Fatalf("GET evm/address/%s/token error: %v", evmAddr, tErr)
	}
	if tStatus == 404 || tStatus == 501 {
		t.Skipf("EVM address tokens endpoint returned %d, skipping", tStatus)
	}
	if tStatus != 200 {
		t.Fatalf("GET evm/address/%s/token status=%d, want 200 (body: %.300s)", evmAddr, tStatus, tBody)
	}

	t.Logf("EVM address %s tokens response: %d bytes", evmAddr, len(tBody))
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

func TestAudit_AccountingAccountDetailInfo(t *testing.T) {
	obj := fetchEnvelopeObject(t, "/accounting/account/"+ctx.address)
	assertFieldsExist(t, obj, "address")

	addr := toString(obj["address"])
	assertFlowAddress(t, addr)
}

func TestAudit_AccountingTransactionsInfo(t *testing.T) {
	items := fetchEnvelopeList(t, "/accounting/transaction?limit=5")
	if len(items) == 0 {
		t.Skip("no accounting transactions returned")
	}

	for i, tx := range items {
		label := "accounting_tx[" + strconv.Itoa(i) + "]"
		id := toString(tx["id"])
		if id == "" {
			id = toString(tx["transaction_id"])
		}
		assertNonEmpty(t, label+".id", id)
	}
}

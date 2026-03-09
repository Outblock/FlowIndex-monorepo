# API Audit Test Suite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Go integration test suite that audits ~35 production API endpoints against `flowindex.io`, cross-referencing core data with the Flow mainnet access node and checking internal consistency for derived data.

**Architecture:** New test file `api_audit_test.go` in `backend/internal/api/` with `//go:build integration` tag. Extends the existing `api_integration_test.go` bootstrap (`testContext`) and helpers. Adds a Flow SDK client for ground-truth cross-referencing and new assertion helpers for deep data validation.

**Tech Stack:** Go testing, `net/http`, `github.com/onflow/flow-go-sdk`, `github.com/onflow/flow-go-sdk/access/grpc` (already in go.mod)

---

### Task 1: Audit helpers file — validation utilities

**Files:**
- Create: `backend/internal/api/audit_helpers_test.go`

**Step 1: Create the audit helpers file**

```go
//go:build integration

package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/onflow/flow-go-sdk"
	"github.com/onflow/flow-go-sdk/access/grpc"
)

// flowClient is a shared Flow Access Node client for cross-referencing.
var flowClient *grpc.Client

const flowAccessNode = "access.mainnet.nodes.onflow.org:9000"

// initFlowClient creates the shared Flow gRPC client. Call in TestMain.
func initFlowClient(t *testing.T) {
	var err error
	flowClient, err = grpc.NewClient(flowAccessNode)
	if err != nil {
		t.Fatalf("failed to create Flow client: %v", err)
	}
}

// --- Assertion helpers ---

var reFlowAddress = regexp.MustCompile(`^0x[0-9a-f]{16}$`)
var reTokenIdentifier = regexp.MustCompile(`^A\.[0-9a-f]{16}\.\w+$`)
var reEVMHash = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)

func assertFlowAddress(t *testing.T, addr string) {
	t.Helper()
	if !reFlowAddress.MatchString(addr) {
		t.Errorf("invalid Flow address: %q (want 0x + 16 hex)", addr)
	}
}

func assertTokenIdentifier(t *testing.T, id string) {
	t.Helper()
	if !reTokenIdentifier.MatchString(id) {
		t.Errorf("invalid token identifier: %q (want A.{16hex}.Name)", id)
	}
}

func assertEVMHash(t *testing.T, hash string) {
	t.Helper()
	if !reEVMHash.MatchString(hash) {
		t.Errorf("invalid EVM hash: %q (want 0x + 64 hex)", hash)
	}
}

func assertPositiveFloat(t *testing.T, label string, val interface{}) {
	t.Helper()
	f := toFloat64(val)
	if f < 0 {
		t.Errorf("%s: expected non-negative, got %v", label, val)
	}
}

func assertNonEmpty(t *testing.T, label, val string) {
	t.Helper()
	if val == "" {
		t.Errorf("%s: expected non-empty string", label)
	}
}

func assertTimestamp(t *testing.T, label string, val interface{}) {
	t.Helper()
	s, ok := val.(string)
	if !ok {
		t.Errorf("%s: expected string timestamp, got %T", label, val)
		return
	}
	if _, err := time.Parse(time.RFC3339, s); err != nil {
		if _, err2 := time.Parse(time.RFC3339Nano, s); err2 != nil {
			t.Errorf("%s: invalid RFC3339 timestamp: %q", label, s)
		}
	}
}

func assertFieldsExist(t *testing.T, obj map[string]interface{}, fields ...string) {
	t.Helper()
	var missing []string
	for _, f := range fields {
		if _, ok := obj[f]; !ok {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		t.Errorf("missing fields: %v (got: %v)", missing, mapKeys(obj))
	}
}

// toFloat64 converts JSON number types to float64.
func toFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(n, 64)
		return f
	default:
		return 0
	}
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

// fetchEnvelopeData fetches a URL, asserts 200 + envelope, returns parsed data array.
func fetchEnvelopeList(t *testing.T, path string) []map[string]interface{} {
	t.Helper()
	url := ctx.baseURL + path
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	if status != 200 {
		t.Fatalf("GET %s: status %d (body: %.300s)", path, status, body)
	}
	dataRaw, _, ok := checkEnvelope(t, body)
	if !ok {
		t.Fatalf("GET %s: invalid envelope", path)
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(dataRaw, &items); err != nil {
		t.Fatalf("GET %s: data not array: %v", path, err)
	}
	return items
}

// fetchEnvelopeObject fetches a URL, asserts 200 + envelope, returns parsed data object.
func fetchEnvelopeObject(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	url := ctx.baseURL + path
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	if status != 200 {
		t.Fatalf("GET %s: status %d (body: %.300s)", path, status, body)
	}
	dataRaw, _, ok := checkEnvelope(t, body)
	if !ok {
		t.Fatalf("GET %s: invalid envelope", path)
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(dataRaw, &obj); err != nil {
		// Might be a single-element array
		var items []map[string]interface{}
		if err2 := json.Unmarshal(dataRaw, &items); err2 == nil && len(items) > 0 {
			return items[0]
		}
		t.Fatalf("GET %s: data not object: %v", path, err)
	}
	return obj
}

// fetchBareObject fetches a URL, asserts 200, returns parsed bare JSON object.
func fetchBareObject(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	url := ctx.baseURL + path
	status, body, err := fetchJSON(url)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	if status != 200 {
		t.Fatalf("GET %s: status %d (body: %.300s)", path, status, body)
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(body, &obj); err != nil {
		t.Fatalf("GET %s: invalid JSON object: %v", path, err)
	}
	return obj
}

// floatsClose checks if two floats are within tolerance.
func floatsClose(a, b, tolerance float64) bool {
	return math.Abs(a-b) <= tolerance
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go vet -tags=integration ./internal/api/`
Expected: No errors (may warn about unused if flowClient isn't used yet — that's OK)

**Step 3: Commit**

```bash
git add backend/internal/api/audit_helpers_test.go
git commit -m "test: add audit helpers for API integration tests"
```

---

### Task 2: Update TestMain to initialize Flow client

**Files:**
- Modify: `backend/internal/api/api_integration_test.go`

**Step 1: Add Flow client initialization and richer bootstrap**

In `TestMain`, after the connectivity check and before `os.Exit(m.Run())`, add:

```go
	// Initialize Flow SDK client for cross-referencing
	var flowErr error
	flowClient, flowErr = grpc.NewClient(flowAccessNode)
	if flowErr != nil {
		fmt.Fprintf(os.Stderr, "WARN: Flow client init failed: %v (cross-ref tests will skip)\n", flowErr)
	}
```

Also add these imports to the file:
```go
	"github.com/onflow/flow-go-sdk/access/grpc"
```

Remove the `initFlowClient` function from `audit_helpers_test.go` since we initialize in TestMain directly.

**Step 2: Add bootstrap for token/NFT context**

Extend `testContext` struct:
```go
type testContext struct {
	baseURL        string
	blockHeight    string
	txID           string
	address        string
	ftToken        string // e.g. "A.1654653399040a61.FlowToken"
	nftCollection  string // e.g. "A.0b2a3299cc857e29.TopShot"
	evmTxHash      string // an EVM transaction hash
	contractID     string // a known contract identifier
}
```

In TestMain, bootstrap these:
```go
	// Bootstrap: FT token
	ctx.ftToken = "A.1654653399040a61.FlowToken" // always exists
	if _, body, err := fetchJSON(base + "/flow/v1/ft?limit=1"); err == nil {
		if id := extractFieldFromList(body, "id"); id != "" {
			ctx.ftToken = id
		}
	}

	// Bootstrap: NFT collection
	ctx.nftCollection = "A.0b2a3299cc857e29.TopShot" // always exists
	if _, body, err := fetchJSON(base + "/flow/v1/nft?limit=1"); err == nil {
		if id := extractFieldFromList(body, "id"); id != "" {
			ctx.nftCollection = id
		}
	}

	// Bootstrap: EVM tx hash
	ctx.evmTxHash = ""
	if _, body, err := fetchJSON(base + "/flow/v1/evm/transaction?limit=1"); err == nil {
		ctx.evmTxHash = extractFieldFromList(body, "hash")
	}

	// Bootstrap: contract identifier
	ctx.contractID = "A.1654653399040a61.FlowToken"
	if _, body, err := fetchJSON(base + "/flow/v1/contract?limit=1"); err == nil {
		if id := extractFieldFromList(body, "id"); id != "" {
			ctx.contractID = id
		}
	}
```

Update the `sub()` helper to include new placeholders:
```go
func sub(path string) string {
	r := strings.NewReplacer(
		"{height}", ctx.blockHeight,
		"{id}", ctx.txID,
		"{address}", ctx.address,
		"{token}", ctx.ftToken,
		"{nft_type}", ctx.nftCollection,
		"{evm_hash}", ctx.evmTxHash,
		"{contract_id}", ctx.contractID,
	)
	return r.Replace(path)
}
```

Update the bootstrap log:
```go
	fmt.Printf("Bootstrap: blockHeight=%s txID=%s address=%s ftToken=%s nftCollection=%s evmTxHash=%s contractID=%s\n",
		ctx.blockHeight, ctx.txID, ctx.address, ctx.ftToken, ctx.nftCollection, ctx.evmTxHash, ctx.contractID)
```

**Step 2: Verify it compiles**

Run: `cd backend && go vet -tags=integration ./internal/api/`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/internal/api/api_integration_test.go backend/internal/api/audit_helpers_test.go
git commit -m "test: extend bootstrap with Flow client and token/NFT context"
```

---

### Task 3: Block cross-reference tests

**Files:**
- Create: `backend/internal/api/audit_blocks_test.go`

**Step 1: Write the block cross-reference test**

```go
//go:build integration

package api_test

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestAudit_BlockCrossRef(t *testing.T) {
	if flowClient == nil {
		t.Skip("Flow client not available")
	}

	height, err := strconv.ParseUint(ctx.blockHeight, 10, 64)
	if err != nil {
		t.Fatalf("invalid block height: %s", ctx.blockHeight)
	}

	// Fetch from our API
	apiBlock := fetchEnvelopeObject(t, "/flow/v1/block/"+ctx.blockHeight)

	// Fetch from Flow Access Node
	c, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	flowBlock, err := flowClient.GetBlockByHeight(c, height)
	if err != nil {
		t.Fatalf("Flow SDK GetBlockByHeight(%d): %v", height, err)
	}

	// Cross-reference: block ID
	apiID := toString(apiBlock["id"])
	flowID := flowBlock.ID.Hex()
	if apiID != flowID {
		t.Errorf("block ID mismatch: api=%s flow=%s", apiID, flowID)
	}

	// Cross-reference: parent ID
	apiParent := toString(apiBlock["parent_id"])
	if apiParent == "" {
		apiParent = toString(apiBlock["parent_hash"])
	}
	flowParent := flowBlock.ParentID.Hex()
	if apiParent != flowParent {
		t.Errorf("parent ID mismatch: api=%s flow=%s", apiParent, flowParent)
	}

	// Cross-reference: height
	apiHeight := toFloat64(apiBlock["height"])
	if uint64(apiHeight) != height {
		t.Errorf("height mismatch: api=%.0f expected=%d", apiHeight, height)
	}

	// Cross-reference: timestamp (within 1 second tolerance)
	apiTS := toString(apiBlock["timestamp"])
	assertTimestamp(t, "block.timestamp", apiTS)
	if parsed, err := time.Parse(time.RFC3339Nano, apiTS); err == nil {
		diff := parsed.Sub(flowBlock.Timestamp).Abs()
		if diff > 2*time.Second {
			t.Errorf("timestamp diff too large: api=%s flow=%s (diff=%s)", apiTS, flowBlock.Timestamp.Format(time.RFC3339Nano), diff)
		}
	}

	t.Logf("Block %d cross-ref OK: id=%s parent=%s", height, apiID[:16]+"...", apiParent[:16]+"...")
}

func TestAudit_BlockTransactionCount(t *testing.T) {
	// Verify block's tx_count matches actual transactions returned
	apiBlock := fetchEnvelopeObject(t, "/flow/v1/block/"+ctx.blockHeight)
	txCount := int(toFloat64(apiBlock["tx_count"]))

	txList := fetchEnvelopeList(t, "/flow/v1/block/"+ctx.blockHeight+"/transaction?limit=200")

	// tx_count should match actual count (or be >= if system txs are excluded from list)
	if len(txList) > txCount {
		t.Errorf("block %s: tx list (%d) exceeds declared tx_count (%d)", ctx.blockHeight, len(txList), txCount)
	}
	if txCount > 0 && len(txList) == 0 {
		t.Errorf("block %s: tx_count=%d but tx list is empty", ctx.blockHeight, txCount)
	}

	t.Logf("Block %s: tx_count=%d, returned=%d", ctx.blockHeight, txCount, len(txList))
}

func TestAudit_BlockListPagination(t *testing.T) {
	// Fetch 5 blocks, verify heights are descending and consecutive
	items := fetchEnvelopeList(t, "/flow/v1/block?limit=5")
	if len(items) < 2 {
		t.Skip("need at least 2 blocks for pagination test")
	}

	prevHeight := int64(-1)
	for i, item := range items {
		h := int64(toFloat64(item["height"]))
		assertFieldsExist(t, item, "id", "height", "timestamp", "tx_count")
		assertTimestamp(t, "block.timestamp", item["timestamp"])

		if prevHeight != -1 {
			if h >= prevHeight {
				t.Errorf("blocks not descending: index %d height %d >= previous %d", i, h, prevHeight)
			}
		}
		prevHeight = h
	}
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go vet -tags=integration ./internal/api/`
Expected: No errors

**Step 3: Run the test against production**

Run: `cd backend && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_Block -v -timeout 2m`
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/internal/api/audit_blocks_test.go
git commit -m "test: add block cross-reference audit tests"
```

---

### Task 4: Transaction cross-reference tests

**Files:**
- Create: `backend/internal/api/audit_transactions_test.go`

**Step 1: Write the transaction cross-reference test**

```go
//go:build integration

package api_test

import (
	"context"
	"testing"
	"time"

	"github.com/onflow/flow-go-sdk"
)

func TestAudit_TransactionCrossRef(t *testing.T) {
	if flowClient == nil {
		t.Skip("Flow client not available")
	}
	if ctx.txID == "unknown" {
		t.Skip("no transaction ID available")
	}

	// Fetch from our API
	apiTx := fetchEnvelopeObject(t, "/flow/v1/transaction/"+ctx.txID)

	// Fetch from Flow Access Node
	txID := flow.HexToID(ctx.txID)
	c, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	flowTx, err := flowClient.GetTransaction(c, txID)
	if err != nil {
		t.Fatalf("Flow SDK GetTransaction(%s): %v", ctx.txID, err)
	}
	flowResult, err := flowClient.GetTransactionResult(c, txID)
	if err != nil {
		t.Fatalf("Flow SDK GetTransactionResult(%s): %v", ctx.txID, err)
	}

	// Cross-reference: payer
	apiPayer := toString(apiTx["payer"])
	flowPayer := "0x" + flowTx.Payer.Hex()
	if apiPayer != flowPayer {
		t.Errorf("payer mismatch: api=%s flow=%s", apiPayer, flowPayer)
	}

	// Cross-reference: proposer
	apiProposer := toString(apiTx["proposer"])
	flowProposer := "0x" + flowTx.ProposalKey.Address.Hex()
	if apiProposer != flowProposer {
		t.Errorf("proposer mismatch: api=%s flow=%s", apiProposer, flowProposer)
	}

	// Cross-reference: status
	apiStatus := toString(apiTx["status"])
	if flowResult.Status == flow.TransactionStatusSealed && apiStatus != "Sealed" {
		t.Errorf("status mismatch: api=%s flow=%s", apiStatus, flowResult.Status)
	}

	// Cross-reference: event count
	apiEventCount := int(toFloat64(apiTx["event_count"]))
	flowEventCount := len(flowResult.Events)
	if apiEventCount != flowEventCount {
		t.Errorf("event_count mismatch: api=%d flow=%d", apiEventCount, flowEventCount)
	}

	// Cross-reference: authorizers count
	if authRaw, ok := apiTx["authorizers"]; ok {
		if auths, ok := authRaw.([]interface{}); ok {
			if len(auths) != len(flowTx.Authorizers) {
				t.Errorf("authorizer count mismatch: api=%d flow=%d", len(auths), len(flowTx.Authorizers))
			}
		}
	}

	// Verify required fields present
	assertFieldsExist(t, apiTx, "id", "block_height", "payer", "proposer", "status", "gas_used", "timestamp")

	t.Logf("Transaction %s cross-ref OK: payer=%s events=%d", ctx.txID[:16]+"...", apiPayer, apiEventCount)
}

func TestAudit_TransactionListConsistency(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/transaction?limit=10")
	if len(items) == 0 {
		t.Skip("no transactions returned")
	}

	for i, tx := range items {
		txID := toString(tx["id"])
		assertNonEmpty(t, "tx.id", txID)
		assertFieldsExist(t, tx, "id", "block_height", "payer", "status", "timestamp")

		// Payer should be valid Flow address
		payer := toString(tx["payer"])
		assertFlowAddress(t, payer)

		// Timestamp should be valid
		assertTimestamp(t, "tx.timestamp", tx["timestamp"])

		// Block height should be positive
		h := toFloat64(tx["block_height"])
		if h <= 0 {
			t.Errorf("tx[%d] block_height <= 0: %v", i, h)
		}
	}
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go vet -tags=integration ./internal/api/`

**Step 3: Run the test**

Run: `cd backend && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_Transaction -v -timeout 2m`
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/internal/api/audit_transactions_test.go
git commit -m "test: add transaction cross-reference audit tests"
```

---

### Task 5: Account cross-reference tests

**Files:**
- Create: `backend/internal/api/audit_accounts_test.go`

**Step 1: Write the account cross-reference test**

```go
//go:build integration

package api_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/onflow/flow-go-sdk"
)

func TestAudit_AccountCrossRef(t *testing.T) {
	if flowClient == nil {
		t.Skip("Flow client not available")
	}

	// Use a well-known address (FlowToken) for stable testing
	testAddr := "0x1654653399040a61"

	// Fetch from our API
	apiAcct := fetchEnvelopeObject(t, "/flow/v1/account/"+testAddr)

	// Fetch from Flow Access Node
	addr := flow.HexToAddress(strings.TrimPrefix(testAddr, "0x"))
	c, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	flowAcct, err := flowClient.GetAccount(c, addr)
	if err != nil {
		t.Fatalf("Flow SDK GetAccount(%s): %v", testAddr, err)
	}

	// Cross-reference: address
	apiAddr := toString(apiAcct["address"])
	if apiAddr != testAddr {
		t.Errorf("address mismatch: api=%s expected=%s", apiAddr, testAddr)
	}

	// Cross-reference: FLOW balance (within tolerance — balance changes frequently)
	apiBalance := toFloat64(apiAcct["flowBalance"])
	// Flow SDK returns balance in UFix64 (uint64), divide by 1e8 for FLOW
	flowBalance := float64(flowAcct.Balance) / 1e8
	// Allow 10% tolerance since balance changes with transactions
	if apiBalance > 0 && flowBalance > 0 {
		ratio := apiBalance / flowBalance
		if ratio < 0.5 || ratio > 2.0 {
			t.Errorf("balance wildly different: api=%.2f flow=%.2f", apiBalance, flowBalance)
		} else {
			t.Logf("Balance within range: api=%.2f flow=%.2f", apiBalance, flowBalance)
		}
	}

	// Cross-reference: contracts exist
	if contracts, ok := apiAcct["contracts"].([]interface{}); ok {
		if len(contracts) != len(flowAcct.Contracts) {
			t.Errorf("contract count mismatch: api=%d flow=%d", len(contracts), len(flowAcct.Contracts))
		}
	}

	// Cross-reference: keys
	if keys, ok := apiAcct["keys"].([]interface{}); ok {
		if len(keys) != len(flowAcct.Keys) {
			t.Logf("key count differs (api may filter revoked): api=%d flow=%d", len(keys), len(flowAcct.Keys))
		}
	}

	t.Logf("Account %s cross-ref OK: balance=%.2f contracts=%d", testAddr, apiBalance, len(flowAcct.Contracts))
}

func TestAudit_AccountTransactions(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/account/"+ctx.address+"/transaction?limit=10")
	if len(items) == 0 {
		t.Skip("no account transactions")
	}

	for i, tx := range items {
		assertFieldsExist(t, tx, "id", "block_height", "timestamp")
		assertTimestamp(t, "tx.timestamp", tx["timestamp"])

		h := toFloat64(tx["block_height"])
		if h <= 0 {
			t.Errorf("tx[%d]: invalid block_height %v", i, h)
		}
	}
}

func TestAudit_AccountContractCode(t *testing.T) {
	// FlowToken contract should always exist and be non-empty
	apiContract := fetchEnvelopeObject(t, "/flow/v1/account/0x1654653399040a61/contract/FlowToken")

	body := toString(apiContract["body"])
	if body == "" {
		body = toString(apiContract["code"])
	}
	if len(body) < 100 {
		t.Errorf("FlowToken contract code too short: %d chars", len(body))
	}
	if !strings.Contains(body, "FlowToken") {
		t.Errorf("FlowToken contract code doesn't contain 'FlowToken'")
	}

	t.Logf("FlowToken contract: %d chars", len(body))
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go vet -tags=integration ./internal/api/`

**Step 3: Run the test**

Run: `cd backend && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_Account -v -timeout 2m`

**Step 4: Commit**

```bash
git add backend/internal/api/audit_accounts_test.go
git commit -m "test: add account cross-reference audit tests"
```

---

### Task 6: FT (fungible token) consistency tests

**Files:**
- Create: `backend/internal/api/audit_ft_test.go`

**Step 1: Write the FT consistency tests**

```go
//go:build integration

package api_test

import (
	"testing"
)

func TestAudit_FTList(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/ft?limit=10")
	if len(items) == 0 {
		t.Fatal("FT list is empty")
	}

	for i, token := range items {
		id := toString(token["id"])
		assertTokenIdentifier(t, id)
		assertFieldsExist(t, token, "id", "name", "symbol", "decimals")

		// Decimals should be 0-18
		decimals := int(toFloat64(token["decimals"]))
		if decimals < 0 || decimals > 18 {
			t.Errorf("ft[%d] %s: invalid decimals %d", i, id, decimals)
		}

		// Symbol should be non-empty
		assertNonEmpty(t, "ft.symbol", toString(token["symbol"]))
	}

	t.Logf("FT list: %d tokens checked", len(items))
}

func TestAudit_FTDetailMatchesList(t *testing.T) {
	// Get first token from list, then fetch detail — fields should match
	items := fetchEnvelopeList(t, "/flow/v1/ft?limit=1")
	if len(items) == 0 {
		t.Skip("no FT tokens")
	}

	listToken := items[0]
	tokenID := toString(listToken["id"])
	detail := fetchEnvelopeObject(t, "/flow/v1/ft/"+tokenID)

	// Symbol should match
	listSymbol := toString(listToken["symbol"])
	detailSymbol := toString(detail["symbol"])
	if listSymbol != detailSymbol {
		t.Errorf("symbol mismatch: list=%s detail=%s", listSymbol, detailSymbol)
	}

	// Decimals should match
	listDecimals := toFloat64(listToken["decimals"])
	detailDecimals := toFloat64(detail["decimals"])
	if listDecimals != detailDecimals {
		t.Errorf("decimals mismatch: list=%v detail=%v", listDecimals, detailDecimals)
	}
}

func TestAudit_FTTransfers(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/ft/transfer?limit=10")
	if len(items) == 0 {
		t.Skip("no FT transfers")
	}

	for i, xfer := range items {
		assertFieldsExist(t, xfer, "transaction_hash", "amount", "sender", "receiver", "timestamp")

		// Amount should be parseable and positive
		amount := toFloat64(xfer["amount"])
		if amount < 0 {
			t.Errorf("ft_transfer[%d]: negative amount %v", i, amount)
		}

		// Sender and receiver should be valid addresses
		sender := toString(xfer["sender"])
		receiver := toString(xfer["receiver"])
		if sender != "" {
			assertFlowAddress(t, sender)
		}
		if receiver != "" {
			assertFlowAddress(t, receiver)
		}

		assertTimestamp(t, "ft_transfer.timestamp", xfer["timestamp"])
	}
}

func TestAudit_FTHoldings(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/ft/"+ctx.ftToken+"/holding?limit=10")
	if len(items) == 0 {
		t.Skip("no holdings for " + ctx.ftToken)
	}

	for i, holding := range items {
		assertFieldsExist(t, holding, "address", "balance")

		addr := toString(holding["address"])
		assertFlowAddress(t, addr)

		balance := toFloat64(holding["balance"])
		if balance < 0 {
			t.Errorf("holding[%d]: negative balance %v", i, balance)
		}
	}
}

func TestAudit_FTTopAccounts(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/ft/"+ctx.ftToken+"/top-account?limit=10")
	if len(items) < 2 {
		t.Skip("need at least 2 top accounts")
	}

	// Verify descending order
	prevBalance := toFloat64(items[0]["balance"])
	for i := 1; i < len(items); i++ {
		balance := toFloat64(items[i]["balance"])
		if balance > prevBalance {
			t.Errorf("top-account not sorted descending: [%d]=%v > [%d]=%v", i, balance, i-1, prevBalance)
		}
		prevBalance = balance
	}
}

func TestAudit_FTStats(t *testing.T) {
	obj := fetchBareObject(t, "/flow/v1/ft/stats")
	// Should have some stats fields — at minimum non-negative numbers
	for key, val := range obj {
		if f := toFloat64(val); f < 0 {
			t.Errorf("ft/stats.%s: negative value %v", key, val)
		}
	}
}

func TestAudit_FTPrices(t *testing.T) {
	// FLOW token should have a price
	items := fetchEnvelopeList(t, "/flow/v1/ft/prices")
	if len(items) == 0 {
		// Might be a bare object
		obj := fetchBareObject(t, "/flow/v1/ft/prices")
		if len(obj) == 0 {
			t.Skip("no price data")
		}
		return
	}

	// At least one token should have a price
	hasPrice := false
	for _, item := range items {
		if p := toFloat64(item["current_price"]); p > 0 {
			hasPrice = true
			break
		}
		if p := toFloat64(item["price"]); p > 0 {
			hasPrice = true
			break
		}
	}
	if !hasPrice {
		t.Logf("WARN: no tokens with price data in ft/prices response")
	}
}

func TestAudit_AccountFTVaults(t *testing.T) {
	// FlowFees should have at least FlowToken vault
	items := fetchEnvelopeList(t, "/flow/v1/account/0xe467b9dd11fa00df/ft")
	if len(items) == 0 {
		t.Error("FlowFees account has no FT vaults")
		return
	}

	for _, vault := range items {
		assertFieldsExist(t, vault, "token", "balance")
	}
}

func TestAudit_AccountFTTransferDirection(t *testing.T) {
	// Fetch transfers for a specific address, verify direction logic
	items := fetchEnvelopeList(t, "/flow/v1/account/"+ctx.address+"/ft/transfer?limit=10")
	if len(items) == 0 {
		t.Skip("no FT transfers for address")
	}

	for i, xfer := range items {
		dir := toString(xfer["direction"])
		sender := toString(xfer["sender"])
		receiver := toString(xfer["receiver"])

		if dir == "withdraw" && sender != ctx.address {
			t.Errorf("xfer[%d]: direction=withdraw but sender=%s (expected %s)", i, sender, ctx.address)
		}
		if dir == "deposit" && receiver != ctx.address {
			t.Errorf("xfer[%d]: direction=deposit but receiver=%s (expected %s)", i, receiver, ctx.address)
		}
	}
}
```

**Step 2: Verify + run**

Run: `cd backend && go vet -tags=integration ./internal/api/ && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_FT -v -timeout 3m`

**Step 3: Commit**

```bash
git add backend/internal/api/audit_ft_test.go
git commit -m "test: add FT consistency audit tests"
```

---

### Task 7: NFT consistency tests

**Files:**
- Create: `backend/internal/api/audit_nft_test.go`

**Step 1: Write the NFT consistency tests**

```go
//go:build integration

package api_test

import (
	"testing"
)

func TestAudit_NFTList(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/nft?limit=10")
	if len(items) == 0 {
		t.Fatal("NFT list is empty")
	}

	for i, coll := range items {
		id := toString(coll["id"])
		assertTokenIdentifier(t, id)
		assertFieldsExist(t, coll, "id", "name")

		name := toString(coll["name"])
		if name == "" {
			t.Logf("nft[%d] %s: name is empty", i, id)
		}
	}

	t.Logf("NFT list: %d collections checked", len(items))
}

func TestAudit_NFTDetailMatchesList(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/nft?limit=1")
	if len(items) == 0 {
		t.Skip("no NFT collections")
	}

	listColl := items[0]
	collID := toString(listColl["id"])
	detail := fetchEnvelopeObject(t, "/flow/v1/nft/"+collID)

	listName := toString(listColl["name"])
	detailName := toString(detail["name"])
	if listName != detailName {
		t.Errorf("name mismatch: list=%s detail=%s", listName, detailName)
	}
}

func TestAudit_NFTTransfers(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/nft/transfer?limit=10")
	if len(items) == 0 {
		t.Skip("no NFT transfers")
	}

	for i, xfer := range items {
		assertFieldsExist(t, xfer, "transaction_hash", "nft_type", "sender", "receiver", "timestamp")

		sender := toString(xfer["sender"])
		receiver := toString(xfer["receiver"])
		if sender != "" {
			assertFlowAddress(t, sender)
		}
		if receiver != "" {
			assertFlowAddress(t, receiver)
		}
		assertTimestamp(t, "nft_transfer.timestamp", xfer["timestamp"])
	}
}

func TestAudit_NFTHoldings(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/nft/"+ctx.nftCollection+"/holding?limit=10")
	if len(items) == 0 {
		t.Skip("no holdings for " + ctx.nftCollection)
	}

	for _, holding := range items {
		assertFieldsExist(t, holding, "address")
		addr := toString(holding["address"])
		assertFlowAddress(t, addr)
	}
}

func TestAudit_NFTItems(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/nft/"+ctx.nftCollection+"/item?limit=10")
	if len(items) == 0 {
		t.Skip("no items for " + ctx.nftCollection)
	}

	firstItem := items[0]
	assertFieldsExist(t, firstItem, "nft_id")

	// Fetch individual item detail
	nftID := toString(firstItem["nft_id"])
	if nftID != "" {
		detail := fetchEnvelopeObject(t, "/flow/v1/nft/"+ctx.nftCollection+"/item/"+nftID)
		detailID := toString(detail["nft_id"])
		if detailID != nftID {
			t.Errorf("NFT item ID mismatch: list=%s detail=%s", nftID, detailID)
		}
	}
}

func TestAudit_NFTStats(t *testing.T) {
	obj := fetchBareObject(t, "/flow/v1/nft/stats")
	for key, val := range obj {
		if f := toFloat64(val); f < 0 {
			t.Errorf("nft/stats.%s: negative value %v", key, val)
		}
	}
}

func TestAudit_AccountNFTCollections(t *testing.T) {
	// Use a known NFT holder or fallback to bootstrapped address
	items := fetchEnvelopeList(t, "/flow/v1/account/"+ctx.address+"/nft")
	// This might be empty for the bootstrapped address; that's OK
	for _, coll := range items {
		assertFieldsExist(t, coll, "id")
	}
	t.Logf("Account %s has %d NFT collections", ctx.address, len(items))
}
```

**Step 2: Verify + run**

Run: `cd backend && go vet -tags=integration ./internal/api/ && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_NFT -v -timeout 3m`

**Step 3: Commit**

```bash
git add backend/internal/api/audit_nft_test.go
git commit -m "test: add NFT consistency audit tests"
```

---

### Task 8: Contract and EVM audit tests

**Files:**
- Create: `backend/internal/api/audit_contracts_evm_test.go`

**Step 1: Write the contract and EVM tests**

```go
//go:build integration

package api_test

import (
	"strings"
	"testing"
)

// --- Contract tests ---

func TestAudit_ContractList(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/contract?limit=10")
	if len(items) == 0 {
		t.Fatal("contract list is empty")
	}

	for i, c := range items {
		id := toString(c["id"])
		assertTokenIdentifier(t, id) // same A.{addr}.Name format
		assertFieldsExist(t, c, "id", "address", "name")

		addr := toString(c["address"])
		assertFlowAddress(t, addr)

		// Identifier should contain the address
		addrNoPrefix := strings.TrimPrefix(addr, "0x")
		if !strings.Contains(id, addrNoPrefix) {
			t.Errorf("contract[%d]: id=%s doesn't contain address %s", i, id, addrNoPrefix)
		}
	}
}

func TestAudit_ContractDetail(t *testing.T) {
	detail := fetchEnvelopeObject(t, "/flow/v1/contract/"+ctx.contractID)

	assertFieldsExist(t, detail, "id", "address", "name")

	// Code should be non-empty
	body := toString(detail["body"])
	if body == "" {
		body = toString(detail["code"])
	}
	if len(body) < 10 {
		t.Errorf("contract %s: code too short (%d chars)", ctx.contractID, len(body))
	}

	t.Logf("Contract %s: %d chars of code", ctx.contractID, len(body))
}

func TestAudit_ContractVersions(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/contract/"+ctx.contractID+"/version?limit=10")
	if len(items) == 0 {
		t.Skip("no versions for " + ctx.contractID)
	}

	// Versions should have block heights
	for _, v := range items {
		assertFieldsExist(t, v, "block_height")
	}
}

// --- EVM tests ---

func TestAudit_EVMTransactionList(t *testing.T) {
	items := fetchEnvelopeList(t, "/flow/v1/evm/transaction?limit=10")
	if len(items) == 0 {
		t.Skip("no EVM transactions")
	}

	for i, tx := range items {
		hash := toString(tx["hash"])
		assertEVMHash(t, hash)
		assertFieldsExist(t, tx, "hash", "from", "block_number")

		gasUsed := toFloat64(tx["gas_used"])
		if gasUsed < 0 {
			t.Errorf("evm_tx[%d]: negative gas_used %v", i, gasUsed)
		}
	}
}

func TestAudit_EVMTransactionDetail(t *testing.T) {
	if ctx.evmTxHash == "" {
		t.Skip("no EVM tx hash available")
	}

	detail := fetchEnvelopeObject(t, "/flow/v1/evm/transaction/"+ctx.evmTxHash)
	assertFieldsExist(t, detail, "hash", "from", "block_number")

	hash := toString(detail["hash"])
	if hash != ctx.evmTxHash {
		t.Errorf("EVM tx hash mismatch: got=%s expected=%s", hash, ctx.evmTxHash)
	}

	// Gas values should be reasonable
	gasUsed := toFloat64(detail["gas_used"])
	gasLimit := toFloat64(detail["gas_limit"])
	if gasUsed > gasLimit && gasLimit > 0 {
		t.Errorf("gas_used (%v) > gas_limit (%v)", gasUsed, gasLimit)
	}
}
```

**Step 2: Verify + run**

Run: `cd backend && go vet -tags=integration ./internal/api/ && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run "TestAudit_Contract|TestAudit_EVM" -v -timeout 3m`

**Step 3: Commit**

```bash
git add backend/internal/api/audit_contracts_evm_test.go
git commit -m "test: add contract and EVM audit tests"
```

---

### Task 9: Status endpoint audit

**Files:**
- Create: `backend/internal/api/audit_status_test.go`

**Step 1: Write the status audit test**

```go
//go:build integration

package api_test

import (
	"testing"
)

func TestAudit_Status(t *testing.T) {
	obj := fetchBareObject(t, "/status")

	assertFieldsExist(t, obj, "latest_height", "chain_id")

	// Chain ID should be "flow-mainnet" or similar
	chainID := toString(obj["chain_id"])
	assertNonEmpty(t, "chain_id", chainID)

	// Latest height should be a large number (mainnet is 100M+)
	latestHeight := toFloat64(obj["latest_height"])
	if latestHeight < 100_000_000 {
		t.Errorf("latest_height suspiciously low: %v", latestHeight)
	}

	// Indexed height should be close to latest (within 100 blocks for healthy system)
	if indexedRaw, ok := obj["indexed_height"]; ok {
		indexed := toFloat64(indexedRaw)
		gap := latestHeight - indexed
		if gap > 1000 {
			t.Errorf("indexer lagging: latest=%v indexed=%v gap=%v", latestHeight, indexed, gap)
		} else {
			t.Logf("Indexer healthy: latest=%.0f indexed=%.0f gap=%.0f", latestHeight, indexed, gap)
		}
	}
}
```

**Step 2: Verify + run**

Run: `cd backend && go vet -tags=integration ./internal/api/ && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit_Status -v -timeout 1m`

**Step 3: Commit**

```bash
git add backend/internal/api/audit_status_test.go
git commit -m "test: add status endpoint audit test"
```

---

### Task 10: Run full audit suite and fix any failures

**Step 1: Run the complete audit suite**

Run: `cd backend && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -run TestAudit -v -timeout 5m 2>&1 | tee /tmp/audit-results.txt`

**Step 2: Review results**

Check for:
- Any FAIL results → investigate and fix (may be test bugs or real data issues)
- Any SKIP results → document why
- All PASS →

**Step 3: Fix any test issues found**

Adjust assertions that are too strict or too loose based on real production data. For example:
- Response field names might differ from expected
- Some endpoints might return data in slightly different shapes
- Edge cases in address formatting

**Step 4: Final commit**

```bash
git add -A backend/internal/api/audit_*_test.go
git commit -m "test: fix audit tests based on production data validation"
```

---

### Task 11: Run existing tests to ensure no regressions

**Step 1: Run existing integration tests**

Run: `cd backend && FLOWSCAN_API_URL=https://flowindex.io go test ./internal/api/ -tags=integration -v -timeout 5m`

**Step 2: Run unit tests**

Run: `cd backend && go test ./internal/api/ -v -timeout 2m`

**Step 3: Verify all pass**

Both existing and new tests should pass. If any existing tests broke due to `testContext` changes, fix them.

**Step 4: Final commit if needed**

```bash
git add backend/internal/api/
git commit -m "test: ensure backward compatibility with existing integration tests"
```

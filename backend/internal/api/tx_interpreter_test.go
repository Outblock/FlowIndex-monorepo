package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInterpretTransaction_ERC20Transfer(t *testing.T) {
	method := "transfer"
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:   "0x24cd8022c64c94c5e7a9b68b7962e3719660a5ff66d09c72041a060cd5889a68",
			From:   &bsAddress{Hash: "0xf995716F612F11A117a82B6aBFD1fA67Adf5F4a1"},
			To:     &bsAddress{Hash: "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590", IsContract: true},
			Value:  "0",
			Method: &method,
			DecodedInput: &bsDecodedInput{
				MethodCall: "transfer(address to, uint256 amount)",
				MethodID:   "a9059cbb",
			},
			TokenTransfers: []bsTokenTransfer{
				{
					From:  &bsAddress{Hash: "0xf995716F612F11A117a82B6aBFD1fA67Adf5F4a1"},
					To:    &bsAddress{Hash: "0xe39921F5b222CD96a8ff0a4e8e7Be31bd82EC1Df"},
					Token: &bsToken{Symbol: "WETH", Name: "WETH", Type: "ERC-20", Decimals: "18", Address: "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590"},
					Total: &bsTotal{Decimals: "18", Value: "193000000000000000"},
					Type:  "token_transfer",
				},
			},
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	if summary.SummaryTemplate == "" {
		t.Fatal("expected non-empty summary")
	}

	action, ok := summary.SummaryTemplateVariables["action"]
	if !ok {
		t.Fatal("missing action variable")
	}
	text := action.Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "WETH") {
		t.Errorf("expected WETH in summary, got: %s", text)
	}
	if !contains(text, "0.193") {
		t.Errorf("expected 0.193 in summary, got: %s", text)
	}
	if !contains(text, "Transferred") {
		t.Errorf("expected 'Transferred' in summary, got: %s", text)
	}
}

func TestInterpretTransaction_Swap(t *testing.T) {
	sender := "0xAABBCCDDEEFF00112233445566778899AABBCCDD"
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:  "0xabcdef1234567890",
			From:  &bsAddress{Hash: sender},
			To:    &bsAddress{Hash: "0x1111111111111111111111111111111111111111", Name: strPtr("Router")},
			Value: "0",
			TokenTransfers: []bsTokenTransfer{
				{
					From:  &bsAddress{Hash: sender},
					To:    &bsAddress{Hash: "0x1111111111111111111111111111111111111111"},
					Token: &bsToken{Symbol: "USDC", Type: "ERC-20", Decimals: "6", Address: "0xaaa"},
					Total: &bsTotal{Decimals: "6", Value: "100000000"},
				},
				{
					From:  &bsAddress{Hash: "0x1111111111111111111111111111111111111111"},
					To:    &bsAddress{Hash: sender},
					Token: &bsToken{Symbol: "FLOW", Type: "ERC-20", Decimals: "18", Address: "0xbbb"},
					Total: &bsTotal{Decimals: "18", Value: "50500000000000000000"},
				},
			},
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "Swapped") {
		t.Errorf("expected 'Swapped' in summary, got: %s", text)
	}
	if !contains(text, "USDC") || !contains(text, "FLOW") {
		t.Errorf("expected both USDC and FLOW in summary, got: %s", text)
	}
	if !contains(text, "100") {
		t.Errorf("expected amount 100 in summary, got: %s", text)
	}
}

func TestInterpretTransaction_NativeTransfer(t *testing.T) {
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:     "0xdeadbeef",
			From:     &bsAddress{Hash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
			To:       &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},
			Value:    "1000000000000000000", // 1 FLOW
			RawInput: "0x",
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "Transferred") || !contains(text, "FLOW") {
		t.Errorf("expected native transfer summary, got: %s", text)
	}
	if !contains(text, "1 FLOW") {
		t.Errorf("expected '1 FLOW' in summary, got: %s", text)
	}
}

func TestInterpretTransaction_ContractCreation(t *testing.T) {
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:             "0xdeadbeef",
			From:             &bsAddress{Hash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
			To:               nil,
			Value:            "0",
			TransactionTypes: []string{"contract_creation"},
			RawInput:         "0x6080604052",
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "Created") && !contains(text, "contract") {
		t.Errorf("expected contract creation summary, got: %s", text)
	}
}

func TestInterpretTransaction_Mint(t *testing.T) {
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:  "0xmint123",
			From:  &bsAddress{Hash: "0x0000000000000000000000000000000000000000"},
			To:    &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},
			Value: "0",
			TokenTransfers: []bsTokenTransfer{
				{
					From:  &bsAddress{Hash: "0x0000000000000000000000000000000000000000"},
					To:    &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},
					Token: &bsToken{Symbol: "FLOW", Type: "ERC-20", Decimals: "18", Address: "0xccc"},
					Total: &bsTotal{Decimals: "18", Value: "5000000000000000000"},
				},
			},
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "Minted") {
		t.Errorf("expected 'Minted' in summary, got: %s", text)
	}
}

func TestInterpretTransaction_Approve(t *testing.T) {
	method := "approve"
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:   "0xapprove123",
			From:   &bsAddress{Hash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
			To:     &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", Name: strPtr("USDC Token")},
			Value:  "0",
			Method: &method,
			DecodedInput: &bsDecodedInput{
				MethodCall: "approve(address spender, uint256 amount)",
				MethodID:   "095ea7b3",
				Parameters: []struct {
					Name  string `json:"name"`
					Type  string `json:"type"`
					Value any    `json:"value"`
				}{
					{Name: "spender", Type: "address", Value: "0x1234567890abcdef1234567890abcdef12345678"},
					{Name: "amount", Type: "uint256", Value: "115792089237316195423570985008687907853269984665640564039457584007913129639935"},
				},
			},
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "Approved") {
		t.Errorf("expected 'Approved' in summary, got: %s", text)
	}
}

func TestInterpretTransaction_ContractCall(t *testing.T) {
	req := &bsTxInterpretRequest{
		Data: bsTxData{
			Hash:     "0xcall123",
			From:     &bsAddress{Hash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
			To:       &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", Name: strPtr("IncrementFi Router")},
			Value:    "0",
			RawInput: "0xabcdef12",
			DecodedInput: &bsDecodedInput{
				MethodCall: "addLiquidity(address tokenA, address tokenB, uint256 amountA)",
				MethodID:   "abcdef12",
			},
		},
		ChainID: 747,
	}

	summary := interpretTransaction(req)
	text := summary.SummaryTemplateVariables["action"].Value.(string)
	t.Logf("Summary: %s", text)

	if !contains(text, "addLiquidity") {
		t.Errorf("expected 'addLiquidity' in summary, got: %s", text)
	}
	if !contains(text, "IncrementFi Router") {
		t.Errorf("expected 'IncrementFi Router' in summary, got: %s", text)
	}
}

func TestHandleBsTxInterpret_HTTP(t *testing.T) {
	method := "transfer"
	reqBody := bsTxInterpretRequest{
		Data: bsTxData{
			Hash:  "0xHTTPtest",
			From:  &bsAddress{Hash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
			To:    &bsAddress{Hash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},
			Value: "1000000000000000000",
			Method: &method,
			RawInput: "0x",
		},
		ChainID: 747,
	}

	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/blockscout/transactions/summary", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	s := &Server{}
	s.handleBsTxInterpret(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp bsInterpretResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Fatal("expected success=true")
	}
	if len(resp.Data.Summaries) == 0 {
		t.Fatal("expected at least one summary")
	}

	t.Logf("Response: %s", w.Body.String())
}

// ── helpers ───────────────────────────────────────────────────────────────

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		findSubstring(s, substr))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

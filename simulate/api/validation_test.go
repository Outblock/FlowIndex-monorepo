package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateSimulateRequestRejectsMalformedArguments(t *testing.T) {
	req := SimulateRequest{
		Cadence: "transaction(amount: UFix64, recipient: Address) {}",
		Arguments: []json.RawMessage{
			json.RawMessage(`{"type":"UFix64","value":".0"}`),
			json.RawMessage(`{"type":"Address","value":""}`),
		},
		Authorizers: []string{"1654653399040a61"},
	}

	err := validateSimulateRequest(req)
	if err == nil {
		t.Fatal("expected validation error")
	}
	if got := err.Error(); !strings.Contains(got, "invalid argument at index 0") {
		t.Fatalf("unexpected error: %s", got)
	}
}

func TestHandleSimulateReturnsBadRequestBeforeRecoveryForInvalidParams(t *testing.T) {
	h := &Handler{}
	h.recovering.Store(true)

	body := `{
		"cadence":"transaction(amount: UFix64, recipient: Address) {}",
		"arguments":[
			{"type":"UFix64","value":".0"},
			{"type":"Address","value":""}
		],
		"authorizers":["0x1654653399040a61"]
	}`

	req := httptest.NewRequest(http.MethodPost, "/api/simulate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.HandleSimulate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
	if got := rec.Body.String(); !strings.Contains(got, "invalid argument at index 0") {
		t.Fatalf("expected validation error, got %s", got)
	}
}

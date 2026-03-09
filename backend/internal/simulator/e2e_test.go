//go:build e2e
// +build e2e

package simulator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"
)

// E2E test against a real Flow Emulator in fork mode.
// Run with: SIMULATOR_URL=http://... go test ./internal/simulator/ -tags e2e -v -run TestE2E
// Set SIMULATOR_ADMIN_URL if admin API is on a different port (e.g. http://localhost:18080).
func TestE2E_SimulateFlowTransfer(t *testing.T) {
	simURL := os.Getenv("SIMULATOR_URL")
	if simURL == "" {
		t.Skip("SIMULATOR_URL not set, skipping e2e test")
	}
	adminURL := os.Getenv("SIMULATOR_ADMIN_URL")
	if adminURL == "" {
		adminURL = simURL // fallback: same host, NewClient derives :8080
	}

	client := NewClientWithAdmin(simURL, adminURL)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 1. Health check
	t.Log("Checking emulator health...")
	ok, err := client.HealthCheck(ctx)
	if err != nil {
		t.Fatalf("Health check failed: %v", err)
	}
	if !ok {
		t.Fatal("Emulator not healthy")
	}
	t.Log("✓ Emulator is healthy")

	// 2. Create snapshot before simulation
	t.Log("Creating snapshot...")
	snapName := fmt.Sprintf("e2e-test-%d", time.Now().UnixNano())
	name, err := client.CreateSnapshot(ctx, snapName)
	if err != nil {
		t.Logf("⚠ Snapshot creation failed (non-fatal): %v", err)
	} else {
		t.Logf("✓ Snapshot created: %s", name)
		defer func() {
			if err := client.RevertSnapshot(ctx, snapName); err != nil {
				t.Logf("⚠ Snapshot revert failed: %v", err)
			} else {
				t.Log("✓ Snapshot reverted")
			}
		}()
	}

	// 3. Simulate a simple no-op transaction
	t.Log("Simulating no-op transaction...")
	result, err := client.SendTransaction(ctx, &TxRequest{
		Cadence:     "transaction { prepare(signer: &Account) { log(\"hello simulation\") } }",
		Arguments:   []json.RawMessage{},
		Authorizers: []string{"e467b9dd11fa00df"}, // Flow service account on mainnet
		Payer:       "e467b9dd11fa00df",
	})
	if err != nil {
		t.Fatalf("SendTransaction failed: %v", err)
	}
	t.Logf("✓ Transaction result: success=%v, txID=%s, computation=%d, events=%d",
		result.Success, result.TxID, result.ComputationUsed, len(result.Events))

	if !result.Success {
		t.Logf("  Error: %s", result.Error)
	}

	// 4. Test the full handler flow
	t.Log("Testing full simulate handler...")
	handler := NewHandler(client)

	body, _ := json.Marshal(SimulateRequest{
		Cadence:     "transaction { prepare(signer: &Account) { log(\"handler test\") } }",
		Arguments:   []json.RawMessage{},
		Authorizers: []string{"0xe467b9dd11fa00df"},
		Payer:       "0xe467b9dd11fa00df",
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", "/flow/v1/simulate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	recorder := &responseRecorder{headers: http.Header{}, body: &bytes.Buffer{}}
	handler.HandleSimulate(recorder, req)

	t.Logf("✓ Handler response: status=%d", recorder.statusCode)
	t.Logf("  Body: %s", recorder.body.String())

	var resp SimulateResponse
	json.NewDecoder(recorder.body).Decode(&resp)
	t.Logf("✓ Parsed response: success=%v, events=%d, balanceChanges=%d, computation=%d",
		resp.Success, len(resp.Events), len(resp.BalanceChanges), resp.ComputationUsed)
}

// TestE2E_SimulateFlowTokenTransfer tests a FLOW token transfer to see balance changes.
func TestE2E_SimulateFlowTokenTransfer(t *testing.T) {
	simURL := os.Getenv("SIMULATOR_URL")
	if simURL == "" {
		t.Skip("SIMULATOR_URL not set, skipping e2e test")
	}

	client := NewClient(simURL)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	handler := NewHandler(client)

	// Transfer 1.0 FLOW from service account to a known address
	transferTx := `
import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault!")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        let receiverRef = getAccount(to)
            .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference")
        receiverRef.deposit(from: <- self.sentVault)
    }
}
`

	amountArg, _ := json.Marshal(map[string]string{"type": "UFix64", "value": "1.00000000"})
	toArg, _ := json.Marshal(map[string]string{"type": "Address", "value": "0x1654653399040a61"})

	body, _ := json.Marshal(SimulateRequest{
		Cadence:     transferTx,
		Arguments:   []json.RawMessage{amountArg, toArg},
		Authorizers: []string{"0xe467b9dd11fa00df"},
		Payer:       "0xe467b9dd11fa00df",
	})

	t.Log("Simulating FLOW token transfer (1.0 FLOW)...")
	req, _ := http.NewRequestWithContext(ctx, "POST", "/flow/v1/simulate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	recorder := &responseRecorder{headers: http.Header{}, body: &bytes.Buffer{}}
	handler.HandleSimulate(recorder, req)

	var resp SimulateResponse
	json.NewDecoder(recorder.body).Decode(&resp)

	t.Logf("Status: %d", recorder.statusCode)
	t.Logf("Success: %v", resp.Success)
	if resp.Error != "" {
		t.Logf("Error: %s", resp.Error)
	}
	t.Logf("Computation: %d", resp.ComputationUsed)
	t.Logf("Events (%d):", len(resp.Events))
	for _, e := range resp.Events {
		t.Logf("  - %s", e.Type)
	}
	t.Logf("Balance Changes (%d):", len(resp.BalanceChanges))
	for _, bc := range resp.BalanceChanges {
		t.Logf("  - %s: %s %s", bc.Address, bc.Delta, bc.Token)
	}

	if !resp.Success {
		t.Errorf("Expected simulation to succeed")
	}
}

// Simple response recorder for testing.
type responseRecorder struct {
	statusCode int
	headers    http.Header
	body       *bytes.Buffer
}

func (r *responseRecorder) Header() http.Header    { return r.headers }
func (r *responseRecorder) WriteHeader(code int)    { r.statusCode = code }
func (r *responseRecorder) Write(b []byte) (int, error) { return r.body.Write(b) }

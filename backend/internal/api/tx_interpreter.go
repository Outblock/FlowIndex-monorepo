package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// ---------------------------------------------------------------------------
// Blockscout Transaction Interpretation Service (compatible endpoint)
//
// Blockscout backend POSTs enriched tx data to /blockscout/transactions/summary
// and GETs cached results from /blockscout/cache/{hash}.
// We return rule-based human-readable summaries — no LLM needed.
// ---------------------------------------------------------------------------

// ── Blockscout request body types ─────────────────────────────────────────

type bsTxInterpretRequest struct {
	Data     bsTxData  `json:"data"`
	LogsData bsLogs    `json:"logs_data"`
	ChainID  int       `json:"chain_id"`
}

type bsTxData struct {
	To                   *bsAddress          `json:"to"`
	From                 *bsAddress          `json:"from"`
	Hash                 string              `json:"hash"`
	Type                 json.RawMessage     `json:"type"`
	Value                string              `json:"value"`
	Method               *string             `json:"method"`
	Status               string              `json:"status"`
	TransactionTypes     []string            `json:"transaction_types"`
	RawInput             string              `json:"raw_input"`
	DecodedInput         *bsDecodedInput     `json:"decoded_input"`
	TokenTransfers       []bsTokenTransfer   `json:"token_transfers"`
	InternalTransactions []bsInternalTx      `json:"internal_transactions"`
}

type bsAddress struct {
	Hash        string  `json:"hash"`
	Name        *string `json:"name"`
	IsContract  bool    `json:"is_contract"`
	IsVerified  bool    `json:"is_verified"`
}

type bsDecodedInput struct {
	MethodCall string `json:"method_call"`
	MethodID   string `json:"method_id"`
	Parameters []struct {
		Name  string `json:"name"`
		Type  string `json:"type"`
		Value any    `json:"value"`
	} `json:"parameters"`
}

type bsTokenTransfer struct {
	From     *bsAddress `json:"from"`
	To       *bsAddress `json:"to"`
	Total    *bsTotal   `json:"total"`
	Token    *bsToken   `json:"token"`
	Type     string     `json:"type"`
}

type bsTotal struct {
	Decimals string `json:"decimals"`
	Value    string `json:"value"`
}

type bsToken struct {
	Address  string  `json:"address"`
	Name     string  `json:"name"`
	Symbol   string  `json:"symbol"`
	Type     string  `json:"type"`
	Decimals string  `json:"decimals"`
}

type bsInternalTx struct {
	From  *bsAddress `json:"from"`
	To    *bsAddress `json:"to"`
	Type  string     `json:"type"`
	Value string     `json:"value"`
}

type bsLogs struct {
	Items []json.RawMessage `json:"items"`
}

// ── Response types (Blockscout-compatible) ────────────────────────────────

type bsInterpretResponse struct {
	Success bool                 `json:"success"`
	Data    bsInterpretData      `json:"data"`
}

type bsInterpretData struct {
	Summaries []bsSummary `json:"summaries"`
}

type bsSummary struct {
	SummaryTemplate          string                       `json:"summary_template"`
	SummaryTemplateVariables map[string]bsTemplateVar     `json:"summary_template_variables"`
}

type bsTemplateVar struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
}

// ── Cache for interpreted results ─────────────────────────────────────────

var interpreterCache = &responseCache{
	entries: make(map[string]*cacheEntry),
}

const interpreterCacheTTL = 24 * time.Hour

// ── Handlers ──────────────────────────────────────────────────────────────

func (s *Server) handleBsTxInterpret(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10 MB limit
	if err != nil {
		writeInterpreterError(w, http.StatusBadRequest, "failed to read body")
		return
	}
	defer r.Body.Close()

	var req bsTxInterpretRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeInterpreterError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	hash := req.Data.Hash
	if hash == "" {
		writeInterpreterError(w, http.StatusBadRequest, "missing transaction hash")
		return
	}

	// Check cache first
	if cached, ok := interpreterCache.get(hash); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	summary := interpretTransaction(&req)

	resp := bsInterpretResponse{
		Success: true,
		Data: bsInterpretData{
			Summaries: []bsSummary{summary},
		},
	}

	out, _ := json.Marshal(resp)

	// Cache the result
	interpreterCache.set(hash, out, interpreterCacheTTL)

	w.Header().Set("Content-Type", "application/json")
	w.Write(out)

	log.Printf("[tx-interpreter] %s → %s", hash, summary.SummaryTemplate)
}

func (s *Server) handleBsTxInterpretCache(w http.ResponseWriter, r *http.Request) {
	hash := mux.Vars(r)["hash"]
	if hash == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	cached, ok := interpreterCache.get(hash)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(cached)
}

// ── Rule-based interpretation ─────────────────────────────────────────────

func interpretTransaction(req *bsTxInterpretRequest) bsSummary {
	d := &req.Data

	// Resolve method name
	method := ""
	if d.Method != nil {
		method = strings.ToLower(*d.Method)
	}

	// 1. Contract creation
	if d.To == nil && containsType(d.TransactionTypes, "contract_creation") {
		return textSummary("Created a new contract")
	}

	// 2. Token transfers
	if len(d.TokenTransfers) > 0 {
		// Swap detection: 2+ transfers with different tokens
		if s := detectSwap(d); s != nil {
			return *s
		}

		// Approve
		if strings.Contains(method, "approve") {
			return interpretApprove(d)
		}

		// Single/multi transfer
		return interpretTokenTransfers(d)
	}

	// 3. Approve without token transfer events
	if strings.Contains(method, "approve") {
		return interpretApprove(d)
	}

	// 4. Native FLOW transfer (value > 0, no complex input)
	if isNativeTransfer(d) {
		return interpretNativeTransfer(d)
	}

	// 5. Known method call with decoded input
	if d.DecodedInput != nil && d.DecodedInput.MethodCall != "" {
		methodName := extractMethodName(d.DecodedInput.MethodCall)
		toLabel := addressLabel(d.To)
		return textSummary(fmt.Sprintf("Called %s on %s", methodName, toLabel))
	}

	// 6. Generic contract call (has input data but not decoded)
	if d.RawInput != "" && d.RawInput != "0x" && d.To != nil {
		toLabel := addressLabel(d.To)
		if method != "" {
			return textSummary(fmt.Sprintf("Called %s on %s", method, toLabel))
		}
		return textSummary(fmt.Sprintf("Contract call to %s", toLabel))
	}

	// 7. Fallback — empty summary, Blockscout shows raw data
	return bsSummary{
		SummaryTemplate:          "",
		SummaryTemplateVariables: map[string]bsTemplateVar{},
	}
}

// ── Interpretation helpers ────────────────────────────────────────────────

func detectSwap(d *bsTxData) *bsSummary {
	if len(d.TokenTransfers) < 2 {
		return nil
	}

	from := d.From
	if from == nil {
		return nil
	}
	sender := strings.ToLower(from.Hash)

	// Find tokens sent by the user and tokens received by the user
	var sent, received *bsTokenTransfer
	for i := range d.TokenTransfers {
		tt := &d.TokenTransfers[i]
		ttFrom := ""
		ttTo := ""
		if tt.From != nil {
			ttFrom = strings.ToLower(tt.From.Hash)
		}
		if tt.To != nil {
			ttTo = strings.ToLower(tt.To.Hash)
		}

		if ttFrom == sender && sent == nil {
			sent = tt
		}
		if ttTo == sender && received == nil {
			received = tt
		}
	}

	if sent == nil || received == nil {
		return nil
	}
	if sent.Token == nil || received.Token == nil {
		return nil
	}
	// Must be different tokens to be a swap
	if strings.EqualFold(sent.Token.Address, received.Token.Address) {
		return nil
	}

	sentAmount := formatTokenAmount(sent.Total, sent.Token)
	sentSymbol := tokenSymbol(sent.Token)
	recvAmount := formatTokenAmount(received.Total, received.Token)
	recvSymbol := tokenSymbol(received.Token)

	text := fmt.Sprintf("Swapped %s %s for %s %s", sentAmount, sentSymbol, recvAmount, recvSymbol)
	s := textSummary(text)
	return &s
}

func interpretApprove(d *bsTxData) bsSummary {
	// Try to find the token from transfers or decoded input
	symbol := "token"
	if len(d.TokenTransfers) > 0 && d.TokenTransfers[0].Token != nil {
		symbol = tokenSymbol(d.TokenTransfers[0].Token)
	} else if d.DecodedInput != nil {
		// Look for spender in parameters
		for _, p := range d.DecodedInput.Parameters {
			if p.Name == "spender" || p.Name == "_spender" {
				if spender, ok := p.Value.(string); ok && len(spender) > 10 {
					return textSummary(fmt.Sprintf("Approved %s spending for %s…%s", symbol, spender[:6], spender[len(spender)-4:]))
				}
			}
		}
	}

	toLabel := addressLabel(d.To)
	return textSummary(fmt.Sprintf("Approved %s spending on %s", symbol, toLabel))
}

func interpretTokenTransfers(d *bsTxData) bsSummary {
	tt := d.TokenTransfers[0]
	if tt.Token == nil {
		return textSummary("Token transfer")
	}

	symbol := tokenSymbol(tt.Token)
	amount := formatTokenAmount(tt.Total, tt.Token)
	from := tt.From
	to := tt.To

	// Mint: from is zero address
	if from != nil && isZeroAddress(from.Hash) {
		if to != nil {
			return textSummary(fmt.Sprintf("Minted %s %s to %s", amount, symbol, shortAddr(to.Hash)))
		}
		return textSummary(fmt.Sprintf("Minted %s %s", amount, symbol))
	}

	// Burn: to is zero address
	if to != nil && isZeroAddress(to.Hash) {
		return textSummary(fmt.Sprintf("Burned %s %s", amount, symbol))
	}

	// NFT transfer
	if tt.Token.Type == "ERC-721" || tt.Token.Type == "ERC-1155" {
		tokenID := ""
		if tt.Total != nil {
			tokenID = tt.Total.Value
		}
		toLabel := "unknown"
		if to != nil {
			toLabel = shortAddr(to.Hash)
		}
		if tokenID != "" {
			return textSummary(fmt.Sprintf("Transferred %s #%s to %s", symbol, tokenID, toLabel))
		}
		return textSummary(fmt.Sprintf("Transferred %s to %s", symbol, toLabel))
	}

	// Regular ERC-20 transfer
	toLabel := "unknown"
	if to != nil {
		toLabel = shortAddr(to.Hash)
	}

	extra := ""
	if len(d.TokenTransfers) > 1 {
		extra = fmt.Sprintf(" (+%d more transfers)", len(d.TokenTransfers)-1)
	}

	return textSummary(fmt.Sprintf("Transferred %s %s to %s%s", amount, symbol, toLabel, extra))
}

func interpretNativeTransfer(d *bsTxData) bsSummary {
	amount := formatWeiToFlow(d.Value)
	toLabel := addressLabel(d.To)
	return textSummary(fmt.Sprintf("Transferred %s FLOW to %s", amount, toLabel))
}

// ── Utility functions ─────────────────────────────────────────────────────

func textSummary(text string) bsSummary {
	return bsSummary{
		SummaryTemplate: "{action}",
		SummaryTemplateVariables: map[string]bsTemplateVar{
			"action": {Type: "string", Value: text},
		},
	}
}

func writeInterpreterError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(bsInterpretResponse{
		Success: false,
		Data:    bsInterpretData{Summaries: []bsSummary{}},
	})
}

func tokenSymbol(t *bsToken) string {
	if t.Symbol != "" {
		return t.Symbol
	}
	if t.Name != "" {
		return t.Name
	}
	return shortAddr(t.Address)
}

func formatTokenAmount(total *bsTotal, token *bsToken) string {
	if total == nil || total.Value == "" || total.Value == "0" {
		return "0"
	}

	decimals := 18 // default
	if total.Decimals != "" {
		if d, ok := parseInt(total.Decimals); ok {
			decimals = d
		}
	} else if token != nil && token.Decimals != "" {
		if d, ok := parseInt(token.Decimals); ok {
			decimals = d
		}
	}

	return formatBigIntDecimals(total.Value, decimals)
}

func formatBigIntDecimals(valueStr string, decimals int) string {
	val, ok := new(big.Int).SetString(valueStr, 10)
	if !ok {
		return valueStr
	}

	if decimals == 0 {
		return val.String()
	}

	divisor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	whole := new(big.Int).Div(val, divisor)
	remainder := new(big.Int).Mod(val, divisor)

	if remainder.Sign() == 0 {
		return whole.String()
	}

	// Format fractional part with up to 4 significant digits
	fracStr := fmt.Sprintf("%0*s", decimals, remainder.String())
	// Trim trailing zeros, keep up to 4 digits
	fracStr = strings.TrimRight(fracStr, "0")
	if len(fracStr) > 4 {
		fracStr = fracStr[:4]
		fracStr = strings.TrimRight(fracStr, "0")
	}

	if fracStr == "" {
		return whole.String()
	}
	return whole.String() + "." + fracStr
}

func formatWeiToFlow(weiStr string) string {
	if weiStr == "" || weiStr == "0" {
		return "0"
	}
	return formatBigIntDecimals(weiStr, 18)
}

func addressLabel(addr *bsAddress) string {
	if addr == nil {
		return "unknown"
	}
	if addr.Name != nil && *addr.Name != "" {
		return *addr.Name
	}
	return shortAddr(addr.Hash)
}

func shortAddr(hash string) string {
	if len(hash) <= 13 {
		return hash
	}
	return hash[:6] + "…" + hash[len(hash)-4:]
}

func isZeroAddress(hash string) bool {
	h := strings.ToLower(strings.TrimPrefix(hash, "0x"))
	return h == "0000000000000000000000000000000000000000" || h == ""
}

func isNativeTransfer(d *bsTxData) bool {
	if d.Value == "" || d.Value == "0" {
		return false
	}
	// No meaningful input data
	return d.RawInput == "" || d.RawInput == "0x"
}

func containsType(types []string, t string) bool {
	for _, v := range types {
		if strings.EqualFold(v, t) {
			return true
		}
	}
	return false
}

func extractMethodName(methodCall string) string {
	// "transfer(address _to, uint256 _value)" → "transfer"
	if idx := strings.Index(methodCall, "("); idx > 0 {
		return methodCall[:idx]
	}
	return methodCall
}

func parseInt(s string) (int, bool) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	return n, true
}

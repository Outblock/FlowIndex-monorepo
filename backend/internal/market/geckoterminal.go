package market

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// GeckoTerminal network IDs for Flow chains.
const (
	geckoTerminalFlowEVM = "flow-evm"
)

// FetchGeckoTerminalPrices fetches current token prices from GeckoTerminal's
// Flow EVM top pools. Returns a map keyed by lowercase token symbol (e.g. "wflow").
// Callers map these to market_symbol via the ft_tokens table.
func FetchGeckoTerminalPrices(ctx context.Context) (map[string]PriceQuote, error) {
	url := fmt.Sprintf(
		"https://api.geckoterminal.com/api/v2/networks/%s/pools?page=1&sort=h24_tx_count_desc",
		geckoTerminalFlowEVM,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "flowscan-clone/1.0")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("geckoterminal status: %s", resp.Status)
	}

	var result struct {
		Data []struct {
			Attributes struct {
				Name          string `json:"name"`
				BaseTokenPriceUSD  string `json:"base_token_price_usd"`
				QuoteTokenPriceUSD string `json:"quote_token_price_usd"`
			} `json:"attributes"`
			Relationships struct {
				BaseToken struct {
					Data struct {
						ID string `json:"id"` // e.g. "flow-evm_0x..."
					} `json:"data"`
				} `json:"base_token"`
				QuoteToken struct {
					Data struct {
						ID string `json:"id"`
					} `json:"data"`
				} `json:"quote_token"`
			} `json:"relationships"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode geckoterminal: %w", err)
	}

	now := time.Now()
	out := make(map[string]PriceQuote)

	for _, pool := range result.Data {
		// Extract base token price
		if price, err := strconv.ParseFloat(pool.Attributes.BaseTokenPriceUSD, 64); err == nil && price > 0 {
			tokenID := pool.Relationships.BaseToken.Data.ID
			if _, exists := out[tokenID]; !exists {
				out[tokenID] = PriceQuote{
					Asset:    tokenID,
					Currency: "usd",
					Price:    price,
					Source:   "geckoterminal",
					AsOf:     now,
				}
			}
		}
		// Extract quote token price
		if price, err := strconv.ParseFloat(pool.Attributes.QuoteTokenPriceUSD, 64); err == nil && price > 0 {
			tokenID := pool.Relationships.QuoteToken.Data.ID
			if _, exists := out[tokenID]; !exists {
				out[tokenID] = PriceQuote{
					Asset:    tokenID,
					Currency: "usd",
					Price:    price,
					Source:   "geckoterminal",
					AsOf:     now,
				}
			}
		}
	}

	return out, nil
}

package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	includeRanges := false
	if q := r.URL.Query().Get("include_ranges"); q == "1" || q == "true" {
		includeRanges = true
	}

	now := time.Now()
	if includeRanges {
		s.statusRangesCache.mu.Lock()
		if now.Before(s.statusRangesCache.expiresAt) && len(s.statusRangesCache.payload) > 0 {
			cached := append([]byte(nil), s.statusRangesCache.payload...)
			s.statusRangesCache.mu.Unlock()
			w.Write(cached)
			return
		}
		s.statusRangesCache.mu.Unlock()
	} else {
		s.statusCache.mu.Lock()
		if now.Before(s.statusCache.expiresAt) && len(s.statusCache.payload) > 0 {
			cached := append([]byte(nil), s.statusCache.payload...)
			s.statusCache.mu.Unlock()
			w.Write(cached)
			return
		}
		s.statusCache.mu.Unlock()
	}

	// Use singleflight to prevent thundering herd when cache expires.
	flightKey := "status"
	if includeRanges {
		flightKey = "status_ranges"
	}
	result, err, _ := s.statusFlight.Do(flightKey, func() (interface{}, error) {
		// Double-check cache inside singleflight (another goroutine may have populated it).
		now2 := time.Now()
		if includeRanges {
			s.statusRangesCache.mu.Lock()
			if now2.Before(s.statusRangesCache.expiresAt) && len(s.statusRangesCache.payload) > 0 {
				cached := append([]byte(nil), s.statusRangesCache.payload...)
				s.statusRangesCache.mu.Unlock()
				return cached, nil
			}
			s.statusRangesCache.mu.Unlock()
		} else {
			s.statusCache.mu.Lock()
			if now2.Before(s.statusCache.expiresAt) && len(s.statusCache.payload) > 0 {
				cached := append([]byte(nil), s.statusCache.payload...)
				s.statusCache.mu.Unlock()
				return cached, nil
			}
			s.statusCache.mu.Unlock()
		}

		// Build with a bounded timeout so slow DB queries don't block all waiters.
		buildCtx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		payload, err := s.buildStatusPayload(buildCtx, includeRanges)
		if err != nil {
			return nil, err
		}

		if includeRanges {
			s.statusRangesCache.mu.Lock()
			s.statusRangesCache.payload = payload
			s.statusRangesCache.expiresAt = time.Now().Add(5 * time.Minute)
			s.statusRangesCache.mu.Unlock()
		} else {
			s.statusCache.mu.Lock()
			s.statusCache.payload = payload
			s.statusCache.expiresAt = time.Now().Add(10 * time.Second)
			s.statusCache.mu.Unlock()
		}
		return payload, nil
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write(result.([]byte))
}

func (s *Server) buildStatusPayload(ctx context.Context, includeRanges bool) ([]byte, error) {
	getEnvInt := func(key string, defaultVal int) int {
		if valStr := os.Getenv(key); valStr != "" {
			if val, err := strconv.Atoi(valStr); err == nil {
				return val
			}
		}
		return defaultVal
	}
	getEnvUint := func(key string, defaultVal uint64) uint64 {
		if valStr := os.Getenv(key); valStr != "" {
			if val, err := strconv.ParseUint(valStr, 10, 64); err == nil {
				return val
			}
		}
		return defaultVal
	}

	// --- Run all independent DB queries in parallel ---
	var (
		lastIndexed    uint64
		historyIndexed uint64
		minH, maxH     uint64
		totalBlocks    int64
		checkpoints    map[string]uint64
		totalEvents    int64
		totalAddresses int64
		totalContracts int64
		totalTxs       int64
		flowHeight     uint64
		flowHeightOk   bool
		errorSummary   interface{}
		wg             sync.WaitGroup
	)

	wg.Add(9)

	go func() {
		defer wg.Done()
		if h, err := s.repo.GetLastIndexedHeight(ctx, "main_ingester"); err == nil {
			lastIndexed = h
		}
	}()
	go func() {
		defer wg.Done()
		if h, err := s.repo.GetLastIndexedHeight(ctx, "history_ingester"); err == nil {
			historyIndexed = h
		}
	}()
	go func() {
		defer wg.Done()
		if mn, mx, cnt, err := s.repo.GetBlockRange(ctx); err == nil {
			minH, maxH, totalBlocks = mn, mx, cnt
		}
	}()
	go func() {
		defer wg.Done()
		if cp, err := s.repo.GetAllCheckpoints(ctx); err == nil {
			checkpoints = cp
		}
	}()
	go func() {
		defer wg.Done()
		if n, err := s.repo.GetTotalEvents(ctx); err == nil {
			totalEvents = n
		}
	}()
	go func() {
		defer wg.Done()
		if n, err := s.repo.GetTotalAddresses(ctx); err == nil {
			totalAddresses = n
		}
	}()
	go func() {
		defer wg.Done()
		if n, err := s.repo.GetTotalContracts(ctx); err == nil {
			totalContracts = n
		}
	}()
	go func() {
		defer wg.Done()
		if n, err := s.repo.GetTotalTransactions(ctx); err == nil {
			totalTxs = n
		}
	}()
	// Flow access node call (can be slow)
	go func() {
		defer wg.Done()
		flowCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		if h, err := s.client.GetLatestBlockHeight(flowCtx); err == nil {
			flowHeight = h
			flowHeightOk = true
		}
	}()

	wg.Wait()

	// Keep WS broadcast stats in sync with latest DB estimates.
	UpdateLiveStats(totalTxs, totalAddresses, totalContracts)

	if checkpoints == nil {
		checkpoints = map[string]uint64{}
	}

	forwardEnabled := os.Getenv("ENABLE_FORWARD_INGESTER") != "false"
	historyEnabled := os.Getenv("ENABLE_HISTORY_INGESTER") != "false"
	workerEnabled := map[string]bool{
		"main_ingester":            forwardEnabled,
		"history_ingester":         historyEnabled,
		"token_worker":             os.Getenv("ENABLE_TOKEN_WORKER") != "false",
		"evm_worker":               os.Getenv("ENABLE_EVM_WORKER") != "false",
		"meta_worker":              os.Getenv("ENABLE_META_WORKER") != "false",
		"accounts_worker":          os.Getenv("ENABLE_ACCOUNTS_WORKER") != "false",
		"ft_holdings_worker":       os.Getenv("ENABLE_FT_HOLDINGS_WORKER") != "false",
		"nft_ownership_worker":     os.Getenv("ENABLE_NFT_OWNERSHIP_WORKER") != "false",
		"token_metadata_worker":    os.Getenv("ENABLE_TOKEN_METADATA_WORKER") != "false",
		"tx_contracts_worker":      os.Getenv("ENABLE_TX_CONTRACTS_WORKER") != "false",
		"tx_metrics_worker":        os.Getenv("ENABLE_TX_METRICS_WORKER") != "false",
		"daily_stats_worker":       os.Getenv("ENABLE_DAILY_STATS_WORKER") != "false",
		"analytics_deriver_worker": os.Getenv("ENABLE_ANALYTICS_DERIVER_WORKER") != "false",
		"staking_worker":           os.Getenv("ENABLE_STAKING_WORKER") != "false",
		"defi_worker":              os.Getenv("ENABLE_DEFI_WORKER") != "false",
		"daily_balance_worker":     os.Getenv("ENABLE_DAILY_BALANCE_WORKER") != "false",
		"nft_item_metadata_worker": os.Getenv("ENABLE_NFT_ITEM_METADATA_WORKER") != "false",
		"nft_ownership_reconciler": os.Getenv("ENABLE_NFT_OWNERSHIP_RECONCILER") != "false",
	}

	workerConfig := map[string]map[string]interface{}{
		"main_ingester": {
			"workers":    getEnvInt("LATEST_WORKER_COUNT", 1),
			"batch_size": getEnvInt("LATEST_BATCH_SIZE", 1),
		},
		"history_ingester": {
			"workers":    getEnvInt("HISTORY_WORKER_COUNT", 1),
			"batch_size": getEnvInt("HISTORY_BATCH_SIZE", 1),
		},
		"token_worker": {
			"concurrency": getEnvInt("TOKEN_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("TOKEN_WORKER_RANGE", 1000),
		},
		"evm_worker": {
			"concurrency": getEnvInt("EVM_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("EVM_WORKER_RANGE", 1000),
		},
		"meta_worker": {
			"concurrency": getEnvInt("META_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("META_WORKER_RANGE", 1000),
		},
		"accounts_worker": {
			"concurrency": getEnvInt("ACCOUNTS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("ACCOUNTS_WORKER_RANGE", 1000),
		},
		"ft_holdings_worker": {
			"concurrency": getEnvInt("FT_HOLDINGS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("FT_HOLDINGS_WORKER_RANGE", 1000),
		},
		"nft_ownership_worker": {
			"concurrency": getEnvInt("NFT_OWNERSHIP_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("NFT_OWNERSHIP_WORKER_RANGE", 1000),
		},
		"token_metadata_worker": {
			"concurrency": getEnvInt("TOKEN_METADATA_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("TOKEN_METADATA_WORKER_RANGE", 1000),
		},
		"tx_contracts_worker": {
			"concurrency": getEnvInt("TX_CONTRACTS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("TX_CONTRACTS_WORKER_RANGE", 1000),
		},
		"tx_metrics_worker": {
			"concurrency": getEnvInt("TX_METRICS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("TX_METRICS_WORKER_RANGE", 1000),
		},
		"daily_stats_worker": {
			"concurrency": getEnvInt("ANALYTICS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("ANALYTICS_WORKER_RANGE", 5000),
		},
		"analytics_deriver_worker": {
			"concurrency": getEnvInt("ANALYTICS_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("ANALYTICS_WORKER_RANGE", 5000),
		},
		"staking_worker": {
			"concurrency": getEnvInt("STAKING_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("STAKING_WORKER_RANGE", 1000),
		},
		"defi_worker": {
			"concurrency": getEnvInt("DEFI_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("DEFI_WORKER_RANGE", 1000),
		},
		"daily_balance_worker": {
			"concurrency": getEnvInt("DAILY_BALANCE_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("DAILY_BALANCE_WORKER_RANGE", 1000),
		},
		"nft_item_metadata_worker": {
			"concurrency": getEnvInt("NFT_ITEM_METADATA_WORKER_CONCURRENCY", 1),
			"range":       getEnvUint("NFT_ITEM_METADATA_WORKER_RANGE", 1000),
		},
		"nft_ownership_reconciler": {
			"concurrency": getEnvInt("NFT_OWNERSHIP_RECONCILER_CONCURRENCY", 1),
			"range":       getEnvUint("NFT_OWNERSHIP_RECONCILER_RANGE", 1000),
		},
	}

	// Resolve latest height: prefer Flow access node, fallback to cache, then DB
	latestHeight := maxH
	{
		var cachedHeight uint64
		s.latestHeightCache.mu.Lock()
		cachedHeight = s.latestHeightCache.height
		s.latestHeightCache.mu.Unlock()

		if flowHeightOk {
			latestHeight = flowHeight
			s.latestHeightCache.mu.Lock()
			s.latestHeightCache.height = flowHeight
			s.latestHeightCache.updatedAt = time.Now()
			s.latestHeightCache.mu.Unlock()
		} else if cachedHeight > 0 {
			latestHeight = cachedHeight
		} else if lastIndexed > latestHeight {
			latestHeight = lastIndexed
		}
	}

	// Calculate Progress relative to StartBlock
	progress := 0.0
	start := s.startBlock

	totalRange := 0.0
	if latestHeight > start {
		totalRange = float64(latestHeight - start)
	}

	indexedRange := 0.0
	if lastIndexed > start {
		indexedRange = float64(lastIndexed - start)
	}

	if lastIndexed < start {
		indexedRange = 0
	}

	if totalRange > 0 {
		progress = (indexedRange / totalRange) * 100
	}

	// Cap at 100%
	if progress > 100 {
		progress = 100
	}
	if progress < 0 {
		progress = 0
	}

	behind := uint64(0)
	if latestHeight > lastIndexed {
		behind = latestHeight - lastIndexed
	}

	historyHeight := historyIndexed
	if historyHeight == 0 {
		historyHeight = minH
	}

	// --- Phase 2: queries that depend on phase 1 results (run in parallel) ---
	var (
		indexedRanges        = make([]interface{}, 0)
		oldestBlockTimestamp *string
		checkpointTimestamps = map[string]string{}
		wg2                  sync.WaitGroup
	)

	needsPhase2 := includeRanges || minH > 0 || len(checkpoints) > 0
	if needsPhase2 {
		if includeRanges {
			wg2.Add(1)
			go func() {
				defer wg2.Done()
				if ranges, err := s.repo.GetIndexedRanges(ctx); err == nil {
					result := make([]interface{}, 0, len(ranges))
					for _, r := range ranges {
						result = append(result, r)
					}
					indexedRanges = result
				}
			}()
		}

		if minH > 0 {
			wg2.Add(1)
			go func() {
				defer wg2.Done()
				if ts, err := s.repo.GetBlockTimestamp(ctx, minH); err == nil {
					formatted := ts.UTC().Format(time.RFC3339)
					oldestBlockTimestamp = &formatted
				}
			}()
		}

		if len(checkpoints) > 0 {
			wg2.Add(1)
			go func() {
				defer wg2.Done()
				heightSet := make(map[uint64]struct{})
				for _, h := range checkpoints {
					if h > 0 {
						heightSet[h] = struct{}{}
					}
				}
				heights := make([]uint64, 0, len(heightSet))
				for h := range heightSet {
					heights = append(heights, h)
				}
				if tsMap, err := s.repo.GetBlockTimestamps(ctx, heights); err == nil {
					cpTs := map[string]string{}
					for name, h := range checkpoints {
						if ts, ok := tsMap[h]; ok {
							cpTs[name] = ts.UTC().Format(time.RFC3339)
						}
					}
					checkpointTimestamps = cpTs
				}
			}()
		}

		// Error summary
		wg2.Add(1)
		go func() {
			defer wg2.Done()
			if es, err := s.repo.GetErrorSummary(ctx); err == nil {
				errorSummary = es
			}
		}()

		wg2.Wait()
	}

	resp := map[string]interface{}{
		"chain_id":               "flow",
		"latest_height":          latestHeight,
		"indexed_height":         lastIndexed,
		"history_height":         historyHeight,
		"min_height":             minH,
		"max_height":             maxH,
		"total_blocks":           totalBlocks,
		"start_height":           start,
		"total_transactions":     totalTxs,
		"total_events":           totalEvents,
		"total_addresses":        totalAddresses,
		"total_contracts":        totalContracts,
		"checkpoints":            checkpoints,
		"forward_enabled":        forwardEnabled,
		"history_enabled":        historyEnabled,
		"worker_enabled":         workerEnabled,
		"worker_config":          workerConfig,
		"generated_at":           time.Now().UTC().Format(time.RFC3339),
		"progress":               fmt.Sprintf("%.2f%%", progress),
		"behind":                 behind,
		"status":                 "ok",
		"indexed_ranges":         indexedRanges,
		"oldest_block_timestamp": oldestBlockTimestamp,
		"checkpoint_timestamps":  checkpointTimestamps,
		"error_summary":          errorSummary,
		"build_commit":           BuildCommit,
		"analytics_backfill":     s.backfillProgress.Snapshot(),
	}

	payload, err := json.Marshal(resp)
	if err != nil {
		return nil, err
	}

	return payload, nil
}

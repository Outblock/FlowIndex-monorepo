package api

import (
	"fmt"

	internalflow "flowscan-clone/internal/flow"
	"flowscan-clone/internal/ingester"
)

func (s *Server) newReprocessWorker(worker string) (ingester.Processor, error) {
	var historyFlowClient *internalflow.Client
	if hc, ok := s.historyClient.(*internalflow.Client); ok && hc != nil {
		historyFlowClient = hc
	}
	flowForProposer := s.historyClient
	if flowForProposer == nil {
		flowForProposer = s.client
	}

	switch worker {
	case "token_worker":
		return ingester.NewTokenWorker(s.repo), nil
	case "evm_worker":
		return ingester.NewEVMWorker(s.repo), nil
	case "meta_worker":
		return ingester.NewMetaWorker(s.repo, historyFlowClient), nil
	case "accounts_worker":
		return ingester.NewAccountsWorker(s.repo), nil
	case "tx_contracts_worker":
		return ingester.NewTxContractsWorker(s.repo), nil
	case "tx_metrics_worker":
		return ingester.NewTxMetricsWorker(s.repo), nil
	case "staking_worker":
		return ingester.NewStakingWorker(s.repo), nil
	case "defi_worker":
		return ingester.NewDefiWorker(s.repo), nil
	case "ft_holdings_worker":
		return ingester.NewFTHoldingsWorker(s.repo), nil
	case "nft_ownership_worker":
		return ingester.NewNFTOwnershipWorker(s.repo), nil
	case "daily_balance_worker":
		return ingester.NewDailyBalanceWorker(s.repo), nil
	case "daily_stats_worker":
		return ingester.NewDailyStatsWorker(s.repo), nil
	case "analytics_deriver_worker":
		return ingester.NewAnalyticsDeriverWorker(s.repo), nil
	case "scheduled_worker":
		return ingester.NewScheduledWorker(s.repo, nil), nil
	case "proposer_key_backfill":
		if flowForProposer == nil {
			return nil, fmt.Errorf("cannot resume %s: no Flow client configured", worker)
		}
		return ingester.NewProposerKeyBackfillWorker(s.repo, flowForProposer), nil
	default:
		return nil, fmt.Errorf("unsupported worker type: %s", worker)
	}
}

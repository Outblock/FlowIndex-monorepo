package ingester

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"flowscan-clone/internal/eventbus"
	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"
)

const schedulerAddress = "e467b9dd11fa00df"

// ScheduledWorker processes FlowTransactionScheduler events from raw.events
// and writes to app.scheduled_transactions.
type ScheduledWorker struct {
	repo *repository.Repository
	bus  *eventbus.Bus // nil when webhooks are not configured
}

func NewScheduledWorker(repo *repository.Repository, bus *eventbus.Bus) *ScheduledWorker {
	return &ScheduledWorker{repo: repo, bus: bus}
}

func (w *ScheduledWorker) Name() string {
	return "scheduled_worker"
}

func (w *ScheduledWorker) schedulerEventPrefix() string {
	return "A." + schedulerAddress + ".FlowTransactionScheduler."
}

func (w *ScheduledWorker) ProcessRange(ctx context.Context, fromHeight, toHeight uint64) error {
	events, err := w.repo.GetRawEventsInRange(ctx, fromHeight, toHeight)
	if err != nil {
		return fmt.Errorf("failed to fetch raw events: %w", err)
	}

	prefix := w.schedulerEventPrefix()

	var scheduled []models.ScheduledTransaction
	var executed []repository.ScheduledExecUpdate
	var canceled []repository.ScheduledCancelUpdate

	for _, evt := range events {
		if !strings.HasPrefix(evt.Type, prefix) {
			continue
		}

		fields, ok := parseCadenceEventFields(evt.Payload)
		if !ok {
			continue
		}

		eventName := evt.Type[len(prefix):]

		switch eventName {
		case "Scheduled":
			id, _ := strconv.ParseInt(extractString(fields["id"]), 10, 64)
			priority, _ := strconv.Atoi(extractString(fields["priority"]))
			effort, _ := strconv.ParseInt(extractString(fields["executionEffort"]), 10, 64)
			uuid, _ := strconv.ParseInt(extractString(fields["transactionHandlerUUID"]), 10, 64)
			fees := extractString(fields["fees"])
			owner := strings.TrimPrefix(strings.ToLower(extractString(fields["transactionHandlerOwner"])), "0x")
			handlerType := extractString(fields["transactionHandlerTypeIdentifier"])
			publicPath := extractString(fields["transactionHandlerPublicPath"])

			expectedTS := parseUFix64Timestamp(extractString(fields["timestamp"]))

			scheduled = append(scheduled, models.ScheduledTransaction{
				ScheduledID:       id,
				Priority:          priority,
				ExpectedTimestamp: expectedTS,
				ExecutionEffort:   effort,
				Fees:              fees,
				HandlerOwner:      owner,
				HandlerType:       handlerType,
				HandlerUUID:       uuid,
				HandlerPublicPath: publicPath,
				ScheduledBlock:    evt.BlockHeight,
				ScheduledTxID:     evt.TransactionID,
				ScheduledAt:       evt.Timestamp,
			})

		case "Executed":
			id, _ := strconv.ParseInt(extractString(fields["id"]), 10, 64)
			priority, _ := strconv.Atoi(extractString(fields["priority"]))
			effort, _ := strconv.ParseInt(extractString(fields["executionEffort"]), 10, 64)
			uuid, _ := strconv.ParseInt(extractString(fields["transactionHandlerUUID"]), 10, 64)
			owner := strings.TrimPrefix(strings.ToLower(extractString(fields["transactionHandlerOwner"])), "0x")
			handlerType := extractString(fields["transactionHandlerTypeIdentifier"])
			publicPath := extractString(fields["transactionHandlerPublicPath"])

			executed = append(executed, repository.ScheduledExecUpdate{
				ScheduledID:     id,
				Block:           evt.BlockHeight,
				TxID:            evt.TransactionID,
				Timestamp:       evt.Timestamp,
				Priority:        priority,
				ExecutionEffort: effort,
				HandlerOwner:    owner,
				HandlerType:     handlerType,
				HandlerUUID:     uuid,
				HandlerPath:     publicPath,
			})

		case "Canceled":
			id, _ := strconv.ParseInt(extractString(fields["id"]), 10, 64)
			canceled = append(canceled, repository.ScheduledCancelUpdate{
				ScheduledID:  id,
				Block:        evt.BlockHeight,
				TxID:         evt.TransactionID,
				Timestamp:    evt.Timestamp,
				FeesReturned: extractString(fields["feesReturned"]),
				FeesDeducted: extractString(fields["feesDeducted"]),
			})
		}
	}

	if len(scheduled) == 0 && len(executed) == 0 && len(canceled) == 0 {
		return nil
	}

	// Upsert scheduled entries
	if len(scheduled) > 0 {
		if err := w.repo.UpsertScheduledTransactions(ctx, scheduled); err != nil {
			return fmt.Errorf("failed to upsert scheduled transactions: %w", err)
		}
	}

	// Update executed
	if len(executed) > 0 {
		if err := w.repo.UpdateScheduledTransactionsExecuted(ctx, executed); err != nil {
			return fmt.Errorf("failed to update executed scheduled transactions: %w", err)
		}
	}

	// Publish executed events to the event bus for webhook delivery.
	// Safe to query has_activity here: UpdateScheduledTransactionsExecuted computes it
	// inline via correlated subquery, and raw.events are already ingested before workers run.
	if w.bus != nil && len(executed) > 0 {
		ids := make([]int64, len(executed))
		for i, e := range executed {
			ids[i] = e.ScheduledID
		}
		fullRecords, err := w.repo.GetScheduledTransactionsByIDs(ctx, ids)
		if err != nil {
			// Non-fatal: log and continue — missing a webhook is better than blocking ingestion
			fmt.Printf("[scheduled_worker] warning: failed to fetch records for webhook publishing: %v\n", err)
		} else {
			for i := range fullRecords {
				var ts time.Time
				var height uint64
				if fullRecords[i].ExecutedAt != nil {
					ts = *fullRecords[i].ExecutedAt
				}
				if fullRecords[i].ExecutedBlock != nil {
					height = *fullRecords[i].ExecutedBlock
				}
				w.bus.Publish(eventbus.Event{
					Type:      "scheduled.executed",
					Height:    height,
					Timestamp: ts,
					Data:      &fullRecords[i],
				})
			}
		}
	}

	// Update canceled
	if len(canceled) > 0 {
		if err := w.repo.UpdateScheduledTransactionsCanceled(ctx, canceled); err != nil {
			return fmt.Errorf("failed to update canceled scheduled transactions: %w", err)
		}
	}

	return nil
}

// parseUFix64Timestamp converts a UFix64 string like "1763051175.00000000" to time.Time.
func parseUFix64Timestamp(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return time.Time{}
	}
	sec := int64(f)
	nsec := int64((f - float64(sec)) * 1e9)
	if sec < 0 || sec > int64(math.MaxInt64/2) {
		return time.Unix(sec, 0).UTC()
	}
	return time.Unix(sec, nsec).UTC()
}

package ingester

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"flowscan-clone/internal/models"
	"flowscan-clone/internal/repository"
)

const schedulerAddress = "e467b9dd11fa00df"

// ScheduledWorker processes FlowTransactionScheduler events from raw.events
// and writes to app.scheduled_transactions.
type ScheduledWorker struct {
	repo *repository.Repository
}

func NewScheduledWorker(repo *repository.Repository) *ScheduledWorker {
	return &ScheduledWorker{repo: repo}
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
			executed = append(executed, repository.ScheduledExecUpdate{
				ScheduledID: id,
				Block:       evt.BlockHeight,
				TxID:        evt.TransactionID,
				Timestamp:   evt.Timestamp,
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

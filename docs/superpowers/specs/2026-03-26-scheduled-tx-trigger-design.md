# Scheduled Transaction Trigger for Sim Studio

**Date:** 2026-03-26
**Status:** Approved

## Summary

Add a `flow_scheduled_tx` trigger to Sim Studio that fires when a Flow `FlowTransactionScheduler.Executed` event is detected on-chain. This requires both backend event bus integration (so the webhook system can deliver scheduled tx events) and a new trigger definition in the sim-workflow app.

## Background

Flow's Forte upgrade (Oct 2025) introduced scheduled transactions — native blockchain cron jobs via `FlowTransactionScheduler`. The FlowIndex backend already indexes these in `app.scheduled_transactions` via `ScheduledWorker`, but does not yet publish them to the event bus for webhook delivery.

An "idle" run is a scheduled tx execution that produced no meaningful side effects (only system events from FlowTransactionScheduler, FlowToken, FlowFees, etc.). The `has_activity` flag on the DB record tracks this.

## Scope

- **In scope:** Backend event bus publishing for scheduled tx executions; new Sim Studio trigger with handler address and hide-idle filters
- **Out of scope:** Scheduled/Canceled lifecycle event triggers; creating/scheduling txs from Sim Studio; priority or effort filters

## Design

### Layer 1: Backend — Event Bus Integration

**Architectural note:** All other event types are published via `PublishFromBlock` in the orchestrator (called from the deriver pipeline). The scheduled transaction trigger publishes directly from `ScheduledWorker` instead, because the worker already has the parsed execution data and DB records — `PublishFromBlock` only receives data passed from the deriver callback, which does not include scheduled transaction records. The orchestrator automatically subscribes to all event types registered in the matcher registry (`orchestrator.go` line 51), so no orchestrator changes are needed.

#### 1.1 New event type: `scheduled.executed`

Add `"scheduled.executed"` to `SupportedEventTypes` in `backend/internal/webhooks/handlers.go`, in a new `// Scheduled transactions` section after the existing `// EVM` section. (Note: the existing `// Scheduled` comment on `"balance.check"` refers to the balance check scheduler, not on-chain scheduled transactions.)

#### 1.2 New matcher: `ScheduledExecutedMatcher`

File: `backend/internal/webhooks/matcher/scheduled_executed.go`

Imports: `"encoding/json"`, `"time"`, `"flowscan-clone/internal/models"`.

The handler address filter accepts both `0x`-prefixed and bare hex via the existing `normalizeAddress` helper.

```go
type scheduledExecutedConditions struct {
    HandlerOwner string `json:"handler_owner"`
    HideIdle     bool   `json:"hide_idle"`
}

type ScheduledExecutedMatcher struct{}

func (m *ScheduledExecutedMatcher) EventType() string { return "scheduled.executed" }

func (m *ScheduledExecutedMatcher) Match(data interface{}, conditions json.RawMessage) MatchResult {
    st, ok := data.(*models.ScheduledTransaction)
    if !ok {
        return MatchResult{}
    }

    var cond scheduledExecutedConditions
    if len(conditions) > 0 {
        if err := json.Unmarshal(conditions, &cond); err != nil {
            return MatchResult{}
        }
    }

    // Filter by handler owner address (both 0x-prefixed and bare hex accepted)
    if cond.HandlerOwner != "" {
        if normalizeAddress(cond.HandlerOwner) != st.HandlerOwner {
            return MatchResult{}
        }
    }

    // Filter out idle runs if requested
    if cond.HideIdle && !st.HasActivity {
        return MatchResult{}
    }

    priority := "Unknown"
    switch st.Priority {
    case 0: priority = "High"
    case 1: priority = "Medium"
    case 2: priority = "Low"
    }

    eventData := map[string]interface{}{
        "scheduled_id":  st.ScheduledID,
        "handler_owner": st.HandlerOwner,
        "handler_type":  st.HandlerType,
        "handler_uuid":  st.HandlerUUID,
        "priority":      priority,
        "has_activity":  st.HasActivity,
        "fees":          st.Fees,
        "block_height":  0,
        "timestamp":     "",
    }

    if st.ExecutedBlock != nil {
        eventData["block_height"] = *st.ExecutedBlock
    }
    if st.ExecutedTxID != nil {
        eventData["executed_tx_id"] = *st.ExecutedTxID
    }
    if st.ExecutedAt != nil {
        eventData["timestamp"] = st.ExecutedAt.Format(time.RFC3339)
    }

    return MatchResult{Matched: true, EventData: eventData}
}
```

Register in `RegisterAll()` in `matcher.go`.

#### 1.3 Publish from ScheduledWorker

Modify `backend/internal/ingester/scheduled_worker.go`:

- Add `bus *eventbus.Bus` field to `ScheduledWorker`
- Update constructor: `NewScheduledWorker(repo *repository.Repository, bus *eventbus.Bus)`
- After updating executed entries in DB, query the full records back from `app.scheduled_transactions` (to get computed `has_activity`). This is safe because `has_activity` is computed inline via a correlated subquery in `UpdateScheduledTransactionsExecuted`, and the raw events for the executor transaction are already ingested before any worker runs (both the Scheduled events and the executor's events live in the same block range).
- Publish each as:
  ```go
  w.bus.Publish(eventbus.Event{
      Type:      "scheduled.executed",
      Height:    exec.Block,
      Timestamp: exec.Timestamp,
      Data:      &fullRecord,
  })
  ```

#### 1.4 Wire up in main.go

Pass the event bus instance to `NewScheduledWorker(repo, bus)`.

### Layer 2: Sim Studio — Trigger Definition

#### 2.1 New trigger config

File: `sim-workflow/apps/sim/triggers/flow/scheduled_tx.ts`

**Naming note:** The existing `schedule.ts` defines `flow_schedule` — a cron-based time trigger ("run every 5 minutes"). This new `scheduled_tx.ts` defines `flow_scheduled_tx` — an on-chain event trigger that fires when `FlowTransactionScheduler.Executed` is detected. The IDs are intentionally distinct.

- **ID:** `flow_scheduled_tx`
- **Name:** `Flow Scheduled TX Executed`
- **Provider:** `flow`
- **Filters (subBlocks):**
  - `handlerAddress` — short-input, optional, filters by handler owner address
  - `hideIdle` — dropdown (Show all / Hide idle runs), filters out no-op executions
- **Outputs:**
  - `scheduledId` (number) — Scheduled transaction ID
  - `handlerOwner` (string) — Handler owner address
  - `handlerType` (string) — Handler type identifier (e.g. `A.xxx.FlowCron.Executor`)
  - `priority` (string) — High/Medium/Low
  - `executedTxId` (string) — Executor transaction ID
  - `blockHeight` (number) — Execution block height
  - `timestamp` (string) — Execution timestamp
  - `isIdle` (boolean) — Whether the run was idle
  - `data` (json) — Full `ScheduledTransaction` model (all fields from the DB record, serialized as JSON via the orchestrator's `evt.Data`)

#### 2.2 Registration

- `triggers/flow/constants.ts` — Add `{ label: 'Scheduled TX', id: 'flow_scheduled_tx' }` to `FLOW_TRIGGER_OPTIONS`
- `triggers/flow/index.ts` — Export `flowScheduledTxTrigger`
- `triggers/registry.ts` — Import and add to registry object

#### 2.3 Block definition

In `blocks/blocks/flow_triggers.ts`:

```typescript
export const FlowScheduledTxTriggerBlock = createFlowTriggerBlock({
  type: 'flow_scheduled_tx_trigger',
  name: 'Flow Scheduled TX',
  description: 'Trigger on scheduled transaction executions on Flow',
  triggerId: 'flow_scheduled_tx',
  triggerLabel: 'Scheduled TX',
})
```

Register in `blocks/registry.ts`.

#### 2.4 Webhook normalization

In `lib/flow/normalize-webhook-payload.ts`, add a branch for `triggerId === 'flow_scheduled_tx'` that maps backend fields to trigger output fields:

- `data.scheduled_id` → `scheduledId`
- `data.handler_owner` → `handlerOwner` (with `normalizeFlowAddress`)
- `data.handler_type` → `handlerType`
- `data.priority` → `priority`
- `data.executed_tx_id` → `executedTxId`
- `!data.has_activity` → `isIdle`
- Standard `blockHeight`, `timestamp`, `data`, `raw`

## Files Changed

| Layer | File | Change |
|-------|------|--------|
| Backend | `internal/webhooks/handlers.go` | Add `"scheduled.executed"` to `SupportedEventTypes` |
| Backend | `internal/webhooks/matcher/scheduled_executed.go` | New `ScheduledExecutedMatcher` |
| Backend | `internal/webhooks/matcher/matcher.go` | Register in `RegisterAll` |
| Backend | `internal/ingester/scheduled_worker.go` | Add bus field, publish on execution |
| Backend | `main.go` | Pass bus to `NewScheduledWorker` |
| Sim Studio | `triggers/flow/scheduled_tx.ts` | New trigger config |
| Sim Studio | `triggers/flow/constants.ts` | Add to `FLOW_TRIGGER_OPTIONS` |
| Sim Studio | `triggers/flow/index.ts` | Export new trigger |
| Sim Studio | `triggers/registry.ts` | Register trigger |
| Sim Studio | `blocks/blocks/flow_triggers.ts` | New `FlowScheduledTxTriggerBlock` |
| Sim Studio | `blocks/registry.ts` | Register block |
| Sim Studio | `lib/flow/normalize-webhook-payload.ts` | Add normalization branch |

## Testing

- **Backend:** Unit test for `ScheduledExecutedMatcher` with cases: (a) matching handler + active, (b) matching handler + idle with hide_idle=true (should not match), (c) non-matching handler, (d) no conditions (match-all), (e) idle with hide_idle=false (should match). Follow pattern from `staking_event.go`.
- **Sim Studio:** Verify trigger appears in UI dropdown, test with sample webhook payload
- **Integration:** Deploy, schedule a test tx on testnet, confirm webhook fires and workflow executes

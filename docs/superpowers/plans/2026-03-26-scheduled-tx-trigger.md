# Scheduled TX Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `flow_scheduled_tx` trigger to Sim Studio that fires when a Flow scheduled transaction executes on-chain, with handler address and idle filters.

**Architecture:** Backend ScheduledWorker publishes `scheduled.executed` events to the event bus (nil-safe, since bus only exists when webhooks are configured). A new matcher filters by handler owner and idle status. Sim Studio gets a new trigger config, block, and normalization branch following existing Flow trigger patterns.

**Tech Stack:** Go (backend matcher + worker), TypeScript/React (sim-workflow trigger + block)

**Spec:** `docs/superpowers/specs/2026-03-26-scheduled-tx-trigger-design.md`

---

## File Structure

### Backend (Go)

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/internal/webhooks/matcher/scheduled_executed.go` | Create | `ScheduledExecutedMatcher` — condition matching for handler_owner + hide_idle |
| `backend/internal/webhooks/matcher/scheduled_executed_test.go` | Create | Unit tests for the matcher |
| `backend/internal/webhooks/matcher/matcher.go:79` | Modify | Register `ScheduledExecutedMatcher` in `RegisterAll` |
| `backend/internal/webhooks/handlers.go:43-44` | Modify | Add `"scheduled.executed"` to `SupportedEventTypes` |
| `backend/internal/ingester/scheduled_worker.go` | Modify | Add optional `*eventbus.Bus`, publish on execution |
| `backend/internal/repository/query_scheduled.go` | Modify | Add `GetScheduledTransactionsByIDs` batch query |
| `backend/main.go:302,365,609` | Modify | Pass bus to ScheduledWorker (nil when webhooks disabled) |

### Sim Studio (TypeScript)

| File | Action | Responsibility |
|------|--------|---------------|
| `sim-workflow/apps/sim/triggers/flow/scheduled_tx.ts` | Create | Trigger config with filters and outputs |
| `sim-workflow/apps/sim/triggers/flow/constants.ts:11` | Modify | Add to `FLOW_TRIGGER_OPTIONS` |
| `sim-workflow/apps/sim/triggers/flow/index.ts:10` | Modify | Export new trigger |
| `sim-workflow/apps/sim/triggers/registry.ts:73,254` | Modify | Import + register trigger |
| `sim-workflow/apps/sim/blocks/blocks/flow_triggers.ts:125` | Modify | Add `FlowScheduledTxTriggerBlock` |
| `sim-workflow/apps/sim/blocks/registry.ts:93,346` | Modify | Import + register block |
| `sim-workflow/apps/sim/lib/flow/normalize-webhook-payload.ts:109` | Modify | Add normalization branch |

---

## Task 1: Backend Matcher

**Files:**
- Create: `backend/internal/webhooks/matcher/scheduled_executed.go`
- Create: `backend/internal/webhooks/matcher/scheduled_executed_test.go`

- [ ] **Step 1: Write the matcher**

Create `backend/internal/webhooks/matcher/scheduled_executed.go`:

```go
package matcher

import (
	"encoding/json"
	"time"

	"flowscan-clone/internal/models"
)

type scheduledExecutedConditions struct {
	HandlerOwner string `json:"handler_owner"`
	HideIdle     bool   `json:"hide_idle"`
}

// ScheduledExecutedMatcher matches scheduled transaction execution events.
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
	case 0:
		priority = "High"
	case 1:
		priority = "Medium"
	case 2:
		priority = "Low"
	}

	eventData := map[string]interface{}{
		"scheduled_id":  st.ScheduledID,
		"handler_owner": st.HandlerOwner,
		"handler_type":  st.HandlerType,
		"handler_uuid":  st.HandlerUUID,
		"priority":      priority,
		"has_activity":  st.HasActivity,
		"fees":          st.Fees,
		"block_height":  uint64(0),
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

- [ ] **Step 2: Write tests**

Create `backend/internal/webhooks/matcher/scheduled_executed_test.go`:

```go
package matcher

import (
	"encoding/json"
	"testing"
	"time"

	"flowscan-clone/internal/models"
)

func TestScheduledExecutedMatcher_EventType(t *testing.T) {
	m := &ScheduledExecutedMatcher{}
	if m.EventType() != "scheduled.executed" {
		t.Fatalf("expected scheduled.executed, got %s", m.EventType())
	}
}

func makeScheduledTx(owner string, active bool, priority int) *models.ScheduledTransaction {
	block := uint64(100)
	txID := "abc123"
	now := time.Now()
	return &models.ScheduledTransaction{
		ScheduledID:   42,
		Priority:      priority,
		HandlerOwner:  owner,
		HandlerType:   "A.1234.FlowCron.Executor",
		HandlerUUID:   99,
		Fees:          "1.0",
		HasActivity:   active,
		ExecutedBlock: &block,
		ExecutedTxID:  &txID,
		ExecutedAt:    &now,
	}
}

func TestScheduledExecutedMatcher_NoConditions(t *testing.T) {
	m := &ScheduledExecutedMatcher{}
	st := makeScheduledTx("abcdef1234567890", true, 0)
	result := m.Match(st, nil)
	if !result.Matched {
		t.Fatal("expected match with no conditions")
	}
	if result.EventData["priority"] != "High" {
		t.Fatalf("expected High priority, got %v", result.EventData["priority"])
	}
}

func TestScheduledExecutedMatcher_HandlerOwnerMatch(t *testing.T) {
	m := &ScheduledExecutedMatcher{}
	st := makeScheduledTx("abcdef1234567890", true, 1)

	// Match with 0x prefix
	cond, _ := json.Marshal(scheduledExecutedConditions{HandlerOwner: "0xabcdef1234567890"})
	result := m.Match(st, cond)
	if !result.Matched {
		t.Fatal("expected match with 0x prefix")
	}

	// No match with different address
	cond, _ = json.Marshal(scheduledExecutedConditions{HandlerOwner: "0x1111111111111111"})
	result = m.Match(st, cond)
	if result.Matched {
		t.Fatal("expected no match with different address")
	}
}

func TestScheduledExecutedMatcher_HideIdle(t *testing.T) {
	m := &ScheduledExecutedMatcher{}

	// Idle run with hide_idle=true -> no match
	idleSt := makeScheduledTx("abcdef1234567890", false, 2)
	cond, _ := json.Marshal(scheduledExecutedConditions{HideIdle: true})
	result := m.Match(idleSt, cond)
	if result.Matched {
		t.Fatal("expected no match for idle run with hide_idle=true")
	}

	// Idle run with hide_idle=false -> match
	cond, _ = json.Marshal(scheduledExecutedConditions{HideIdle: false})
	result = m.Match(idleSt, cond)
	if !result.Matched {
		t.Fatal("expected match for idle run with hide_idle=false")
	}

	// Active run with hide_idle=true -> match
	activeSt := makeScheduledTx("abcdef1234567890", true, 2)
	cond, _ = json.Marshal(scheduledExecutedConditions{HideIdle: true})
	result = m.Match(activeSt, cond)
	if !result.Matched {
		t.Fatal("expected match for active run with hide_idle=true")
	}
}

func TestScheduledExecutedMatcher_WrongType(t *testing.T) {
	m := &ScheduledExecutedMatcher{}
	result := m.Match("not a scheduled tx", nil)
	if result.Matched {
		t.Fatal("expected no match for wrong data type")
	}
}

func TestScheduledExecutedMatcher_PriorityLabels(t *testing.T) {
	m := &ScheduledExecutedMatcher{}
	for _, tc := range []struct {
		pri   int
		label string
	}{
		{0, "High"},
		{1, "Medium"},
		{2, "Low"},
		{99, "Unknown"},
	} {
		st := makeScheduledTx("aaa", true, tc.pri)
		result := m.Match(st, nil)
		if result.EventData["priority"] != tc.label {
			t.Fatalf("priority %d: expected %s, got %v", tc.pri, tc.label, result.EventData["priority"])
		}
	}
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && go test ./internal/webhooks/matcher/ -run TestScheduledExecuted -v`
Expected: All 5 tests PASS

- [ ] **Step 4: Register matcher**

In `backend/internal/webhooks/matcher/matcher.go`, add to `RegisterAll` (after line 79, before the closing `}`):

```go
r.Register(&ScheduledExecutedMatcher{})
```

- [ ] **Step 5: Add event type to SupportedEventTypes**

In `backend/internal/webhooks/handlers.go`, add after line 42 (`"evm.transaction",`):

```go
// Scheduled transactions
"scheduled.executed",
```

And move the existing `// Scheduled` + `"balance.check",` comment to read `// Balance monitor` to avoid confusion.

- [ ] **Step 6: Run full matcher tests**

Run: `cd backend && go test ./internal/webhooks/matcher/ -v`
Expected: All tests PASS (existing + new)

- [ ] **Step 7: Commit**

```bash
git add backend/internal/webhooks/matcher/scheduled_executed.go \
       backend/internal/webhooks/matcher/scheduled_executed_test.go \
       backend/internal/webhooks/matcher/matcher.go \
       backend/internal/webhooks/handlers.go
git commit -m "feat(backend): add ScheduledExecutedMatcher for webhook system"
```

---

## Task 2: Backend Worker — Event Bus Publishing

**Files:**
- Modify: `backend/internal/ingester/scheduled_worker.go`
- Modify: `backend/internal/repository/query_scheduled.go`
- Modify: `backend/main.go`

- [ ] **Step 1: Add batch query to repository**

In `backend/internal/repository/query_scheduled.go`, add a new method after `GetScheduledTransactionByID` (after line ~228):

```go
// GetScheduledTransactionsByIDs returns scheduled transactions for the given IDs.
func (r *Repository) GetScheduledTransactionsByIDs(ctx context.Context, ids []int64) ([]models.ScheduledTransaction, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	q := `
		SELECT scheduled_id, priority, expected_timestamp, execution_effort, fees,
			encode(handler_owner, 'hex'), handler_type, handler_uuid, COALESCE(handler_public_path, ''),
			scheduled_block, encode(scheduled_tx_id, 'hex'), scheduled_at,
			status,
			executed_block, CASE WHEN executed_tx_id IS NOT NULL THEN encode(executed_tx_id, 'hex') ELSE NULL END,
			executed_at,
			fees_returned, fees_deducted,
			has_activity
		FROM app.scheduled_transactions
		WHERE scheduled_id = ANY($1)
	`
	rows, err := r.db.Query(ctx, q, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ScheduledTransaction
	for rows.Next() {
		var st models.ScheduledTransaction
		if err := scanScheduledTransaction(rows, &st); err != nil {
			return nil, err
		}
		result = append(result, st)
	}
	return result, rows.Err()
}
```

- [ ] **Step 2: Modify ScheduledWorker to accept optional bus**

In `backend/internal/ingester/scheduled_worker.go`, apply these changes:

Add import for `"flowscan-clone/internal/eventbus"`.

Change the struct and constructor:

```go
type ScheduledWorker struct {
	repo *repository.Repository
	bus  *eventbus.Bus // nil when webhooks are not configured
}

func NewScheduledWorker(repo *repository.Repository, bus *eventbus.Bus) *ScheduledWorker {
	return &ScheduledWorker{repo: repo, bus: bus}
}
```

After the executed update block (after the `if len(executed) > 0 { ... }` block, around line 125), add:

```go
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
```

- [ ] **Step 3: Update main.go — create bus early and share it**

In `backend/main.go`, the bus is currently created at line 609 inside the `if supabaseDBURL` block, but ScheduledWorker instances are created earlier (lines 302, 365). The fix is to create the bus unconditionally before the worker block — it's lightweight (just a map + mutex) and costs nothing if nobody subscribes.

Add before line 270 (before the live deriver processor list), adding `"flowscan-clone/internal/eventbus"` to the import block:

```go
// Event bus — created unconditionally; only active if webhooks subscribe to it.
scheduledBus := eventbus.New()
```

At line 609, change `bus := eventbus.New()` to:

```go
bus := scheduledBus
```

Update lines 302 and 365 to pass the bus:

```go
// Line 302 (live deriver):
processors = append(processors, ingester.NewScheduledWorker(repo, scheduledBus))

// Line 365 (history deriver):
{"scheduled_worker", enableScheduledWorker, func() ingester.Processor { return ingester.NewScheduledWorker(repo, scheduledBus) }},
```

- [ ] **Step 4: Run backend build**

Run: `cd backend && go build -o /dev/null main.go`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add backend/internal/ingester/scheduled_worker.go \
       backend/internal/repository/query_scheduled.go \
       backend/main.go
git commit -m "feat(backend): publish scheduled.executed events to event bus"
```

---

## Task 3: Sim Studio — Trigger Config

**Files:**
- Create: `sim-workflow/apps/sim/triggers/flow/scheduled_tx.ts`
- Modify: `sim-workflow/apps/sim/triggers/flow/constants.ts`
- Modify: `sim-workflow/apps/sim/triggers/flow/index.ts`
- Modify: `sim-workflow/apps/sim/triggers/registry.ts`

- [ ] **Step 1: Create trigger config**

Create `sim-workflow/apps/sim/triggers/flow/scheduled_tx.ts`:

```typescript
import { FlowIcon } from '@/components/icons'
import { buildTriggerSubBlocks } from '@/triggers'
import type { TriggerConfig } from '@/triggers/types'
import { FLOW_TRIGGER_OPTIONS, flowSetupInstructions } from './constants'

export const flowScheduledTxTrigger: TriggerConfig = {
  id: 'flow_scheduled_tx',
  name: 'Flow Scheduled TX Executed',
  provider: 'flow',
  description: 'Triggered when a scheduled transaction executes on Flow',
  version: '1.0.0',
  icon: FlowIcon,

  subBlocks: buildTriggerSubBlocks({
    triggerId: 'flow_scheduled_tx',
    triggerOptions: FLOW_TRIGGER_OPTIONS,
    setupInstructions: flowSetupInstructions('scheduled transaction execution'),
    hideWebhookUrl: true,
    extraFields: [
      {
        id: 'handlerAddress',
        title: 'Handler Address',
        type: 'short-input',
        placeholder: '0x... (handler owner address)',
        description: 'Only trigger for scheduled txs from this handler owner',
        mode: 'trigger',
        condition: { field: 'selectedTriggerId', value: 'flow_scheduled_tx' },
      },
      {
        id: 'hideIdle',
        title: 'Hide Idle Runs',
        type: 'dropdown',
        options: [
          { label: 'Show all executions', id: 'false' },
          { label: 'Hide idle (no-op) runs', id: 'true' },
        ],
        description: 'Filter out executions with no meaningful side effects',
        mode: 'trigger',
        condition: { field: 'selectedTriggerId', value: 'flow_scheduled_tx' },
      },
    ],
  }),

  outputs: {
    scheduledId: { type: 'number', description: 'Scheduled transaction ID' },
    handlerOwner: { type: 'string', description: 'Handler owner address' },
    handlerType: { type: 'string', description: 'Handler type identifier' },
    priority: { type: 'string', description: 'Priority level (High/Medium/Low)' },
    executedTxId: { type: 'string', description: 'Executor transaction ID' },
    blockHeight: { type: 'number', description: 'Execution block height' },
    timestamp: { type: 'string', description: 'Execution timestamp' },
    isIdle: { type: 'boolean', description: 'Whether the run was idle (no side effects)' },
    data: { type: 'json', description: 'Full scheduled transaction data' },
  },

  webhook: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  },
}
```

- [ ] **Step 2: Add to FLOW_TRIGGER_OPTIONS**

In `sim-workflow/apps/sim/triggers/flow/constants.ts`, add after line 11 (`{ label: 'Schedule', id: 'flow_schedule' },`):

```typescript
  { label: 'Scheduled TX', id: 'flow_scheduled_tx' },
```

- [ ] **Step 3: Export from index**

In `sim-workflow/apps/sim/triggers/flow/index.ts`, add after line 10 (`export { flowScheduleTrigger } from './schedule'`):

```typescript
export { flowScheduledTxTrigger } from './scheduled_tx'
```

- [ ] **Step 4: Register in trigger registry**

In `sim-workflow/apps/sim/triggers/registry.ts`:

Add to the import block (after `flowScheduleTrigger` on line 73):

```typescript
  flowScheduledTxTrigger,
```

Add to the registry object (after `flow_schedule: flowScheduleTrigger,` on line 254):

```typescript
  flow_scheduled_tx: flowScheduledTxTrigger,
```

- [ ] **Step 5: Commit**

```bash
git add sim-workflow/apps/sim/triggers/flow/scheduled_tx.ts \
       sim-workflow/apps/sim/triggers/flow/constants.ts \
       sim-workflow/apps/sim/triggers/flow/index.ts \
       sim-workflow/apps/sim/triggers/registry.ts
git commit -m "feat(sim-studio): add flow_scheduled_tx trigger config"
```

---

## Task 4: Sim Studio — Block + Normalization

**Files:**
- Modify: `sim-workflow/apps/sim/blocks/blocks/flow_triggers.ts`
- Modify: `sim-workflow/apps/sim/blocks/registry.ts`
- Modify: `sim-workflow/apps/sim/lib/flow/normalize-webhook-payload.ts`

- [ ] **Step 1: Add trigger block**

In `sim-workflow/apps/sim/blocks/blocks/flow_triggers.ts`, add after the `FlowScheduleTriggerBlock` definition (after line 125):

```typescript
export const FlowScheduledTxTriggerBlock = createFlowTriggerBlock({
  type: 'flow_scheduled_tx_trigger',
  name: 'Flow Scheduled TX',
  description: 'Trigger on scheduled transaction executions on Flow',
  triggerId: 'flow_scheduled_tx',
  triggerLabel: 'Scheduled TX',
})
```

- [ ] **Step 2: Register block**

In `sim-workflow/apps/sim/blocks/registry.ts`:

Add to the import block (after `FlowScheduleTriggerBlock,` on line 93):

```typescript
  FlowScheduledTxTriggerBlock,
```

Add to the registry object (after `flow_schedule_trigger: FlowScheduleTriggerBlock,` on line 346):

```typescript
  flow_scheduled_tx_trigger: FlowScheduledTxTriggerBlock,
```

- [ ] **Step 3: Add webhook normalization**

In `sim-workflow/apps/sim/lib/flow/normalize-webhook-payload.ts`, add a new branch before the final `return normalized` (before line 138):

```typescript
  if (triggerId === 'flow_scheduled_tx') {
    return {
      scheduledId: typeof data.scheduled_id === 'number' ? data.scheduled_id : 0,
      handlerOwner: normalizeFlowAddress(data.handler_owner),
      handlerType: typeof data.handler_type === 'string' ? data.handler_type : '',
      priority: typeof data.priority === 'string' ? data.priority : '',
      executedTxId: typeof data.executed_tx_id === 'string' ? data.executed_tx_id : '',
      blockHeight: normalized.blockHeight,
      timestamp: normalized.timestamp,
      isIdle: !data.has_activity,
      data: normalized.data,
      raw: normalized.raw,
    }
  }
```

- [ ] **Step 4: Verify sim-workflow builds**

Run: `cd sim-workflow && bun install && bun run --filter=sim build`
Expected: Build succeeds

If build command differs, check `sim-workflow/package.json` for the correct build script.

- [ ] **Step 5: Commit**

```bash
git add sim-workflow/apps/sim/blocks/blocks/flow_triggers.ts \
       sim-workflow/apps/sim/blocks/registry.ts \
       sim-workflow/apps/sim/lib/flow/normalize-webhook-payload.ts
git commit -m "feat(sim-studio): add scheduled tx trigger block + normalization"
```

---

## Task 5: Verification

- [ ] **Step 1: Run backend tests**

Run: `cd backend && go test ./internal/webhooks/matcher/ -v`
Expected: All tests PASS including new ScheduledExecuted tests

- [ ] **Step 2: Run backend build**

Run: `cd backend && go build -o /dev/null main.go`
Expected: Clean build

- [ ] **Step 3: Verify trigger registration**

Search for `flow_scheduled_tx` across the sim-workflow codebase to confirm it appears in:
- `triggers/flow/scheduled_tx.ts` (definition)
- `triggers/flow/constants.ts` (options)
- `triggers/flow/index.ts` (export)
- `triggers/registry.ts` (registry)
- `blocks/blocks/flow_triggers.ts` (block)
- `blocks/registry.ts` (block registry)
- `lib/flow/normalize-webhook-payload.ts` (normalization)

Total: 7 files referencing `flow_scheduled_tx`

- [ ] **Step 4: Final commit if any fixups needed**

Only if previous steps revealed issues that needed fixing.

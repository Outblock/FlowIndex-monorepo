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

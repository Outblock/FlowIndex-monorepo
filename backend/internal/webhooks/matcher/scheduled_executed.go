package matcher

import (
	"encoding/json"
	"strings"
	"time"

	"flowscan-clone/internal/models"
)

type scheduledExecutedConditions struct {
	HandlerOwner string `json:"handler_owner"`
	HandlerType  string `json:"handler_type"`
	HideIdle     bool   `json:"hide_idle"`
}

// ScheduledExecutedMatcher matches scheduled transaction execution events.
type ScheduledExecutedMatcher struct{}

func (m *ScheduledExecutedMatcher) EventType() string { return "scheduled.executed" }

func matchesScheduledHandlerType(filter, actual string) bool {
	filter = strings.TrimSpace(filter)
	actual = strings.TrimSpace(actual)
	if filter == "" {
		return true
	}
	if strings.EqualFold(filter, actual) {
		return true
	}

	parts := strings.Split(actual, ".")
	if len(parts) >= 3 && strings.EqualFold(filter, parts[2]) {
		return true
	}
	if len(parts) > 0 && strings.EqualFold(filter, parts[len(parts)-1]) {
		return true
	}

	return false
}

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

	// Accept either the full type identifier or the contract/type name users see in the UI.
	if cond.HandlerType != "" && !matchesScheduledHandlerType(cond.HandlerType, st.HandlerType) {
		return MatchResult{}
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

package ui

// execution_sse_allowlist_test.go pins the semantic-event ledger allow-list to
// the server's served set (contract/SPEC.md §7.6) — #233 phase 1.

import (
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func newSemanticLedgerTestApp() *App {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{ID: "msg_user_1", SessionID: "s1", Role: gact.RoleUser}}
	return a
}

func recordSemanticForTest(a *App, eventType, status string) {
	a.execution.recordSSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "msg_user_1",
			"event_type": eventType,
			"status":     status,
			"summary":    "summary of " + eventType,
			"actor":      map[string]any{"agent_id": "main"},
			"subject":    map[string]any{"agent_id": "geospatial"},
			"payload":    map[string]any{"parent_id": "main", "delegate_to": "geospatial"},
		}},
	})
}

// TestRecordSSESemanticAllowListMatchesServedSet syncs the TUI's semantic
// allow-list with what the server actually serves — contract/SPEC.md §7.6
// "Served allow-list": the ReAct trajectory atoms (react step / extract /
// expert response / expert lifecycle), the delegation atom on BOTH its
// prefixes (blueprint.delegation.* and plain delegation.*), and
// memory.search.completed. Semantic tool.call.* mirrors are filtered
// server-side (they reach the wire only when failed), so the ledger must not
// depend on them.
func TestRecordSSESemanticAllowListMatchesServedSet(t *testing.T) {
	served := []string{
		"react.step.completed",
		"expert.extract.completed",
		"expert.response.completed",
		"expert.lifecycle.started",
		"blueprint.delegation.started",
		"blueprint.delegation.completed",
		"blueprint.delegation.parent_resumed",
		"blueprint.delegation.failed",
		"delegation.started",
		"delegation.completed",
		"delegation.parent_resumed",
		"delegation.failed",
		"memory.search.completed",
	}
	for _, eventType := range served {
		a := newSemanticLedgerTestApp()
		recordSemanticForTest(a, eventType, "completed")
		events := a.execution.executionEventsBySession["s1"]
		if len(events) != 1 {
			t.Fatalf("served semantic event %q not recorded (got %d events)", eventType, len(events))
		}
		if events[0].Type != eventType {
			t.Fatalf("recorded type = %q, want %q", events[0].Type, eventType)
		}
	}

	// Types the server never serves on the live bus (captured durably only)
	// must not be recorded — including the semantic tool.call.* mirror.
	unserved := []string{
		"tool.call.started",
		"tool.call.completed",
		"turn.started",
		"lm.token.delta",
		"memory.compacted",
	}
	for _, eventType := range unserved {
		a := newSemanticLedgerTestApp()
		recordSemanticForTest(a, eventType, "completed")
		if got := len(a.execution.executionEventsBySession["s1"]); got != 0 {
			t.Fatalf("unserved semantic event %q should not be recorded, got %d events", eventType, got)
		}
	}
}

// TestRecordSSESemanticFailedStatusAlwaysRecorded pins the §7.6 status gate:
// ANY semantic event whose status is failed/error/cancelled reaches the wire
// (errors are first-class), so the ledger records it regardless of type.
func TestRecordSSESemanticFailedStatusAlwaysRecorded(t *testing.T) {
	for _, tc := range []struct {
		eventType string
		status    string
	}{
		{"turn.failed", "failed"},
		{"tool.call.completed", "failed"},
		{"tool.call.completed", "error"},
		{"agent.invocation.completed", "cancelled"},
	} {
		a := newSemanticLedgerTestApp()
		recordSemanticForTest(a, tc.eventType, tc.status)
		events := a.execution.executionEventsBySession["s1"]
		if len(events) != 1 {
			t.Fatalf("%s (status %s) should be recorded via the always-status gate, got %d events",
				tc.eventType, tc.status, len(events))
		}
		if events[0].Type != tc.eventType {
			t.Fatalf("recorded type = %q, want %q", events[0].Type, tc.eventType)
		}
	}
}

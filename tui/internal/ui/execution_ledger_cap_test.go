package ui

import (
	"strconv"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// ledgerDeltaSSE builds a recordable message.part.delta SSE event for sid.
func ledgerDeltaSSE(sid string, i int) client.SSEEvent {
	return client.SSEEvent{
		Type: "message.part.delta",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": sid,
			"turn_id":    "turn_1",
			"delta":      map[string]any{"text_append": "tok" + strconv.Itoa(i)},
		}},
	}
}

// TestExecutionLedgerStaysBounded feeds far more events than the cap and
// asserts the per-session ledger never exceeds executionLedgerMaxEvents and
// that drop-oldest retains the newest events (#231).
func TestExecutionLedgerStaysBounded(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	total := executionLedgerMaxEvents + 500
	for i := 0; i < total; i++ {
		a.execution.recordSSE(ledgerDeltaSSE("s1", i))
		if got := len(a.execution.executionEventsBySession["s1"]); got > executionLedgerMaxEvents {
			t.Fatalf("ledger exceeded cap after event %d: len=%d cap=%d", i, got, executionLedgerMaxEvents)
		}
	}
	events := a.execution.executionEventsBySession["s1"]
	if len(events) == 0 {
		t.Fatal("ledger should retain recent events, got 0")
	}
	last := events[len(events)-1]
	wantText := "tok" + strconv.Itoa(total-1)
	if got := stringValue(mapValue(last.Payload["delta"])["text_append"]); got != wantText {
		t.Fatalf("drop-oldest should keep newest event: last text = %q, want %q", got, wantText)
	}
}

// TestSessionClearedEmptiesExecutionLedger asserts session.cleared drops the
// cleared session's ledger (and only that session's), so Ctrl+E drill-down
// cannot reflect pre-/clear state (#231).
func TestSessionClearedEmptiesExecutionLedger(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.session.selected = 0
	a.execution.recordSSE(ledgerDeltaSSE("s1", 0))
	a.execution.recordSSE(ledgerDeltaSSE("s2", 0))
	if len(a.execution.executionEventsBySession["s1"]) != 1 || len(a.execution.executionEventsBySession["s2"]) != 1 {
		t.Fatalf("fixture setup: ledgers not seeded: %v", a.execution.executionEventsBySession)
	}

	a.conversation.applySSE(client.SSEEvent{
		Type: "session.cleared",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
		}},
	})

	if got := len(a.execution.executionEventsBySession["s1"]); got != 0 {
		t.Fatalf("session.cleared should empty s1 ledger, got %d events", got)
	}
	if got := len(a.execution.executionEventsBySession["s2"]); got != 1 {
		t.Fatalf("session.cleared for s1 should not touch s2 ledger, got %d events", got)
	}
}

// TestSessionsRefreshedDropsClosedSessionLedgers asserts that when a session
// disappears from the refreshed session list (deleted/closed), its ledger is
// dropped while surviving sessions keep theirs (#231).
func TestSessionsRefreshedDropsClosedSessionLedgers(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.session.selected = 0
	a.execution.recordSSE(ledgerDeltaSSE("s1", 0))
	a.execution.recordSSE(ledgerDeltaSSE("s2", 0))

	_, _ = a.Update(sessionsRefreshedMsg{sessions: []gact.Session{{ID: "s1"}}})

	if _, ok := a.execution.executionEventsBySession["s2"]; ok {
		t.Fatal("closed session s2 should have its ledger dropped on refresh")
	}
	if got := len(a.execution.executionEventsBySession["s1"]); got != 1 {
		t.Fatalf("surviving session s1 should keep its ledger, got %d events", got)
	}
}

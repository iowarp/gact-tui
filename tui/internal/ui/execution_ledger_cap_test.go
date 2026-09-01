package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
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
	if got := valuefmt.StringValue(valuefmt.MapValue(last.Payload["delta"])["text_append"]); got != wantText {
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

// TestSessionsRefreshedNeverPrunesExecutionLedgers is the regression test for
// the rejected blanket prune: sessionsRefreshedMsg payloads are FILTERED
// session lists — reloadSessionsForView fetches with the Archived filter, and
// every list is workspace-scoped — so a live session's absence from one never
// proves deletion. Pruning on refresh destroyed live sessions' ledgers
// irreversibly, because lastSeenSeqIDBySession suppresses SSE replay on
// revisit. Toggling the archived sidebar view (archived-only payload, or an
// empty one when nothing is archived) must leave live ledgers intact (#231).
func TestSessionsRefreshedNeverPrunesExecutionLedgers(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.session.selected = 0
	a.execution.recordSSE(ledgerDeltaSSE("s1", 0))
	a.execution.recordSSE(ledgerDeltaSSE("s2", 0))

	// Archived-view toggle: the refreshed payload lists only archived (or,
	// equally, only another workspace's) sessions — none of the live ones.
	model, _ := a.Update(sessionsRefreshedMsg{sessions: []gact.Session{{ID: "arch1"}}})
	a = model.(*App)
	for _, sid := range []string{"s1", "s2"} {
		if got := len(a.execution.executionEventsBySession[sid]); got != 1 {
			t.Fatalf("filtered refresh (archived-only list) must not prune %s ledger: got %d events, want 1", sid, got)
		}
	}

	// Empty payload: archived view with nothing archived (or an empty
	// workspace) — still no proof that any session was deleted.
	model, _ = a.Update(sessionsRefreshedMsg{})
	a = model.(*App)
	for _, sid := range []string{"s1", "s2"} {
		if got := len(a.execution.executionEventsBySession[sid]); got != 1 {
			t.Fatalf("empty refresh must not prune %s ledger: got %d events, want 1", sid, got)
		}
	}
}

// TestDeleteSessionFlowDropsOnlyDeletedLedger drives the real delete flow —
// arm + confirm x on the selected session, then run the returned commands
// through Update the way the tea runtime would — and asserts the confirmed
// deletion drops exactly the deleted session's execution ledger while the
// survivor keeps its events, even though the post-delete re-list is (like
// every session list) a filtered, workspace-scoped payload (#231).
func TestDeleteSessionFlowDropsOnlyDeletedLedger(t *testing.T) {
	var deletes atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/v1/sessions/") {
			deletes.Add(1)
			_, _ = w.Write([]byte(`{}`))
			return
		}
		// Post-delete re-list: only the surviving session remains.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sessions": []map[string]any{{"id": "s2", "title": "second"}},
		})
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "s1", Title: "first"}, {ID: "s2", Title: "second"}}
	a.session.selected = 0
	a.session.wsID = "ws_a"
	a.execution.recordSSE(ledgerDeltaSSE("s1", 0))
	a.execution.recordSSE(ledgerDeltaSSE("s2", 0))

	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"}) // arm
	_, cmd := a.sidebar.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if cmd == nil {
		t.Fatal("confirmed delete should dispatch a command")
	}
	msg := cmd()
	for i := 0; i < 4 && msg != nil; i++ {
		model, next := a.Update(msg)
		a = model.(*App)
		if _, isRefresh := msg.(sessionsRefreshedMsg); isRefresh {
			break // sidebar refresh applied; stop before selection I/O commands
		}
		if next == nil {
			break
		}
		msg = next()
	}

	if got := deletes.Load(); got != 1 {
		t.Fatalf("DELETE count = %d, want 1", got)
	}
	if _, ok := a.execution.executionEventsBySession["s1"]; ok {
		t.Fatal("deleted session s1 should have its execution ledger dropped")
	}
	if got := len(a.execution.executionEventsBySession["s2"]); got != 1 {
		t.Fatalf("surviving session s2 should keep its ledger, got %d events", got)
	}
}

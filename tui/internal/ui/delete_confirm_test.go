package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeDeleteConfirmApp returns an App focused on the sidebar with two
// sessions, and a spy counter the tests use to assert whether the
// DELETE /v1/sessions/{id} endpoint was actually hit.
func makeDeleteConfirmApp(t *testing.T) (*App, *atomic.Int32) {
	t.Helper()
	var deletes atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/v1/sessions/") {
			deletes.Add(1)
			_, _ = w.Write([]byte(`{}`))
			return
		}
		// Reply with an empty list / empty object for any other probe.
		_ = json.NewEncoder(w).Encode(map[string]any{"sessions": []any{}})
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first"},
		{ID: "s2", Title: "second"},
	}
	a.selected = 0
	a.wsID = "ws_a"
	return a, &deletes
}

func TestDeleteConfirm_FirstXArmsAndShowsHint(t *testing.T) {
	a, deletes := makeDeleteConfirmApp(t)
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if cmd != nil {
		t.Error("first x should not dispatch a delete cmd")
	}
	if a.pendingDeleteSessionID != "s1" {
		t.Errorf("pendingDeleteSessionID = %q, want s1", a.pendingDeleteSessionID)
	}
	if !strings.Contains(a.transientHint, "press x again") {
		t.Errorf("hint = %q, want confirm prompt", a.transientHint)
	}
	if deletes.Load() != 0 {
		t.Errorf("no DELETE should have fired yet, got %d", deletes.Load())
	}
}

func TestDeleteConfirm_SecondXCommits(t *testing.T) {
	a, deletes := makeDeleteConfirmApp(t)
	// Arm.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	// Commit.
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if cmd == nil {
		t.Fatal("second x should dispatch delete cmd")
	}
	if a.pendingDeleteSessionID != "" {
		t.Errorf("pendingDeleteSessionID = %q, want cleared", a.pendingDeleteSessionID)
	}
	// Actually run the cmd so the HTTP request fires against the spy.
	msg := cmd()
	_ = msg
	if deletes.Load() != 1 {
		t.Errorf("DELETE count = %d, want 1", deletes.Load())
	}
}

func TestDeleteConfirm_OtherKeyCancels(t *testing.T) {
	a, deletes := makeDeleteConfirmApp(t)
	// Arm via sidebar.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	// Press a non-x key through the top-level handleKey — that's where
	// the "any other key cancels" rule lives.
	a.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.pendingDeleteSessionID != "" {
		t.Errorf("pendingDeleteSessionID should be cleared by non-x key, got %q",
			a.pendingDeleteSessionID)
	}
	if deletes.Load() != 0 {
		t.Errorf("no DELETE should fire after cancel, got %d", deletes.Load())
	}
}

func TestDeleteConfirm_SelectSessionClearsArm(t *testing.T) {
	a, _ := makeDeleteConfirmApp(t)
	a.pendingDeleteSessionID = "s1"

	// Navigating to a different session via selectSession should wipe
	// the arm so a subsequent x on the new session isn't mis-read as
	// a confirm of the OLD session's arm.
	_ = a.selectSession(1)
	if a.pendingDeleteSessionID != "" {
		t.Errorf("selectSession should clear armed delete, got %q",
			a.pendingDeleteSessionID)
	}
}

func TestDeleteConfirm_XOnDifferentSessionRearmsNotCommit(t *testing.T) {
	// Edge case: user arms on s1, then navigates to s2, then presses
	// x. That's arming s2, not committing s1 (which was already
	// cleared by selectSession, but double-check the branch logic
	// still works if the state desyncs for any reason).
	a, deletes := makeDeleteConfirmApp(t)
	a.pendingDeleteSessionID = "s1"
	a.selected = 1 // s2 is now selected

	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if cmd != nil {
		t.Error("x on a different session than the armed one must arm, not commit")
	}
	if a.pendingDeleteSessionID != "s2" {
		t.Errorf("pendingDeleteSessionID = %q, want s2", a.pendingDeleteSessionID)
	}
	if deletes.Load() != 0 {
		t.Errorf("no DELETE should fire, got %d", deletes.Load())
	}
}

func TestDeleteRefresh_SelectedDeletedPicksSessionBelow(t *testing.T) {
	a, _ := makeDeleteConfirmApp(t)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first"},
		{ID: "s2", Title: "second"},
		{ID: "s3", Title: "third"},
	}
	a.selected = 1

	model, _ := a.Update(sessionsRefreshedMsg{
		sessions: []gact.Session{
			{ID: "s1", Title: "first"},
			{ID: "s3", Title: "third"},
		},
	})
	a = model.(*App)

	if a.selected != 1 {
		t.Fatalf("selected = %d, want 1", a.selected)
	}
	if got := a.sessions[a.selected].ID; got != "s3" {
		t.Fatalf("selected session = %q, want s3 below deleted row", got)
	}
}

func TestDeleteRefresh_SelectedDeletedLastPicksPrevious(t *testing.T) {
	a, _ := makeDeleteConfirmApp(t)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first"},
		{ID: "s2", Title: "second"},
		{ID: "s3", Title: "third"},
	}
	a.selected = 2

	model, _ := a.Update(sessionsRefreshedMsg{
		sessions: []gact.Session{
			{ID: "s1", Title: "first"},
			{ID: "s2", Title: "second"},
		},
	})
	a = model.(*App)

	if a.selected != 1 {
		t.Fatalf("selected = %d, want 1", a.selected)
	}
	if got := a.sessions[a.selected].ID; got != "s2" {
		t.Fatalf("selected session = %q, want s2 previous row", got)
	}
}

func TestSessionsRefreshUpdatesCurrentStatusForSelectedSession(t *testing.T) {
	a, _ := makeDeleteConfirmApp(t)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusRunning},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.currentStatus = gact.StatusRunning

	model, _ := a.Update(sessionsRefreshedMsg{
		sessions: []gact.Session{
			{ID: "s1", Title: "first", Status: gact.StatusIdle},
			{ID: "s2", Title: "second", Status: gact.StatusIdle},
		},
	})
	a = model.(*App)

	if a.selected != 0 {
		t.Fatalf("selected = %d, want 0", a.selected)
	}
	if a.currentStatus != gact.StatusIdle {
		t.Fatalf("currentStatus = %q, want idle after refresh", a.currentStatus)
	}
}

func TestSessionsRefreshClearsCurrentStatusWhenListEmpty(t *testing.T) {
	a, _ := makeDeleteConfirmApp(t)
	a.currentStatus = gact.StatusRunning

	model, _ := a.Update(sessionsRefreshedMsg{})
	a = model.(*App)

	if a.selected != -1 {
		t.Fatalf("selected = %d, want -1", a.selected)
	}
	if a.currentStatus != "" {
		t.Fatalf("currentStatus = %q, want empty", a.currentStatus)
	}
}

package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeFilterApp builds a sidebar-focused App with four distinctly-
// named sessions. The httptest server answers any request with an
// empty body so selectSession can fire without hanging during nav
// assertions.
func makeFilterApp(t *testing.T) *App {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "s1", Title: "refactor auth middleware"},
		{ID: "s2", Title: "fix deployment pipeline"},
		{ID: "s3", Title: "review the auth redesign"},
		{ID: "s4", Title: "write release notes"},
	}
	a.selected = 0
	return a
}

func TestSessionFilter_FEntersFilterMode(t *testing.T) {
	// `/` opens the global command palette regardless of focus
	// (universal TUI convention). The sidebar filter is bound to
	// `f` instead -- see handleSidebarKey in app.go.
	a := makeFilterApp(t)
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'f', Text: "f"})
	if !a.sessionFilterActive {
		t.Fatal("f should enter sidebar filter mode")
	}
}

func TestSessionFilter_TypingNarrowsTheList(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilterActive = true
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'a', Text: "a"})
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	a.handleSidebarKey(tea.KeyPressMsg{Code: 't', Text: "t"})
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'h', Text: "h"})
	if a.sessionFilter != "auth" {
		t.Errorf("filter = %q, want 'auth'", a.sessionFilter)
	}
	vis := a.visibleSessionIndexes()
	if len(vis) != 2 {
		t.Fatalf("visible = %d, want 2 (refactor auth middleware, review the auth redesign)", len(vis))
	}
	// Verify only the two "auth"-titled sessions are visible.
	for _, idx := range vis {
		if !strings.Contains(a.sessions[idx].Title, "auth") {
			t.Errorf("non-auth session visible: %q", a.sessions[idx].Title)
		}
	}
}

func TestSessionFilter_BackspaceDeletesLastRune(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilterActive = true
	a.sessionFilter = "auth"
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.sessionFilter != "aut" {
		t.Errorf("after backspace = %q, want 'aut'", a.sessionFilter)
	}
	// Backspace on empty filter is a no-op, not a panic.
	a.sessionFilter = ""
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.sessionFilter != "" {
		t.Errorf("empty backspace mutated filter to %q", a.sessionFilter)
	}
}

func TestSessionFilter_EnterCommitsExitsMode(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilterActive = true
	a.sessionFilter = "auth"
	a.filterSnapshot = ""

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.sessionFilterActive {
		t.Error("Enter should exit edit mode")
	}
	if a.sessionFilter != "auth" {
		t.Errorf("Enter should keep filter, got %q", a.sessionFilter)
	}
	if a.filterSnapshot != "" {
		t.Errorf("snapshot should clear on commit, got %q", a.filterSnapshot)
	}
}

func TestSessionFilter_EscRestoresSnapshot(t *testing.T) {
	// User had a committed filter "auth", pressed `f` to re-edit, typed
	// more chars, then Esc'd. Should revert to "auth", not clear.
	a := makeFilterApp(t)
	a.sessionFilter = "auth"
	// Entering edit mode via `f` snapshots the current filter.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'f', Text: "f"})
	if a.filterSnapshot != "auth" {
		t.Errorf("snapshot after / = %q, want 'auth'", a.filterSnapshot)
	}
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'X', Text: "X"})
	if a.sessionFilter != "authX" {
		t.Errorf("mid-edit filter = %q, want 'authX'", a.sessionFilter)
	}
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.sessionFilterActive {
		t.Error("Esc should exit edit mode")
	}
	if a.sessionFilter != "auth" {
		t.Errorf("Esc should restore snapshot, got %q", a.sessionFilter)
	}
}

func TestSessionFilter_NavSkipsHiddenSessions(t *testing.T) {
	// Filter to sessions matching "auth" (s1 and s3); pressing ↓ from
	// s1 should jump to s3, not to s2 (which is hidden).
	a := makeFilterApp(t)
	a.sessionFilter = "auth"
	a.selected = 0 // s1 is visible, selected

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.selected != 2 { // s3
		t.Errorf("↓ jumped to %d, want 2 (skipping hidden s2)", a.selected)
	}
	// ↓ again should stay at last visible.
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.selected != 2 {
		t.Errorf("↓ at last visible should clamp, got %d", a.selected)
	}
}

func TestSessionFilter_GJumpsToFirstVisible(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilter = "release" // matches s4 only
	a.selected = 0              // currently on hidden s1

	a.handleSidebarKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if a.selected != 3 { // s4
		t.Errorf("g with filter should land on first visible (s4=3), got %d", a.selected)
	}
}

func TestSessionFilter_EnsureSelectedVisible_FindsFirstMatch(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilter = "pipeline"
	a.selected = 0 // s1 hidden under the new filter

	a.ensureSelectedVisible()
	if a.selected != 1 { // s2 "fix deployment pipeline"
		t.Errorf("ensureSelectedVisible = %d, want 1", a.selected)
	}
}

func TestSessionFilter_EnsureSelectedVisible_KeepsOnEmptyMatch(t *testing.T) {
	// When the filter matches nothing, selection should stay put so
	// clearing the filter restores the user's position.
	a := makeFilterApp(t)
	a.sessionFilter = "nonexistent"
	a.selected = 2

	a.ensureSelectedVisible()
	if a.selected != 2 {
		t.Errorf("empty-match selection mutated to %d", a.selected)
	}
}

func TestSessionFilter_CaseInsensitiveMatch(t *testing.T) {
	a := makeFilterApp(t)
	a.sessionFilter = "AUTH"
	vis := a.visibleSessionIndexes()
	if len(vis) != 2 {
		t.Errorf("case-insensitive: visible = %d, want 2", len(vis))
	}
}

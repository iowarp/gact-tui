package ui

import (
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestSSEHealthDot_ReflectsStage covers V2: the helper returns a glyph whose
// color maps to the current SSE state.
func TestSSEHealthDot_ReflectsStage(t *testing.T) {
	a := newReadyApp(nil, nil)
	if got := ansi.Strip(a.connection.sseHealthDot()); got != "●" {
		t.Errorf("live dot glyph = %q, want '●'", got)
	}

	a.connection.sseBackoffAttempts = 3
	_ = a.connection.sseHealthDot()

	a.stage = StageConnecting
	a.connection.sseBackoffAttempts = 0
	_ = a.connection.sseHealthDot()
}

// TestWindowTitle_ReflectsActiveSession verifies window-title text for empty,
// idle, running, and permission-waiting states.
func TestWindowTitle_ReflectsActiveSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	if got := a.chrome.windowTitle(); got != "GACT" {
		t.Errorf("no-session title = %q, want 'GACT'", got)
	}

	idle := []gact.Session{{ID: "s1", Title: "refactor auth", Status: gact.StatusIdle}}
	a = newReadyApp(idle, nil)
	if got := a.chrome.windowTitle(); got != "GACT — refactor auth" {
		t.Errorf("idle title = %q", got)
	}

	running := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusRunning}}
	a = newReadyApp(running, nil)
	if got := a.chrome.windowTitle(); got != "GACT — demo (running)" {
		t.Errorf("running title = %q", got)
	}

	waiting := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusWaitingPermission}}
	a = newReadyApp(waiting, nil)
	if got := a.chrome.windowTitle(); got != "GACT — demo (waiting)" {
		t.Errorf("waiting title = %q", got)
	}
}

func TestWindowTitle_AppendsDetachedCount(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.BackendURL = "http://localhost:7777"

	if got := a.chrome.windowTitle(); got != "GACT" {
		t.Errorf("no-detach title = %q, want 'GACT'", got)
	}

	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
		{SessionID: "sess_b", Backend: "http://localhost:7777"},
		{SessionID: "sess_c", Backend: "http://localhost:7777"},
	})
	if got := a.chrome.windowTitle(); got != "GACT [↩3]" {
		t.Errorf("detach-only title = %q, want 'GACT [↩3]'", got)
	}

	running := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusRunning}}
	a = newReadyApp(running, nil)
	a.BackendURL = "http://localhost:7777"
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
	})
	if got := a.chrome.windowTitle(); got != "GACT — demo (running) [↩1]" {
		t.Errorf("combined title = %q", got)
	}
}

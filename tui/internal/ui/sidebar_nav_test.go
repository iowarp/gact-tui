package ui

import (
	"net/http"
	"net/http/httptest"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeSidebarApp builds an App with N synthetic sessions, focused on
// the sidebar with selected=0. Used by every test below; keeps each
// test focused on one navigation key without re-asserting the setup.
// We point the backing client at a httptest server that 404s everything
// so selectSession's downstream SSE dial fails immediately instead of
// waiting for the 10 s request timeout.
func makeSidebarApp(t *testing.T, n int) *App {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not used", http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	a := New(srv.URL)
	a.focus = FocusSidebar
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.selected = 0
	a.sessions = make([]gact.Session, n)
	for i := range a.sessions {
		a.sessions[i] = gact.Session{ID: "s" + string(rune('a'+i)), Title: "session"}
	}
	return a
}

func TestSidebarNav_GJumpsToFirst(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.selected = 25
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if a.selected != 0 {
		t.Errorf("after g: selected = %d, want 0", a.selected)
	}
}

func TestSidebarNav_ShiftGJumpsToLast(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.selected = 5
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'G', Text: "G", Mod: tea.ModShift})
	if a.selected != 39 {
		t.Errorf("after G: selected = %d, want 39", a.selected)
	}
}

func TestSidebarNav_PageDown(t *testing.T) {
	a := makeSidebarApp(t, 40)
	step := a.sidebarPageSize()
	if step <= 0 {
		t.Fatal("sidebarPageSize <= 0")
	}
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.selected != step {
		t.Errorf("after pgdown: selected = %d, want %d", a.selected, step)
	}
}

func TestSidebarNav_PageUpClampsAtZero(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.selected = 2
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyPgUp})
	if a.selected != 0 {
		t.Errorf("pgup from 2 should clamp to 0, got %d", a.selected)
	}
}

func TestSidebarNav_PageDownClampsAtLast(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.selected = 38
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.selected != 39 {
		t.Errorf("pgdown near end should clamp to 39, got %d", a.selected)
	}
}

func TestSidebarNav_GIsNoopAtFirst(t *testing.T) {
	a := makeSidebarApp(t, 10)
	a.selected = 0
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if cmd != nil {
		t.Error("g at first should not emit a Cmd (no reload)")
	}
}

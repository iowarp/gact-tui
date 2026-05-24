package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

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

func TestSidebarRendersChildSessionKindAndToolCount(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{
			ID:              "child",
			Title:           "csv_validator subagent",
			ParentSessionID: "parent",
			Status:          gact.StatusIdle,
			Agent:           gact.AgentRef{ID: "csv_validator", Mode: "subagent"},
			Metadata: map[string]any{
				"session_type": "nanoagent",
				"tool_count":   2.0,
			},
		},
	}
	a.selected = 1

	out := ansi.Strip(a.renderSidebar(42, 20))
	for _, want := range []string{"└─", "csv_validator subagent", "nanoagent · idle · 2 tools"} {
		if !strings.Contains(out, want) {
			t.Fatalf("sidebar missing child metadata %q:\n%s", want, out)
		}
	}
	if strings.Count(out, "└") != 1 {
		t.Fatalf("child connector should render once per row, got:\n%s", out)
	}
}

func TestSidebarCollapsesChildSessionsByDefault(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{
			ID:              "child",
			Title:           "csv_validator subagent",
			ParentSessionID: "parent",
			Status:          gact.StatusIdle,
			Metadata:        map[string]any{"session_type": "nanoagent"},
		},
	}
	a.selected = 0

	vis := a.visibleSessionIndexes()
	if len(vis) != 1 || vis[0] != 0 {
		t.Fatalf("collapsed children should leave only parent visible, got %v", vis)
	}
	out := ansi.Strip(a.renderSidebar(52, 20))
	if strings.Contains(out, "csv_validator subagent") {
		t.Fatalf("collapsed child title should not render:\n%s", out)
	}
	if !strings.Contains(out, "1 child session collapsed") {
		t.Fatalf("parent should show collapsed child count:\n%s", out)
	}
}

func TestSidebarToggleChildSessions(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if !a.showChildSessions {
		t.Fatal("c should expand child sessions")
	}
	vis := a.visibleSessionIndexes()
	if len(vis) != 2 {
		t.Fatalf("expanded children should be visible, got %v", vis)
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if a.showChildSessions {
		t.Fatal("second c should collapse child sessions")
	}
}

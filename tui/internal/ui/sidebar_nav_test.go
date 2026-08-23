package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
	a.session.selected = 0
	a.session.sessions = make([]gact.Session, n)
	for i := range a.session.sessions {
		a.session.sessions[i] = gact.Session{ID: "s" + string(rune('a'+i)), Title: "session"}
	}
	return a
}

func TestSidebarNav_GJumpsToFirst(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.session.selected = 25
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if a.session.selected != 0 {
		t.Errorf("after g: selected = %d, want 0", a.session.selected)
	}
}

func TestSidebarNav_ShiftGJumpsToLast(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.session.selected = 5
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'G', Text: "G", Mod: tea.ModShift})
	if a.session.selected != 39 {
		t.Errorf("after G: selected = %d, want 39", a.session.selected)
	}
}

func TestSidebarNav_PageDown(t *testing.T) {
	a := makeSidebarApp(t, 40)
	step := a.sidebar.pageSize()
	if step <= 0 {
		t.Fatal("sidebarPageSize <= 0")
	}
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.session.selected != step {
		t.Errorf("after pgdown: selected = %d, want %d", a.session.selected, step)
	}
}

func TestSidebarNav_PageUpClampsAtZero(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.session.selected = 2
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyPgUp})
	if a.session.selected != 0 {
		t.Errorf("pgup from 2 should clamp to 0, got %d", a.session.selected)
	}
}

func TestSidebarNav_PageDownClampsAtLast(t *testing.T) {
	a := makeSidebarApp(t, 40)
	a.session.selected = 38
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.session.selected != 39 {
		t.Errorf("pgdown near end should clamp to 39, got %d", a.session.selected)
	}
}

func TestSidebarNav_GIsNoopAtFirst(t *testing.T) {
	a := makeSidebarApp(t, 10)
	a.session.selected = 0
	_, cmd := a.sidebar.handleKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if cmd != nil {
		t.Error("g at first should not emit a Cmd (no reload)")
	}
}

func TestSidebarSectionsCanCollapseIndependently(t *testing.T) {
	a := makeSidebarApp(t, 1)
	a.session.sessions = []gact.Session{{ID: "parent", Title: "demo", Status: gact.StatusIdle}}
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.session.selected = 0

	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'S', Text: "S", Mod: tea.ModShift})
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'C', Text: "C", Mod: tea.ModShift})

	out := ansi.Strip(a.sidebar.render(42, 18))
	if !strings.Contains(out, "▸ SESSIONS") || strings.Contains(out, "○ demo") {
		t.Fatalf("collapsed sessions section should hide session rows:\n%s", out)
	}
	if !strings.Contains(out, "▸ CONTEXT · 1") || strings.Contains(out, "docs/readme.md") {
		t.Fatalf("collapsed context section should hide context file rows:\n%s", out)
	}
}

func TestUpFromFirstSessionFocusesSessionsHeader(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyUp, Text: "up"})
	if a.session.selected != 0 {
		t.Fatalf("selected changed to %d, want first session preserved", a.session.selected)
	}
	if !a.sidebar.sectionCursor || a.sidebar.sectionFocus != sidebarSectionSessions {
		t.Fatalf("up from first should focus sessions header, cursor=%v section=%v", a.sidebar.sectionCursor, a.sidebar.sectionFocus)
	}
	out := ansi.Strip(a.sidebar.render(42, 18))
	if !strings.Contains(out, "▌▾ SESSIONS") {
		t.Fatalf("sessions header should show cursor:\n%s", out)
	}
}

func TestLeftRightMoveSidebarSectionCursor(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.session.selected = 0

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyRight, Text: "right"})
	if !a.sidebar.sectionCursor || a.sidebar.sectionFocus != sidebarSectionContext {
		t.Fatalf("right should focus context section, cursor=%v section=%v", a.sidebar.sectionCursor, a.sidebar.sectionFocus)
	}
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyLeft, Text: "left"})
	if !a.sidebar.sectionCursor || a.sidebar.sectionFocus != sidebarSectionSessions {
		t.Fatalf("left should focus sessions section, cursor=%v section=%v", a.sidebar.sectionCursor, a.sidebar.sectionFocus)
	}
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	if a.sidebar.sectionCursor {
		t.Fatal("down from sessions header should return to the session list")
	}
	if a.session.selected != 0 {
		t.Fatalf("selected = %d, want first session preserved", a.session.selected)
	}
}

func TestCollapsedSidebarNavigatesSectionsNotSessions(t *testing.T) {
	a := makeSidebarApp(t, 3)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
		{ID: "s3", Title: "third", Status: gact.StatusIdle},
	}
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.session.selected = 1
	a.sidebar.sessionsCollapsed = true
	a.sidebar.sectionCursor = true
	a.sidebar.sectionFocus = sidebarSectionSessions

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	if a.session.selected != 1 {
		t.Fatalf("collapsed section navigation changed selected session to %d", a.session.selected)
	}
	if a.sidebar.sectionFocus != sidebarSectionContext {
		t.Fatalf("section focus = %v, want context", a.sidebar.sectionFocus)
	}
	out := ansi.Strip(a.sidebar.render(42, 18))
	if !strings.Contains(out, "▌▾ CONTEXT") {
		t.Fatalf("collapsed sidebar should show cursor on context header:\n%s", out)
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyUp, Text: "up"})
	if a.session.selected != 1 {
		t.Fatalf("moving section focus back changed selected session to %d", a.session.selected)
	}
	if a.sidebar.sectionFocus != sidebarSectionSessions {
		t.Fatalf("section focus = %v, want sessions", a.sidebar.sectionFocus)
	}
	out = ansi.Strip(a.sidebar.render(42, 18))
	if !strings.Contains(out, "▌▸ SESSIONS") {
		t.Fatalf("collapsed sidebar should show cursor on sessions header:\n%s", out)
	}
}

func TestCollapsedSidebarEnterExpandsSessionsAndKeepsCurrentSession(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.selected = 1
	a.sidebar.sessionsCollapsed = true
	a.sidebar.sectionCursor = true
	a.sidebar.sectionFocus = sidebarSectionSessions

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter, Text: "enter"})
	if a.sidebar.sessionsCollapsed {
		t.Fatal("enter on sessions header should expand the section")
	}
	if a.session.selected != 1 {
		t.Fatalf("selected = %d, want current session preserved", a.session.selected)
	}
	out := ansi.Strip(a.sidebar.render(42, 18))
	if !strings.Contains(out, "▌○ second") {
		t.Fatalf("expanded sidebar should restore cursor to current session:\n%s", out)
	}
}

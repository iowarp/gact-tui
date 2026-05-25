package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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
	for _, want := range []string{"└─", "CSV", "2t"} {
		if !strings.Contains(out, want) {
			t.Fatalf("sidebar missing child metadata %q:\n%s", want, out)
		}
	}
	if strings.Count(out, "└") != 1 {
		t.Fatalf("child connector should render once per row, got:\n%s", out)
	}
}

func TestSidebarRendersChildSessionOnOneCompactRow(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{
			ID:              "child",
			Title:           "analysis_validator subagent",
			ParentSessionID: "parent",
			Status:          gact.StatusIdle,
			Agent:           gact.AgentRef{ID: "analysis_validator", Mode: "subagent"},
			Metadata:        map[string]any{"tool_count": 2.0},
		},
	}
	a.selected = 0

	out := ansi.Strip(a.renderSidebar(56, 20))
	line := ""
	for _, candidate := range strings.Split(out, "\n") {
		if strings.Contains(candidate, "analysis") {
			line = candidate
			break
		}
	}
	if line == "" {
		t.Fatalf("child row missing from sidebar:\n%s", out)
	}
	if !strings.Contains(line, "2t") {
		t.Fatalf("child row should keep tool count on the title row, got %q\n%s", line, out)
	}
	if strings.Contains(out, "\n     idle · 2 tools") || strings.Contains(out, "\n     2t") {
		t.Fatalf("child status should not consume a separate sidebar row:\n%s", out)
	}
}

func TestSidebarExpandedChildrenRenderAsContinuousBranch(t *testing.T) {
	a := makeSidebarApp(t, 5)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "parent", Title: "demo cross_file_dirty", Status: gact.StatusIdle},
		{ID: "csv", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 1.0}},
		{ID: "analysis", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 2.0}},
		{ID: "adios", Title: "adios_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 1.0}},
		{ID: "data", Title: "data_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 2.0}},
	}
	a.selected = 0

	out := ansi.Strip(a.renderSidebar(42, 24))
	for _, want := range []string{"├─ ○ CSV · 1t", "├─ ○ analysis · 2t", "├─ ○ ADIOS · 1t", "└─ ○ data · 2t"} {
		if !strings.Contains(out, want) {
			t.Fatalf("sidebar missing compact branch row %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "\n\n") {
		t.Fatalf("session list should not contain blank spacer rows:\n%s", out)
	}
}

func TestSidebarSectionsCanCollapseIndependently(t *testing.T) {
	a := makeSidebarApp(t, 1)
	a.sessions = []gact.Session{{ID: "parent", Title: "demo", Status: gact.StatusIdle}}
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.selected = 0

	a.handleSidebarKey(tea.KeyPressMsg{Code: 'S', Text: "S", Mod: tea.ModShift})
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'C', Text: "C", Mod: tea.ModShift})

	out := ansi.Strip(a.renderSidebar(42, 18))
	if !strings.Contains(out, "▸ SESSIONS") || strings.Contains(out, "○ demo") {
		t.Fatalf("collapsed sessions section should hide session rows:\n%s", out)
	}
	if !strings.Contains(out, "▸ CONTEXT · 1") || strings.Contains(out, "docs/readme.md") {
		t.Fatalf("collapsed context section should hide context file rows:\n%s", out)
	}
}

func TestCollapsedSessionsHeaderUsesCompactCount(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "parent", Title: "demo", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.showChildSessions = true
	a.sidebarSessionsCollapsed = true
	a.sidebarSectionCursor = true
	a.sidebarSectionFocus = sidebarSectionSessions

	out := ansi.Strip(a.renderSidebar(24, 14))
	if !strings.Contains(out, "▌▸ SESSIONS (2)") {
		t.Fatalf("collapsed sessions header should fit as compact count:\n%s", out)
	}
	if strings.Contains(out, "children") || strings.Contains(out, "SESSIONS ·") {
		t.Fatalf("collapsed sessions header should not include dot-separated suffixes:\n%s", out)
	}
}

func TestUpFromFirstSessionFocusesSessionsHeader(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.selected = 0

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyUp, Text: "up"})
	if a.selected != 0 {
		t.Fatalf("selected changed to %d, want first session preserved", a.selected)
	}
	if !a.sidebarSectionCursor || a.sidebarSectionFocus != sidebarSectionSessions {
		t.Fatalf("up from first should focus sessions header, cursor=%v section=%v", a.sidebarSectionCursor, a.sidebarSectionFocus)
	}
	out := ansi.Strip(a.renderSidebar(42, 18))
	if !strings.Contains(out, "▌▾ SESSIONS") {
		t.Fatalf("sessions header should show cursor:\n%s", out)
	}
}

func TestLeftRightMoveSidebarSectionCursor(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.selected = 0

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyRight, Text: "right"})
	if !a.sidebarSectionCursor || a.sidebarSectionFocus != sidebarSectionContext {
		t.Fatalf("right should focus context section, cursor=%v section=%v", a.sidebarSectionCursor, a.sidebarSectionFocus)
	}
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyLeft, Text: "left"})
	if !a.sidebarSectionCursor || a.sidebarSectionFocus != sidebarSectionSessions {
		t.Fatalf("left should focus sessions section, cursor=%v section=%v", a.sidebarSectionCursor, a.sidebarSectionFocus)
	}
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	if a.sidebarSectionCursor {
		t.Fatal("down from sessions header should return to the session list")
	}
	if a.selected != 0 {
		t.Fatalf("selected = %d, want first session preserved", a.selected)
	}
}

func TestCollapsedSidebarNavigatesSectionsNotSessions(t *testing.T) {
	a := makeSidebarApp(t, 3)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
		{ID: "s3", Title: "third", Status: gact.StatusIdle},
	}
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.selected = 1
	a.sidebarSessionsCollapsed = true
	a.sidebarSectionCursor = true
	a.sidebarSectionFocus = sidebarSectionSessions

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	if a.selected != 1 {
		t.Fatalf("collapsed section navigation changed selected session to %d", a.selected)
	}
	if a.sidebarSectionFocus != sidebarSectionContext {
		t.Fatalf("section focus = %v, want context", a.sidebarSectionFocus)
	}
	out := ansi.Strip(a.renderSidebar(42, 18))
	if !strings.Contains(out, "▌▾ CONTEXT") {
		t.Fatalf("collapsed sidebar should show cursor on context header:\n%s", out)
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyUp, Text: "up"})
	if a.selected != 1 {
		t.Fatalf("moving section focus back changed selected session to %d", a.selected)
	}
	if a.sidebarSectionFocus != sidebarSectionSessions {
		t.Fatalf("section focus = %v, want sessions", a.sidebarSectionFocus)
	}
	out = ansi.Strip(a.renderSidebar(42, 18))
	if !strings.Contains(out, "▌▸ SESSIONS") {
		t.Fatalf("collapsed sidebar should show cursor on sessions header:\n%s", out)
	}
}

func TestCollapsedSidebarEnterExpandsSessionsAndKeepsCurrentSession(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first", Status: gact.StatusIdle},
		{ID: "s2", Title: "second", Status: gact.StatusIdle},
	}
	a.selected = 1
	a.sidebarSessionsCollapsed = true
	a.sidebarSectionCursor = true
	a.sidebarSectionFocus = sidebarSectionSessions

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEnter, Text: "enter"})
	if a.sidebarSessionsCollapsed {
		t.Fatal("enter on sessions header should expand the section")
	}
	if a.selected != 1 {
		t.Fatalf("selected = %d, want current session preserved", a.selected)
	}
	out := ansi.Strip(a.renderSidebar(42, 18))
	if !strings.Contains(out, "▌○ second") {
		t.Fatalf("expanded sidebar should restore cursor to current session:\n%s", out)
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
	if !strings.Contains(out, "1 child collapsed") {
		t.Fatalf("parent should show collapsed child count:\n%s", out)
	}
	if strings.Contains(out, "idle · 1 child session") {
		t.Fatalf("child summary should not be mixed into status/time line:\n%s", out)
	}
}

func TestSessionsSortByLatestActivity(t *testing.T) {
	a := makeSidebarApp(t, 0)
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	a.sessions = []gact.Session{
		{ID: "old", Title: "old", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now.Add(-3 * time.Hour)},
		{ID: "created-fallback", Title: "created", CreatedAt: now.Add(-1 * time.Hour)},
		{ID: "latest", Title: "latest", CreatedAt: now.Add(-10 * time.Hour), UpdatedAt: now.Add(-5 * time.Minute)},
	}

	a.sortSessionsByActivity()
	got := []string{a.sessions[0].ID, a.sessions[1].ID, a.sessions[2].ID}
	if strings.Join(got, ",") != "latest,created-fallback,old" {
		t.Fatalf("sessions should sort by UpdatedAt falling back to CreatedAt, got %v", got)
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

func TestSidebarGroupsChildSessionsUnderParentWhenBackendSortsChildrenFirst(t *testing.T) {
	a := makeSidebarApp(t, 4)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "child-a", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "other", Title: "newer top-level", Status: gact.StatusIdle},
		{ID: "child-b", Title: "data_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "parent", Title: "demo cross_file", Status: gact.StatusIdle},
	}
	a.selected = 3

	vis := a.visibleSessionIndexes()
	got := []string{}
	for _, idx := range vis {
		got = append(got, a.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "other,parent,child-a,child-b" {
		t.Fatalf("children should render directly below parent, got %v", got)
	}

	out := ansi.Strip(a.renderSidebar(64, 24))
	parentPos := strings.Index(out, "demo cross_file")
	childAPos := strings.Index(out, "CSV")
	childBPos := strings.Index(out, "data")
	if parentPos < 0 || childAPos < 0 || childBPos < 0 || !(parentPos < childAPos && childAPos < childBPos) {
		t.Fatalf("rendered sidebar should group children below parent:\n%s", out)
	}
}

func TestSidebarExpandedChildrenAreScopedToSelectedParent(t *testing.T) {
	a := makeSidebarApp(t, 6)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "p1", Title: "first parent", Status: gact.StatusIdle},
		{ID: "p2", Title: "second parent", Status: gact.StatusIdle},
		{ID: "p1-child", Title: "first child", ParentSessionID: "p1", Status: gact.StatusIdle},
		{ID: "p2-child", Title: "second child", ParentSessionID: "p2", Status: gact.StatusIdle},
	}
	a.selected = 0

	vis := a.visibleSessionIndexes()
	got := []string{}
	for _, idx := range vis {
		got = append(got, a.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "p1,p1-child,p2" {
		t.Fatalf("expanded child rows should be scoped to selected parent, got %v", got)
	}

	a.selected = 1
	vis = a.visibleSessionIndexes()
	got = got[:0]
	for _, idx := range vis {
		got = append(got, a.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "p1,p2,p2-child" {
		t.Fatalf("expanded child rows should follow newly selected parent, got %v", got)
	}
}

func TestSidebarExpandedSelectedParentKeepsChildrenInViewport(t *testing.T) {
	a := makeSidebarApp(t, 16)
	a.showChildSessions = true
	a.sessions = []gact.Session{
		{ID: "s1", Title: "session 1", Status: gact.StatusIdle},
		{ID: "s2", Title: "session 2", Status: gact.StatusIdle},
		{ID: "s3", Title: "session 3", Status: gact.StatusIdle},
		{ID: "s4", Title: "session 4", Status: gact.StatusIdle},
		{ID: "s5", Title: "session 5", Status: gact.StatusIdle},
		{ID: "parent", Title: "demo cross_file", Status: gact.StatusIdle},
		{ID: "c1", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "c2", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.selected = 5

	out := ansi.Strip(a.renderSidebar(56, 24))
	for _, want := range []string{"demo cross_file", "CSV", "analysis"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expanded selected parent should keep child group visible, missing %q:\n%s", want, out)
		}
	}
}

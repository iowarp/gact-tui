package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSidebarRendersChildSessionKindAndToolCount(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
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
	a.session.selected = 1

	out := ansi.Strip(a.sidebar.render(42, 20))
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
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
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
	a.session.selected = 0

	out := ansi.Strip(a.sidebar.render(56, 20))
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
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "demo cross_file_dirty", Status: gact.StatusIdle},
		{ID: "csv", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 1.0}},
		{ID: "analysis", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 2.0}},
		{ID: "adios", Title: "adios_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 1.0}},
		{ID: "data", Title: "data_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle, Metadata: map[string]any{"tool_count": 2.0}},
	}
	a.session.selected = 0

	out := ansi.Strip(a.sidebar.render(42, 24))
	for _, want := range []string{"├─ ○ CSV · 1t", "├─ ○ analysis · 2t", "├─ ○ ADIOS · 1t", "└─ ○ data · 2t"} {
		if !strings.Contains(out, want) {
			t.Fatalf("sidebar missing compact branch row %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "\n\n") {
		t.Fatalf("session list should not contain blank spacer rows:\n%s", out)
	}
}

func TestCollapsedSessionsHeaderUsesCompactCount(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "demo", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.sidebar.showChildSessions = true
	a.sidebar.sessionsCollapsed = true
	a.sidebar.sectionCursor = true
	a.sidebar.sectionFocus = sidebarSectionSessions

	out := ansi.Strip(a.sidebar.render(24, 14))
	if !strings.Contains(out, "▌▸ SESSIONS (2)") {
		t.Fatalf("collapsed sessions header should fit as compact count:\n%s", out)
	}
	if strings.Contains(out, "children") || strings.Contains(out, "SESSIONS ·") {
		t.Fatalf("collapsed sessions header should not include dot-separated suffixes:\n%s", out)
	}
}

func TestSidebarCollapsesChildSessionsByDefault(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{
			ID:              "child",
			Title:           "csv_validator subagent",
			ParentSessionID: "parent",
			Status:          gact.StatusIdle,
			Metadata:        map[string]any{"session_type": "nanoagent"},
		},
	}
	a.session.selected = 0

	vis := a.session.visibleIndexes()
	if len(vis) != 1 || vis[0] != 0 {
		t.Fatalf("collapsed children should leave only parent visible, got %v", vis)
	}
	out := ansi.Strip(a.sidebar.render(52, 20))
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
	a.session.sessions = []gact.Session{
		{ID: "old", Title: "old", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now.Add(-3 * time.Hour)},
		{ID: "created-fallback", Title: "created", CreatedAt: now.Add(-1 * time.Hour)},
		{ID: "latest", Title: "latest", CreatedAt: now.Add(-10 * time.Hour), UpdatedAt: now.Add(-5 * time.Minute)},
	}

	a.session.sortByActivity()
	got := []string{a.session.sessions[0].ID, a.session.sessions[1].ID, a.session.sessions[2].ID}
	if strings.Join(got, ",") != "latest,created-fallback,old" {
		t.Fatalf("sessions should sort by UpdatedAt falling back to CreatedAt, got %v", got)
	}
}

func TestSidebarToggleChildSessions(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if !a.sidebar.showChildSessions {
		t.Fatal("c should expand child sessions")
	}
	vis := a.session.visibleIndexes()
	if len(vis) != 2 {
		t.Fatalf("expanded children should be visible, got %v", vis)
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if a.sidebar.showChildSessions {
		t.Fatal("second c should collapse child sessions")
	}
}

func TestSidebarGroupsChildSessionsUnderParentWhenBackendSortsChildrenFirst(t *testing.T) {
	a := makeSidebarApp(t, 4)
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
		{ID: "child-a", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "other", Title: "newer top-level", Status: gact.StatusIdle},
		{ID: "child-b", Title: "data_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "parent", Title: "demo cross_file", Status: gact.StatusIdle},
	}
	a.session.selected = 3

	vis := a.session.visibleIndexes()
	got := []string{}
	for _, idx := range vis {
		got = append(got, a.session.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "other,parent,child-a,child-b" {
		t.Fatalf("children should render directly below parent, got %v", got)
	}

	out := ansi.Strip(a.sidebar.render(64, 24))
	parentPos := strings.Index(out, "demo cross_file")
	childAPos := strings.Index(out, "CSV")
	childBPos := strings.Index(out, "data")
	if parentPos < 0 || childAPos < 0 || childBPos < 0 || !(parentPos < childAPos && childAPos < childBPos) {
		t.Fatalf("rendered sidebar should group children below parent:\n%s", out)
	}
}

func TestSidebarExpandedChildrenAreScopedToSelectedParent(t *testing.T) {
	a := makeSidebarApp(t, 6)
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
		{ID: "p1", Title: "first parent", Status: gact.StatusIdle},
		{ID: "p2", Title: "second parent", Status: gact.StatusIdle},
		{ID: "p1-child", Title: "first child", ParentSessionID: "p1", Status: gact.StatusIdle},
		{ID: "p2-child", Title: "second child", ParentSessionID: "p2", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	vis := a.session.visibleIndexes()
	got := []string{}
	for _, idx := range vis {
		got = append(got, a.session.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "p1,p1-child,p2" {
		t.Fatalf("expanded child rows should be scoped to selected parent, got %v", got)
	}

	a.session.selected = 1
	vis = a.session.visibleIndexes()
	got = got[:0]
	for _, idx := range vis {
		got = append(got, a.session.sessions[idx].ID)
	}
	if strings.Join(got, ",") != "p1,p2,p2-child" {
		t.Fatalf("expanded child rows should follow newly selected parent, got %v", got)
	}
}

func TestSidebarExpandedSelectedParentKeepsChildrenInViewport(t *testing.T) {
	a := makeSidebarApp(t, 16)
	a.sidebar.showChildSessions = true
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "session 1", Status: gact.StatusIdle},
		{ID: "s2", Title: "session 2", Status: gact.StatusIdle},
		{ID: "s3", Title: "session 3", Status: gact.StatusIdle},
		{ID: "s4", Title: "session 4", Status: gact.StatusIdle},
		{ID: "s5", Title: "session 5", Status: gact.StatusIdle},
		{ID: "parent", Title: "demo cross_file", Status: gact.StatusIdle},
		{ID: "c1", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "c2", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.session.selected = 5

	out := ansi.Strip(a.sidebar.render(56, 24))
	for _, want := range []string{"demo cross_file", "CSV", "analysis"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expanded selected parent should keep child group visible, missing %q:\n%s", want, out)
		}
	}
}

func TestSidebarVisibleRangeAccountsForVariableSessionRows(t *testing.T) {
	a := makeSidebarApp(t, 5)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "session 1", Status: gact.StatusIdle},
		{ID: "s2", Title: "session 2", Status: gact.StatusIdle},
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "after", Title: "after", Status: gact.StatusIdle},
	}
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.session.selected = 2
	a.sidebar.showChildSessions = false

	visIdx := a.session.visibleIndexes()
	start, end := a.sidebar.visibleSessionRange(16, visIdx)
	used := 0
	for i := start; i < end; i++ {
		used += a.sidebar.sessionRowCount(visIdx[i])
	}
	if available := a.sidebar.sessionRowsAvailable(16); used > available {
		t.Fatalf("visible range used %d rows, available %d (range %d:%d)", used, available, start, end)
	}

	out := ansi.Strip(a.sidebar.render(42, 16))
	if !strings.Contains(out, "1 child collapsed") {
		t.Fatalf("selected parent's variable-height summary row should remain visible:\n%s", out)
	}
	if strings.Contains(out, "○ after") {
		t.Fatalf("rendered range should not include a session that does not fit after variable-height parent rows:\n%s", out)
	}
}

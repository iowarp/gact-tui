package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestSidebarSessionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:sess_2")
	if !ok {
		t.Fatal("missing semantic sidebar session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if a.sidebar.sectionFocus != sidebarSectionSessions || a.sidebar.sectionCursor {
		t.Fatalf("session hit should focus session rows, section=%v cursor=%v", a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if a.session.selected != 1 {
		t.Fatalf("selected = %d, want second session", a.session.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar session click should return selectSession command")
	}
}

func TestSidebarSessionsHeaderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:sessions:header")
	if !ok {
		t.Fatal("missing semantic sessions header target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("sessions header click should not dispatch a command")
	}
	if !a.sidebar.sessionsCollapsed {
		t.Fatal("sessions header semantic hit should collapse sessions")
	}
	if a.sidebar.sectionFocus != sidebarSectionSessions || !a.sidebar.sectionCursor {
		t.Fatalf("sessions header should focus section cursor, section=%v cursor=%v", a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
}

func TestSidebarContentHitHelperUsesSharedRowGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.interaction.beginHitFrame()
	clicked := false

	a.sidebar.registerContentHit("sidebar:test:row", 3, 24, 2, func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "sidebar:test:row")
	if !ok {
		t.Fatal("missing sidebar content row target")
	}
	if target.rect.x != 2 || target.rect.y != 5 || target.rect.w != 20 || target.rect.h != 2 {
		t.Fatalf("sidebar content rect = %+v, want x=2 y=5 w=20 h=2", target.rect)
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("sidebar content row target should handle click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestSidebarExpandedChildSessionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child-a", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "child-b", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "after", Title: "after", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.sidebar.showChildSessions = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:child-b")
	if !ok {
		t.Fatal("missing semantic child session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.session.selected != 2 {
		t.Fatalf("clicking child target selected %d, want child-b index 2", a.session.selected)
	}
	if cmd == nil {
		t.Fatal("child session click should return selectSession command")
	}
}

func TestSidebarSelectedParentSemanticHitTogglesChildren(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:parent")
	if !ok {
		t.Fatal("missing semantic parent session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking selected parent should toggle children without dispatching select command")
	}
	if !a.sidebar.showChildSessions {
		t.Fatal("selected parent semantic hit should expand child sessions")
	}
}

func TestSidebarCountsUseSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.session.wsID = "ws_default"
	archivedAt := time.Now()
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "archived", Status: gact.StatusIdle, ArchivedAt: &archivedAt},
	}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:counts")
	if !ok {
		t.Fatal("missing semantic sidebar counts target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if !a.sidebar.showArchived {
		t.Fatal("counts click should toggle archived view on")
	}
	if !strings.Contains(a.transientHint, "archived") {
		t.Fatalf("hint = %q, want archived toggle hint", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("counts click should dispatch archived-view reload when workspace is known")
	}
}

func TestSidebarFilterUsesSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 180
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "refactor auth", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "release notes", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	_ = a.View()
	footerTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter")
	if !ok {
		t.Fatal("missing visible footer sidebar filter target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      footerTarget.rect.x,
		Y:      footerTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer filter click should not dispatch a command")
	}
	if a.focus != FocusSidebar || !a.sidebar.sessionFilterActive {
		t.Fatalf("footer filter click should focus sidebar filter, focus=%v active=%v", a.focus, a.sidebar.sessionFilterActive)
	}
	a.sidebar.sessionFilter = "ndp"
	_ = a.View()
	applyTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter:apply")
	if !ok {
		t.Fatal("missing visible footer sidebar filter apply target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      applyTarget.rect.x,
		Y:      applyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter apply click should not dispatch a command")
	}
	if a.sidebar.sessionFilterActive || a.sidebar.sessionFilter != "ndp" {
		t.Fatalf("filter apply click should commit filter, active=%v filter=%q", a.sidebar.sessionFilterActive, a.sidebar.sessionFilter)
	}

	a.sidebar.sessionFilter = "auth"
	a.sidebar.sessionFilterActive = false
	a.sidebar.filterSnapshot = ""
	_ = a.View()
	filterTarget, ok := findHitTargetForTest(a, "sidebar:filter")
	if !ok {
		t.Fatal("missing semantic sidebar filter row target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      filterTarget.rect.x,
		Y:      filterTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter row click should not dispatch a command")
	}
	if a.focus != FocusSidebar || !a.sidebar.sessionFilterActive {
		t.Fatalf("filter row click should focus sidebar filter, focus=%v active=%v", a.focus, a.sidebar.sessionFilterActive)
	}
	if a.sidebar.filterSnapshot != "auth" || a.sidebar.sessionFilter != "auth" {
		t.Fatalf("filter row click should preserve committed filter for Esc restore, filter=%q snapshot=%q", a.sidebar.sessionFilter, a.sidebar.filterSnapshot)
	}
	a.sidebar.sessionFilter = "authX"
	_ = a.View()
	cancelTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter:cancel")
	if !ok {
		t.Fatal("missing visible footer sidebar filter cancel target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      cancelTarget.rect.x,
		Y:      cancelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter cancel click should not dispatch a command")
	}
	if a.sidebar.sessionFilterActive || a.sidebar.sessionFilter != "auth" {
		t.Fatalf("filter cancel click should restore snapshot, active=%v filter=%q", a.sidebar.sessionFilterActive, a.sidebar.sessionFilter)
	}
}

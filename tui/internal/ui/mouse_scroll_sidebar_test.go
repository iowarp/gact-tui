package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestMouseClickChangesFocusAndCanSelectSidebarSession(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.session.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.session.wsID = "ws_default"
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "one"}}},
	}

	_ = a.View()
	sessionTarget, ok := findHitTargetForTest(a, "sidebar:session:sess_2")
	if !ok {
		t.Fatal("missing semantic sidebar session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: sessionTarget.rect.x, Y: sessionTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if a.session.selected != 1 {
		t.Fatalf("selected = %d, want second session", a.session.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar session click should return selectSession command")
	}

	_ = a.View()
	bodyTarget, ok := findHitTargetForTest(a, "conversation:body:focus")
	if !ok {
		t.Fatal("missing semantic conversation focus target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: bodyTarget.rect.x, Y: bodyTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}

	_ = a.View()
	inputTarget, ok := findHitTargetForTest(a, "input:focus")
	if !ok {
		t.Fatal("missing semantic input focus target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: inputTarget.rect.x, Y: inputTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func TestMouseWheelOverSidebarSelectsLaterSessions(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.session.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.session.wsID = "ws_default"
	for i := 0; i < 8; i++ {
		a.session.sessions = append(a.session.sessions, gact.Session{
			ID:     "sess_" + itoa2(i),
			Title:  "session " + itoa2(i),
			Status: gact.StatusIdle,
		})
	}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:focus:wheel")
	if !ok {
		t.Fatal("missing sidebar wheel target")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if a.session.selected != 1 {
		t.Fatalf("selected = %d, want next session", a.session.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar wheel should select the newly highlighted session")
	}
}

func TestMouseClickTogglesSidebarSections(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	_ = a.View()
	sessionsTarget, ok := findHitTargetForTest(a, "sidebar:sessions:header")
	if !ok {
		t.Fatal("missing semantic sessions header target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: sessionsTarget.rect.x, Y: sessionsTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.sidebar.sessionsCollapsed {
		t.Fatal("clicking the sessions header should collapse sessions")
	}
	if a.sidebar.sectionFocus != sidebarSectionSessions {
		t.Fatalf("section focus = %v, want sessions", a.sidebar.sectionFocus)
	}

	_ = a.View()
	contextTarget, ok := findHitTargetForTest(a, "sidebar:context:header")
	if !ok {
		t.Fatal("missing semantic context header target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: contextTarget.rect.x, Y: contextTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.sidebar.contextCollapsed {
		t.Fatal("clicking the context header should collapse context")
	}
	if a.sidebar.sectionFocus != sidebarSectionContext {
		t.Fatalf("section focus = %v, want context", a.sidebar.sectionFocus)
	}
}

func TestMouseClickSelectedParentTogglesChildSessions(t *testing.T) {
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
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking the already-selected parent should toggle children without selecting")
	}
	if !a.sidebar.showChildSessions {
		t.Fatal("clicking the selected parent should expand child sessions")
	}

	_ = a.View()
	target, ok = findHitTargetForTest(a, "sidebar:session:parent")
	if !ok {
		t.Fatal("missing semantic parent session target after expansion")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.sidebar.showChildSessions {
		t.Fatal("clicking the selected parent again should collapse child sessions")
	}
}

func TestMouseClickExpandedChildRowsUseRenderedRowHeights(t *testing.T) {
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
	childTarget, ok := findHitTargetForTest(a, "sidebar:session:child-b")
	if !ok {
		t.Fatal("missing semantic child session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: childTarget.rect.x, Y: childTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.session.selected != 2 {
		t.Fatalf("clicking second one-line child row selected %d, want child-b index 2", a.session.selected)
	}
	if cmd == nil {
		t.Fatal("child row click should select the clicked child session")
	}

	_ = a.View()
	afterTarget, ok := findHitTargetForTest(a, "sidebar:session:after")
	if !ok {
		t.Fatal("missing semantic following session target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: afterTarget.rect.x, Y: afterTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.session.selected != 3 {
		t.Fatalf("clicking row after expanded children selected %d, want after index 3", a.session.selected)
	}
}

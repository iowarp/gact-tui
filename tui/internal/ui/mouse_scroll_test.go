package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestViewEnablesMouseWheelEvents(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady

	if got := a.View().MouseMode; got != tea.MouseModeCellMotion {
		t.Fatalf("MouseMode = %v, want MouseModeCellMotion", got)
	}
}

func TestViewCanDisableMouseEvents(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = false

	if got := a.View().MouseMode; got != 0 {
		t.Fatalf("MouseMode = %v, want disabled zero value", got)
	}
}

func TestMouseWheelDownReturnsConversationToBottom(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "one"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "two"}}},
	}
	a.scrollOffset = 5
	a.stickyToBottom = false

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)

	if a.scrollOffset != 0 {
		t.Fatalf("scrollOffset = %d, want 0", a.scrollOffset)
	}
	if !a.stickyToBottom {
		t.Fatal("stickyToBottom = false, want true")
	}
}

func TestMouseWheelDownShowsTrueBottomOnLongTranscript(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.width = 100
	a.height = 34
	a.scrollOffset = 30
	a.stickyToBottom = false

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 0 || !a.stickyToBottom {
		t.Fatalf("wheel-down should reattach to bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if !strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("true bottom sentinel not visible after wheel-down:\n%s", rendered)
	}
}

func TestMouseWheelUpLeavesBottomStickyState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "one"}}},
	}
	a.stickyToBottom = true

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelUp}))
	a = model.(*App)

	if a.scrollOffset <= 0 {
		t.Fatalf("scrollOffset = %d, want >0", a.scrollOffset)
	}
	if a.stickyToBottom {
		t.Fatal("stickyToBottom = true after wheel up, want false")
	}
}

func TestKeyboardDownAtLastPartReturnsConversationToBottom(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "one"}}},
	}
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0
	a.scrollOffset = 5
	a.stickyToBottom = false

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	a = model.(*App)

	if a.scrollOffset != 0 {
		t.Fatalf("scrollOffset = %d, want 0", a.scrollOffset)
	}
	if !a.stickyToBottom {
		t.Fatal("stickyToBottom = false, want true")
	}
}

func TestMouseClickChangesFocusAndCanSelectSidebarSession(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.wsID = "ws_default"
	a.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "second", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "one"}}},
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 7, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if a.selected != 1 {
		t.Fatalf("selected = %d, want second session", a.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar session click should return selectSession command")
	}

	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: 40, Y: 5, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}

	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: 40, Y: 27, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func TestMouseClickTogglesSidebarSections(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 2, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.sidebarSessionsCollapsed {
		t.Fatal("clicking the sessions header should collapse sessions")
	}
	if a.sidebarSectionFocus != sidebarSectionSessions {
		t.Fatalf("section focus = %v, want sessions", a.sidebarSectionFocus)
	}

	_, _, convH := a.mainPaneGeometry()
	contextRow, ok := a.sidebarContextTitleRow(convH)
	if !ok {
		t.Fatal("expected context section row")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: contextRow + 2, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.sidebarContextCollapsed {
		t.Fatal("clicking the context header should collapse context")
	}
	if a.sidebarSectionFocus != sidebarSectionContext {
		t.Fatalf("section focus = %v, want context", a.sidebarSectionFocus)
	}
}

func TestMouseClickSelectedParentTogglesChildSessions(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.selected = 0

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking the already-selected parent should toggle children without selecting")
	}
	if !a.showChildSessions {
		t.Fatal("clicking the selected parent should expand child sessions")
	}

	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.showChildSessions {
		t.Fatal("clicking the selected parent again should collapse child sessions")
	}
}

func TestMouseClickExpandedChildRowsUseRenderedRowHeights(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child-a", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "child-b", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "after", Title: "after", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.showChildSessions = true

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 7, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.selected != 2 {
		t.Fatalf("clicking second one-line child row selected %d, want child-b index 2", a.selected)
	}
	if cmd == nil {
		t.Fatal("child row click should select the clicked child session")
	}

	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 8, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.selected != 3 {
		t.Fatalf("clicking row after expanded children selected %d, want after index 3", a.selected)
	}
}

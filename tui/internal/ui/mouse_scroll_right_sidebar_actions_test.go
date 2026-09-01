package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestRightSidebarContextRowRightClickKeepsRightSidebarFocus(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read", Size: 128, Language: "markdown"}}
	a.sidebar.SetLayout([]string{"sessions"}, []string{"context"})

	_ = a.View()
	rightRow, ok := findHitTargetForTest(a, "right-sidebar:context:file:docs/readme.md")
	if !ok {
		t.Fatal("missing right sidebar context file hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rightRow.rect.x,
		Y:      rightRow.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right sidebar context action menu open should not dispatch a command")
	}
	if !a.contextActions.open || a.session.contextFileSel != 0 {
		t.Fatalf("right-click should select context row and open actions, open=%v sel=%d", a.contextActions.open, a.session.contextFileSel)
	}
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionContext || a.sidebar.sectionCursor {
		t.Fatalf("right-click focus = %v section=%v cursor=%v, want right context row", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if a.conversation.actions.open || a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("right sidebar right-click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "context-actions:copy-path"); !ok {
		t.Fatal("right sidebar context menu should expose semantic action targets")
	}
}

func TestRightSidebarAgentRowRightClickOpensDetailWithoutConversationLeak(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.agent.hierarchyAgents = []gact.AgentDef{{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2}}
	a.sidebar.SetLayout([]string{"sessions"}, []string{"agents"})

	_ = a.View()
	rightRow, ok := findHitTargetForTest(a, "right-sidebar:agents:item:0")
	if !ok {
		t.Fatal("missing right sidebar agent row hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rightRow.rect.x,
		Y:      rightRow.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("right sidebar agent right-click should dispatch agent detail load")
	}
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionAgents || a.sidebar.sectionCursor {
		t.Fatalf("agent right-click focus = %v section=%v cursor=%v, want right agent row", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.agentID != "data" {
		t.Fatalf("right sidebar agent right-click should open agent detail, open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
	if a.conversation.actions.open || a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("right sidebar agent right-click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}
}

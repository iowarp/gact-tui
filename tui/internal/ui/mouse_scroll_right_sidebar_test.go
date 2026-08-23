package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestRightSidebarHasIndependentFocusAndMouseGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 30
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.sidebar.SetLayout([]string{"sessions"}, []string{"context"})

	_ = a.View()
	rightTarget, ok := findHitTargetForTest(a, "right-sidebar:focus")
	if !ok {
		t.Fatal("missing right sidebar focus target")
	}
	bodyTarget, ok := findHitTargetForTest(a, "conversation:body:focus")
	if !ok {
		t.Fatal("missing conversation focus target")
	}
	if bodyTarget.rect.x+bodyTarget.rect.w > rightTarget.rect.x {
		t.Fatalf("conversation rect %+v overlaps right sidebar rect %+v", bodyTarget.rect, rightTarget.rect)
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: rightTarget.rect.x, Y: rightTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusRightSidebar {
		t.Fatalf("focus = %v, want right sidebar", a.focus)
	}
}

func TestRightSidebarOwnsFullAllocatedColumn(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.sidebar.SetLayout([]string{"sessions"}, []string{"files"})

	_, bodyH, _ := a.chrome.mainPaneGeometry()
	view := a.View()
	rightTarget, ok := findHitTargetForTest(a, "right-sidebar:focus")
	if !ok {
		t.Fatal("missing right sidebar focus target")
	}
	if rightTarget.rect.h != bodyH {
		t.Fatalf("right sidebar focus height = %d, want full body height %d", rightTarget.rect.h, bodyH)
	}
	lines := strings.Split(ansi.Strip(view.Content), "\n")
	if len(lines) < 2 {
		t.Fatalf("rendered view is missing main row: %q", view.Content)
	}
	rightBorderX := thirdRuneIndexForTest(lines[1], '╭')
	if rightBorderX < 0 {
		t.Fatalf("could not find rendered right sidebar top border in row: %q", lines[1])
	}
	if rightTarget.rect.x != rightBorderX {
		t.Fatalf("right sidebar focus x = %d, want rendered border x %d from row %q", rightTarget.rect.x, rightBorderX, lines[1])
	}
	if rightTarget.rect.x+rightTarget.rect.w != a.width {
		t.Fatalf("right sidebar should consume trailing width: rect=%+v terminal width=%d", rightTarget.rect, a.width)
	}
	for _, x := range []int{rightTarget.rect.x, rightTarget.rect.x + 1, rightTarget.rect.x + rightTarget.rect.w/2} {
		a.focus = FocusBody
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      x,
			Y:      rightTarget.rect.y + rightTarget.rect.h - 1,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if a.focus != FocusRightSidebar {
			t.Fatalf("click at x=%d in right column focused %v, want right sidebar", x, a.focus)
		}
		_ = a.View()
	}
}

func TestRightSidebarContextRowDoesNotLeakIntoConversationHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
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
	bodyTarget, ok := findHitTargetForTest(a, "conversation:body:focus")
	if !ok {
		t.Fatal("missing conversation focus target")
	}
	if bodyTarget.rect.contains(rightRow.rect.x, rightRow.rect.y) {
		t.Fatalf("right sidebar row %+v is inside conversation focus rect %+v", rightRow.rect, bodyTarget.rect)
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rightRow.rect.x,
		Y:      rightRow.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionContext {
		t.Fatalf("right sidebar click focus = %v section=%v, want right context", a.focus, a.sidebar.sectionFocus)
	}
	if !a.detail.visible || !strings.Contains(a.detail.ref.fullText, "docs/readme.md") {
		t.Fatalf("right sidebar context click should open context detail, open=%v detail=%q", a.detail.visible, a.detail.ref.fullText)
	}
	if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 || a.conversation.actions.open {
		t.Fatalf("right sidebar click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}
}

func TestRightSidebarFileRowsUseDynamicHitTargets(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.fileViewer.setRoot(seedFileViewerTree(t))
	a.sidebar.SetLayout([]string{"sessions"}, []string{"files"})

	_ = a.View()
	folderRow, ok := findHitTargetForTest(a, "right-sidebar:files:item:0")
	if !ok {
		t.Fatal("missing right sidebar collapsed file tree row hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      folderRow.rect.x,
		Y:      folderRow.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.fileViewer.fileTreeExpanded["docs"] {
		t.Fatal("clicking right sidebar folder row should expand it")
	}
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionFiles {
		t.Fatalf("folder click focus = %v section=%v, want right files", a.focus, a.sidebar.sectionFocus)
	}
	if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 || a.conversation.actions.open {
		t.Fatalf("right sidebar folder click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}

	_ = a.View()
	fileRow, ok := findHitTargetForTest(a, "right-sidebar:files:item:2")
	if !ok {
		t.Fatal("missing right sidebar expanded file tree row hit target")
	}
	bodyTarget, ok := findHitTargetForTest(a, "conversation:body:focus")
	if !ok {
		t.Fatal("missing conversation focus target")
	}
	if bodyTarget.rect.contains(fileRow.rect.x, fileRow.rect.y) {
		t.Fatalf("right sidebar file row %+v is inside conversation focus rect %+v", fileRow.rect, bodyTarget.rect)
	}

	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      fileRow.rect.x,
		Y:      fileRow.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionFiles {
		t.Fatalf("file click focus = %v section=%v, want right files", a.focus, a.sidebar.sectionFocus)
	}
	if !a.detail.visible || a.detail.ref == nil || !strings.Contains(a.detail.ref.fullText, "guide") {
		t.Fatalf("right sidebar file click should open file detail, open=%v detail=%#v", a.detail.visible, a.detail.ref)
	}
	if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 || a.conversation.actions.open {
		t.Fatalf("right sidebar file click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}
}

func TestRightSidebarFileWheelMovesFileSelectionWithoutSessionLeak(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "second", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.fileViewer.setRoot(seedFileViewerTree(t))
	a.sidebar.SetLayout([]string{"sessions"}, []string{"files"})
	a.focus = FocusRightSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false
	a.fileViewer.fileTreeSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "right-sidebar:focus:wheel")
	if !ok {
		t.Fatal("missing right sidebar wheel target")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right sidebar file wheel should not dispatch session selection")
	}
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionFiles || a.sidebar.sectionCursor {
		t.Fatalf("wheel focus = %v section=%v cursor=%v, want right files row", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if a.fileViewer.fileTreeSel != 1 {
		t.Fatalf("fileTreeSel = %d, want next file row", a.fileViewer.fileTreeSel)
	}
	if a.session.selected != 0 {
		t.Fatalf("selected session = %d, want unchanged", a.session.selected)
	}
	if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 || a.conversation.actions.open {
		t.Fatalf("right sidebar file wheel leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}

	_ = a.View()
	model, cmd = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right sidebar file wheel up should not dispatch session selection")
	}
	if a.fileViewer.fileTreeSel != 0 {
		t.Fatalf("fileTreeSel after wheel up = %d, want first file row", a.fileViewer.fileTreeSel)
	}
	if a.session.selected != 0 {
		t.Fatalf("selected session after wheel up = %d, want unchanged", a.session.selected)
	}
}

func TestRightSidebarAgentRowDoesNotLeakIntoConversationHits(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
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
	bodyTarget, ok := findHitTargetForTest(a, "conversation:body:focus")
	if !ok {
		t.Fatal("missing conversation focus target")
	}
	if bodyTarget.rect.contains(rightRow.rect.x, rightRow.rect.y) {
		t.Fatalf("right sidebar agent row %+v is inside conversation focus rect %+v", rightRow.rect, bodyTarget.rect)
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rightRow.rect.x,
		Y:      rightRow.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionAgents {
		t.Fatalf("agent click focus = %v section=%v, want right agents", a.focus, a.sidebar.sectionFocus)
	}
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.agentID != "data" {
		t.Fatalf("right sidebar agent click should open agent detail, open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
	if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 || a.conversation.actions.open {
		t.Fatalf("right sidebar agent click leaked into conversation: msg=%d part=%d actions=%v", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx, a.conversation.actions.open)
	}
}

func thirdRuneIndexForTest(s string, want rune) int {
	seen := 0
	for i, r := range []rune(s) {
		if r != want {
			continue
		}
		seen++
		if seen == 3 {
			return i
		}
	}
	return -1
}

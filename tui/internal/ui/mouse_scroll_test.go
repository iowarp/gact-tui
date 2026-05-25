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

func TestMouseWheelDownScrollsConversationIncrementally(t *testing.T) {
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

	if a.scrollOffset != 2 {
		t.Fatalf("scrollOffset = %d, want 2", a.scrollOffset)
	}
	if a.stickyToBottom {
		t.Fatal("stickyToBottom = true after partial wheel-down, want false")
	}
}

func TestMouseWheelDownOnLongTranscriptDoesNotJumpToBottom(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.scrollOffset = 30
	a.stickyToBottom = false

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 27 || a.stickyToBottom {
		t.Fatalf("wheel-down should move one step toward bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("wheel-down jumped to true bottom instead of preserving intermediate content:\n%s", rendered)
	}
}

func TestRepeatedMouseWheelDownReachesTrueBottomOnLongTranscript(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.scrollOffset = 30
	a.stickyToBottom = false

	for i := 0; i < 10; i++ {
		model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
		a = model.(*App)
	}
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 0 || !a.stickyToBottom {
		t.Fatalf("repeated wheel-down should reach bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if !strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("true bottom sentinel not visible after repeated wheel-down:\n%s", rendered)
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

func TestMouseWheelClearsPendingPartAutoScroll(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.width = 100
	a.height = 34
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.pendingPartScroll = true

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelUp}))
	a = model.(*App)

	if a.pendingPartScroll {
		t.Fatal("manual wheel scroll should clear pending part auto-scroll")
	}
	if a.scrollOffset != 3 || a.stickyToBottom {
		t.Fatalf("wheel-up should move viewport up manually, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
}

func TestMouseWheelWithBodyFocusMovesCursorWithoutSnappingViewport(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{
			{ID: "p1", Type: gact.PartTypeText, Text: "one"},
			{ID: "p2", Type: gact.PartTypeText, Text: "two"},
		}},
	}
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0
	a.scrollOffset = 9
	a.stickyToBottom = false

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)

	if a.bodySelPartIdx != 1 {
		t.Fatalf("body cursor part = %d, want 1 after wheel-down with body focus", a.bodySelPartIdx)
	}
	if a.scrollOffset != 6 || a.stickyToBottom {
		t.Fatalf("wheel-down should preserve manual line-scroll semantics, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
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

func TestMouseClickOpenOverlayDoesNotLeakToBaseUI(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.helpOpen = true
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 2, Button: tea.MouseLeft}))
	a = model.(*App)

	if a.focus != FocusBody {
		t.Fatalf("overlay click leaked focus to base UI: focus=%v", a.focus)
	}
	if a.sidebarSessionsCollapsed {
		t.Fatal("overlay click leaked into sidebar section toggle")
	}
	if a.helpOpen {
		t.Fatal("outside click should dismiss help overlay")
	}
}

func TestMouseWheelOpenDetailScrollsDetailNotConversation(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "conversation"}}},
	}
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{title: "detail", fullText: strings.Repeat("line\n", 80)}
	a.scrollOffset = 7
	a.stickyToBottom = false

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)

	if a.detailScroll != 1 {
		t.Fatalf("detailScroll = %d, want 1", a.detailScroll)
	}
	if a.scrollOffset != 7 || a.stickyToBottom {
		t.Fatalf("conversation wheel leaked through overlay: offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
}

func TestMouseClickCatalogBrowserUsesRenderedDescRowGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent detail",
		items: []catalogItem{
			{id: "summary", title: "Summary", desc: "long summary row consumes an extra visual line"},
			{id: "handoffs", title: "Handoffs", desc: "routes to downstream experts"},
		},
	}
	rect := overlayMouseRect(a.viewCatalogBrowser(), a.width, a.height)

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 5,
		Y:      rect.y + 2 + 4,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("catalog click should open detail view")
	}
	if a.detailView.title != "Handoffs" {
		t.Fatalf("clicked rendered second row opened %q, want Handoffs", a.detailView.title)
	}
}

func TestMouseClickFilePickerInsertsClickedRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}
	rect := overlayMouseRect(a.viewFilePicker(), a.width, a.height)

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 5,
		Y:      rect.y + 2 + 5,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.filePickerOpen {
		t.Fatal("file picker should close after clicked insert")
	}
	if got := a.input.Value(); !strings.Contains(got, "@beta.parquet ") {
		t.Fatalf("input = %q, want clicked beta path inserted", got)
	}
}

func TestMouseCommandButtonOpensPalette(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0

	sidebarW, _, convH := a.mainPaneGeometry()
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      sidebarW + 2,
		Y:      1 + convH + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.paletteOpen {
		t.Fatal("clicking input command chip should open palette")
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func newLongTextTranscriptApp() *App {
	sessions := []gact.Session{{ID: "s1", Title: "long text", Status: gact.StatusIdle}}
	lines := make([]string, 0, 90)
	for i := 0; i < 89; i++ {
		lines = append(lines, "middle line "+itos(i)+" with enough content to stay readable in the conversation pane")
	}
	lines = append(lines, "TRUE_BOTTOM_SENTINEL final assistant synthesis with caveats and artifact paths.")
	msgs := []gact.Message{
		{ID: "user", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "user_text", Type: gact.PartTypeText, Text: "Analyze this dataset."}}},
		{ID: "assistant", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "long_text", Type: gact.PartTypeText, Text: strings.Join(lines, "\n")}}},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody
	return a
}

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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
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
		_ = a.View()
		target, ok := findHitTargetForTest(a, "conversation:body:wheel")
		if !ok {
			t.Fatal("missing conversation body wheel target")
		}
		model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
			X:      target.rect.x,
			Y:      target.rect.y,
			Button: tea.MouseWheelDown,
		}))
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.bodySelPartIdx != 1 {
		t.Fatalf("body cursor part = %d, want 1 after wheel-down with body focus", a.bodySelPartIdx)
	}
	if a.scrollOffset != 6 || a.stickyToBottom {
		t.Fatalf("wheel-down should preserve manual line-scroll semantics, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
}

func TestMouseWheelOutsideConversationDoesNotScrollTranscript(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.scrollOffset = 12
	a.stickyToBottom = false

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "conversation:body:wheel"); !ok {
		t.Fatal("missing conversation body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      1,
		Y:      a.height - 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.scrollOffset != 12 || a.stickyToBottom {
		t.Fatalf("wheel outside conversation should not scroll transcript, offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
}

func TestMouseWheelWithOverlayOpenDoesNotLeakToConversation(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 120
	a.height = 34
	a.scrollOffset = 9
	a.stickyToBottom = false
	a.helpOpen = true

	_ = a.View()
	body, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	surface, ok := findHitTargetForTest(a, "help:surface:wheel")
	if !ok {
		t.Fatal("missing help surface wheel blocker")
	}
	x, y, ok := pointInsideOutsideRect(body.rect, surface.rect)
	if !ok {
		t.Fatalf("test needs a conversation wheel point outside help overlay, body=%+v surface=%+v", body.rect, surface.rect)
	}

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      x,
		Y:      y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.scrollOffset != 9 || a.stickyToBottom {
		t.Fatalf("conversation wheel leaked through open overlay: offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
}

func pointInsideOutsideRect(inside mouseRect, outside mouseRect) (int, int, bool) {
	for y := inside.y; y < inside.y+inside.h; y++ {
		for x := inside.x; x < inside.x+inside.w; x++ {
			if !outside.contains(x, y) {
				return x, y, true
			}
		}
	}
	return 0, 0, false
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
	if a.selected != 1 {
		t.Fatalf("selected = %d, want second session", a.selected)
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
	a.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.wsID = "ws_default"
	for i := 0; i < 8; i++ {
		a.sessions = append(a.sessions, gact.Session{
			ID:     "sess_" + itoa2(i),
			Title:  "session " + itoa2(i),
			Status: gact.StatusIdle,
		})
	}
	a.selected = 0

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
	if a.selected != 1 {
		t.Fatalf("selected = %d, want next session", a.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar wheel should select the newly highlighted session")
	}
}

func TestRightSidebarHasIndependentFocusAndMouseGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 30
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.SetSidebarLayout([]string{"sessions"}, []string{"context"})

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
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.SetSidebarLayout([]string{"sessions"}, []string{"files"})

	_, bodyH, _ := a.mainPaneGeometry()
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
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
	}
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read", Size: 128, Language: "markdown"}}
	a.SetSidebarLayout([]string{"sessions"}, []string{"context"})

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
	if a.focus != FocusRightSidebar || a.sidebarSectionFocus != sidebarSectionContext {
		t.Fatalf("right sidebar click focus = %v section=%v, want right context", a.focus, a.sidebarSectionFocus)
	}
	if !a.detailViewOpen || !strings.Contains(a.detailView.fullText, "docs/readme.md") {
		t.Fatalf("right sidebar context click should open context detail, open=%v detail=%q", a.detailViewOpen, a.detailView.fullText)
	}
	if a.bodySelMsgIdx != 0 || a.bodySelPartIdx != 0 || a.conversationActionsOpen {
		t.Fatalf("right sidebar click leaked into conversation: msg=%d part=%d actions=%v", a.bodySelMsgIdx, a.bodySelPartIdx, a.conversationActionsOpen)
	}
}

func TestRightSidebarContextRowRightClickKeepsRightSidebarFocus(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
	}
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read", Size: 128, Language: "markdown"}}
	a.SetSidebarLayout([]string{"sessions"}, []string{"context"})

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
	if !a.contextActionsOpen || a.contextFileSel != 0 {
		t.Fatalf("right-click should select context row and open actions, open=%v sel=%d", a.contextActionsOpen, a.contextFileSel)
	}
	if a.focus != FocusRightSidebar || a.sidebarSectionFocus != sidebarSectionContext || a.sidebarSectionCursor {
		t.Fatalf("right-click focus = %v section=%v cursor=%v, want right context row", a.focus, a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
	if a.conversationActionsOpen || a.bodySelMsgIdx != 0 || a.bodySelPartIdx != 0 {
		t.Fatalf("right sidebar right-click leaked into conversation: msg=%d part=%d actions=%v", a.bodySelMsgIdx, a.bodySelPartIdx, a.conversationActionsOpen)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "context-actions:copy-path"); !ok {
		t.Fatal("right sidebar context menu should expose semantic action targets")
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

func TestMouseClickTogglesSidebarSections(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	_ = a.View()
	sessionsTarget, ok := findHitTargetForTest(a, "sidebar:sessions:header")
	if !ok {
		t.Fatal("missing semantic sessions header target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: sessionsTarget.rect.x, Y: sessionsTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.sidebarSessionsCollapsed {
		t.Fatal("clicking the sessions header should collapse sessions")
	}
	if a.sidebarSectionFocus != sidebarSectionSessions {
		t.Fatalf("section focus = %v, want sessions", a.sidebarSectionFocus)
	}

	_ = a.View()
	contextTarget, ok := findHitTargetForTest(a, "sidebar:context:header")
	if !ok {
		t.Fatal("missing semantic context header target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: contextTarget.rect.x, Y: contextTarget.rect.y, Button: tea.MouseLeft}))
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
	if !a.showChildSessions {
		t.Fatal("clicking the selected parent should expand child sessions")
	}

	_ = a.View()
	target, ok = findHitTargetForTest(a, "sidebar:session:parent")
	if !ok {
		t.Fatal("missing semantic parent session target after expansion")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
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

	_ = a.View()
	childTarget, ok := findHitTargetForTest(a, "sidebar:session:child-b")
	if !ok {
		t.Fatal("missing semantic child session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: childTarget.rect.x, Y: childTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.selected != 2 {
		t.Fatalf("clicking second one-line child row selected %d, want child-b index 2", a.selected)
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

	_ = a.View()
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

func TestOverlaySharedOutsidePolicySwallowsInsideAndClosesOutside(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{UptimeS: 42}}

	rect := overlayMouseRect(a.viewMetrics(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3,
		Y:      rect.y + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("inside overlay click should only be swallowed")
	}
	if !a.metricsOpen {
		t.Fatal("inside overlay click should keep metrics open")
	}

	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x - 1,
		Y:      rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("outside metrics click should not dispatch a command")
	}
	if a.metricsOpen {
		t.Fatal("outside metrics click should close through shared overlay policy")
	}
}

func TestOverlaySharedPolicyClosesInvalidStateBeforeRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = nil

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      5,
		Y:      5,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("invalid file picker close should not dispatch a command")
	}
	if a.filePickerOpen {
		t.Fatal("invalid file picker overlay should close without rendering stale state")
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "detail:body:wheel")
	if !ok {
		t.Fatal("missing detail body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
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
	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:item:1")
	if !ok {
		t.Fatal("missing semantic catalog target")
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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
	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:item:1")
	if !ok {
		t.Fatal("missing semantic file picker row target")
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

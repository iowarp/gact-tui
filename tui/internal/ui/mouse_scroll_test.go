package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestViewEnablesMouseDragCopyEvents(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady

	if got := a.View().MouseMode; got != tea.MouseModeAllMotion {
		t.Fatalf("MouseMode = %v, want MouseModeAllMotion", got)
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
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "one"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "two"}}},
	}
	a.conversation.scrollOffset = 5
	a.conversation.stickyToBottom = false

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

	if a.conversation.scrollOffset != 2 {
		t.Fatalf("scrollOffset = %d, want 2", a.conversation.scrollOffset)
	}
	if a.conversation.stickyToBottom {
		t.Fatal("stickyToBottom = true after partial wheel-down, want false")
	}
}

func TestMouseWheelDownOnLongTranscriptDoesNotJumpToBottom(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.conversation.scrollOffset = 30
	a.conversation.stickyToBottom = false

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
	rendered := ansi.Strip(a.conversation.render(100, 34))

	if a.conversation.scrollOffset != 27 || a.conversation.stickyToBottom {
		t.Fatalf("wheel-down should move one step toward bottom, got offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
	if strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("wheel-down jumped to true bottom instead of preserving intermediate content:\n%s", rendered)
	}
}

func TestRepeatedMouseWheelDownReachesTrueBottomOnLongTranscript(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.conversation.scrollOffset = 30
	a.conversation.stickyToBottom = false

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
	rendered := ansi.Strip(a.conversation.render(100, 34))

	if a.conversation.scrollOffset != 0 || !a.conversation.stickyToBottom {
		t.Fatalf("repeated wheel-down should reach bottom, got offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
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
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "one"}}},
	}
	a.conversation.stickyToBottom = true

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

	if a.conversation.scrollOffset <= 0 {
		t.Fatalf("scrollOffset = %d, want >0", a.conversation.scrollOffset)
	}
	if a.conversation.stickyToBottom {
		t.Fatal("stickyToBottom = true after wheel up, want false")
	}
}

func TestMouseWheelClearsPendingPartAutoScroll(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.width = 100
	a.height = 34
	a.conversation.scrollOffset = 0
	a.conversation.stickyToBottom = true
	a.conversation.pendingPartScroll = true

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

	if a.conversation.pendingPartScroll {
		t.Fatal("manual wheel scroll should clear pending part auto-scroll")
	}
	if a.conversation.scrollOffset != 3 || a.conversation.stickyToBottom {
		t.Fatalf("wheel-up should move viewport up manually, got offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
}

func TestMouseWheelWithBodyFocusMovesCursorWithoutSnappingViewport(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{
			{ID: "p1", Type: gact.PartTypeText, Text: "one"},
			{ID: "p2", Type: gact.PartTypeText, Text: "two"},
		}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.conversation.scrollOffset = 9
	a.conversation.stickyToBottom = false

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

	if a.conversation.bodySelPartIdx != 1 {
		t.Fatalf("body cursor part = %d, want 1 after wheel-down with body focus", a.conversation.bodySelPartIdx)
	}
	if a.conversation.scrollOffset != 6 || a.conversation.stickyToBottom {
		t.Fatalf("wheel-down should preserve manual line-scroll semantics, got offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
}

func TestMouseWheelOutsideConversationDoesNotScrollTranscript(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 100
	a.height = 34
	a.conversation.scrollOffset = 12
	a.conversation.stickyToBottom = false

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

	if a.conversation.scrollOffset != 12 || a.conversation.stickyToBottom {
		t.Fatalf("wheel outside conversation should not scroll transcript, offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
}

func TestKeyboardDownAtLastPartReturnsConversationToBottom(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "long"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "one"}}},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0
	a.conversation.scrollOffset = 5
	a.conversation.stickyToBottom = false

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyDown, Text: "down"})
	a = model.(*App)

	if a.conversation.scrollOffset != 0 {
		t.Fatalf("scrollOffset = %d, want 0", a.conversation.scrollOffset)
	}
	if !a.conversation.stickyToBottom {
		t.Fatal("stickyToBottom = false, want true")
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

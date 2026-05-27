package ui

import (
	"errors"
	"strings"
	"sync"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// withClipboardSpy swaps the package-level clipboardWrite for a
// capturing stub and restores it when the test ends. Returns a getter
// for the last-written value and the error the stub will return next.
func withClipboardSpy(t *testing.T) (*sync.Mutex, *string, *error) {
	t.Helper()
	var (
		mu  sync.Mutex
		got string
		err error
	)
	prev := clipboardWrite
	clipboardWrite = func(s string) error {
		mu.Lock()
		defer mu.Unlock()
		got = s
		return err
	}
	t.Cleanup(func() { clipboardWrite = prev })
	return &mu, &got, &err
}

func TestLastAssistantText_EmptySlice(t *testing.T) {
	if got, ok := lastAssistantText(nil); ok || got != "" {
		t.Errorf("empty msgs = %q ok=%v, want '' false", got, ok)
	}
}

func TestLastAssistantText_NoAssistantInSlice(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "again"}}},
	}
	if _, ok := lastAssistantText(msgs); ok {
		t.Error("all-user slice should not yield copyable text")
	}
}

func TestLastAssistantText_TakesMostRecentAssistantOnly(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first reply"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "follow-up"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "second reply"}}},
	}
	got, ok := lastAssistantText(msgs)
	if !ok || got != "second reply" {
		t.Errorf("got %q ok=%v, want 'second reply' true", got, ok)
	}
}

func TestLastAssistantText_JoinsMultipleTextParts(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "intro paragraph"},
			{Type: gact.PartTypeText, Text: "follow-up paragraph"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if !strings.Contains(got, "intro paragraph\n\nfollow-up paragraph") {
		t.Errorf("got %q, want both parts separated by blank line", got)
	}
}

func TestLastAssistantText_FencesThinking(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeThinking, Thinking: "considering options"},
			{Type: gact.PartTypeText, Text: "the answer"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if !strings.Contains(got, "<thinking>\nconsidering options\n</thinking>") {
		t.Errorf("thinking not fenced: %q", got)
	}
	if !strings.Contains(got, "the answer") {
		t.Error("text part lost")
	}
}

func TestLastAssistantText_SkipsToolCallParts(t *testing.T) {
	// Tool calls are structured, not free text — omitting them keeps
	// the clipboard content clean for "I just want to paste what Claude
	// said" use cases.
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, ToolName: "bash"},
			{Type: gact.PartTypeText, Text: "running a command"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if strings.Contains(got, "bash") {
		t.Errorf("tool_call leaked into copy: %q", got)
	}
	if !strings.Contains(got, "running a command") {
		t.Errorf("text part missing: %q", got)
	}
}

func TestLastAssistantText_AssistantWithOnlyToolCallYieldsFalse(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, ToolName: "bash"},
		},
	}}
	if _, ok := lastAssistantText(msgs); ok {
		t.Error("assistant-only-tool-call should not report copyable text")
	}
}

func TestHandleBodyKey_YCopiesLastAssistantMessage(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hello"}}},
	}
	_, _ = a.handleBodyKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "hello" {
		t.Errorf("clipboard = %q, want 'hello'", *got)
	}
	if !strings.Contains(a.transientHint, "copied") {
		t.Errorf("hint = %q, want 'copied' confirmation", a.transientHint)
	}
}

func TestHandleBodyKey_YWithNothingToCopyShowsHint(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = nil
	_, _ = a.handleBodyKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("clipboard shouldn't be touched, got %q", *got)
	}
	if !strings.Contains(a.transientHint, "nothing to copy") {
		t.Errorf("hint = %q, want 'nothing to copy'", a.transientHint)
	}
}

// PPPPPPPP1: body-focus Shift+Y copies the FULL conversation as
// role-prefixed markdown — useful for pasting into a bug report,
// another LLM, or a teammate.
func TestHandleBodyKey_CapitalYCopiesFullConversation(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hello"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "ok bye"}}},
	}
	_, _ = a.handleBodyKey(tea.KeyPressMsg{Code: 'Y', Text: "Y", Mod: tea.ModShift})
	mu.Lock()
	defer mu.Unlock()
	// Expect every role header + text to appear in order. Advance a
	// cursor past each match so a repeated needle ("## user:") is
	// located at its NEXT occurrence, not the same first match.
	want := []string{"## user:", "hi", "## assistant:", "hello", "## user:", "ok bye"}
	cursor := 0
	for _, needle := range want {
		rel := strings.Index((*got)[cursor:], needle)
		if rel < 0 {
			t.Fatalf("missing %q in clipboard after offset %d: %q", needle, cursor, *got)
		}
		cursor += rel + len(needle)
	}
	if !strings.Contains(a.transientHint, "full conversation") {
		t.Errorf("hint should mention 'full conversation': %q", a.transientHint)
	}
}

func TestHandleBodyKey_CapitalYEmptyConversationShowsHint(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = nil
	_, _ = a.handleBodyKey(tea.KeyPressMsg{Code: 'Y', Text: "Y", Mod: tea.ModShift})
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("clipboard should stay empty; got %q", *got)
	}
	if !strings.Contains(a.transientHint, "no text yet") {
		t.Errorf("hint = %q, want 'no text yet'", a.transientHint)
	}
}

// OOOOOOOO1: sidebar-focus `y` copies the selected session's sid
// instead of the body-y's last-assistant text. Split on focus so
// the two yank flows don't collide.
func TestHandleSidebarKey_YCopiesSessionID(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.sessions = []gact.Session{
		{ID: "sess_abc123", Title: "alpha"},
		{ID: "sess_def456", Title: "beta"},
	}
	a.selected = 1
	a.focus = FocusSidebar
	_, _ = a.handleSidebarKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "sess_def456" {
		t.Errorf("clipboard = %q, want 'sess_def456'", *got)
	}
	if !strings.Contains(a.transientHint, "copied sess_def456") {
		t.Errorf("hint = %q, want 'copied sess_def456' confirmation", a.transientHint)
	}
}

// OOOOOOOO1: with no session selected (index -1 or out of range),
// sidebar `y` is a no-op toast — doesn't crash or copy garbage.
func TestHandleSidebarKey_YNoSessionShowsHint(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.selected = -1
	a.focus = FocusSidebar
	_, _ = a.handleSidebarKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("clipboard should not be touched; got %q", *got)
	}
	if !strings.Contains(a.transientHint, "no session") {
		t.Errorf("hint = %q, want 'no session' guidance", a.transientHint)
	}
}

func TestHandleBodyKey_YClipboardFailureSurfacesHint(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("no xclip installed")
	mu.Unlock()

	a := New("http://unused")
	a.messages = []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "content"}}},
	}
	_, _ = a.handleBodyKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	if !strings.Contains(a.transientHint, "copy failed") {
		t.Errorf("hint = %q, want 'copy failed'", a.transientHint)
	}
	if !strings.Contains(a.transientHint, "no xclip installed") {
		t.Errorf("hint should include underlying err: %q", a.transientHint)
	}
}

func TestCopyCommandUsesSharedClipboardAdapter(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeThinking, Thinking: "private chain"},
			{Type: gact.PartTypeText, Text: "visible answer"},
		},
	}}

	toast := a.copyLastAssistantReplyToClipboard()
	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(*got, "<thinking>\nprivate chain\n</thinking>") || !strings.Contains(*got, "visible answer") {
		t.Fatalf("/copy clipboard = %q, want shared last-assistant formatter output", *got)
	}
	if !strings.Contains(toast, "copied") || strings.Contains(toast, "via ") || strings.Contains(toast, "wrote ") {
		t.Fatalf("/copy toast = %q, want shared clipboard confirmation", toast)
	}
}

func TestCopyCommandClipboardFailureSurfacesHint(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("clipboard daemon unavailable")
	mu.Unlock()

	a := New("http://unused")
	a.messages = []gact.Message{{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: "visible answer"}},
	}}

	toast := a.copyLastAssistantReplyToClipboard()
	if !strings.Contains(toast, "copy failed") || !strings.Contains(toast, "clipboard daemon unavailable") {
		t.Fatalf("/copy failure toast = %q, want surfaced clipboard error", toast)
	}
}

package ui

import (
	"errors"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestHandleBodyKey_YCopiesLastAssistantMessage(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hello"}}},
	}
	_, _ = a.conversation.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
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
	a.conversation.messages = nil
	_, _ = a.conversation.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("clipboard shouldn't be touched, got %q", *got)
	}
	if !strings.Contains(a.transientHint, "nothing to copy") {
		t.Errorf("hint = %q, want 'nothing to copy'", a.transientHint)
	}
}

// Body-focus Shift+Y copies the FULL conversation as
// role-prefixed markdown — useful for pasting into a bug report,
// another LLM, or a teammate.
func TestHandleBodyKey_CapitalYCopiesFullConversation(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hello"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "ok bye"}}},
	}
	_, _ = a.conversation.handleKey(tea.KeyPressMsg{Code: 'Y', Text: "Y", Mod: tea.ModShift})
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
	a.conversation.messages = nil
	_, _ = a.conversation.handleKey(tea.KeyPressMsg{Code: 'Y', Text: "Y", Mod: tea.ModShift})
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("clipboard should stay empty; got %q", *got)
	}
	if !strings.Contains(a.transientHint, "no text yet") {
		t.Errorf("hint = %q, want 'no text yet'", a.transientHint)
	}
}

// Sidebar-focus `y` copies the selected session's sid
// instead of the body-y's last-assistant text. Split on focus so
// the two yank flows don't collide.
func TestHandleSidebarKey_YCopiesSessionID(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.session.sessions = []gact.Session{
		{ID: "sess_abc123", Title: "alpha"},
		{ID: "sess_def456", Title: "beta"},
	}
	a.session.selected = 1
	a.focus = FocusSidebar
	_, _ = a.sidebar.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	mu.Lock()
	defer mu.Unlock()
	if *got != "sess_def456" {
		t.Errorf("clipboard = %q, want 'sess_def456'", *got)
	}
	if !strings.Contains(a.transientHint, "copied sess_def456") {
		t.Errorf("hint = %q, want 'copied sess_def456' confirmation", a.transientHint)
	}
}

// With no session selected (index -1 or out of range),
// sidebar `y` is a no-op toast — doesn't crash or copy garbage.
func TestHandleSidebarKey_YNoSessionShowsHint(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.session.selected = -1
	a.focus = FocusSidebar
	_, _ = a.sidebar.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
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
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "content"}}},
	}
	_, _ = a.conversation.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	if !strings.Contains(a.transientHint, "copy failed") {
		t.Errorf("hint = %q, want 'copy failed'", a.transientHint)
	}
	for _, want := range []string{"gact diag", "clipboard_native", "clipboard_missing", "clipboard_osc52"} {
		if !strings.Contains(a.transientHint, want) {
			t.Errorf("hint missing %q: %q", want, a.transientHint)
		}
	}
	if strings.Contains(a.transientHint, "no xclip installed") {
		t.Errorf("hint should omit raw backend error so it fits the footer: %q", a.transientHint)
	}
}

func TestCopyCommandUsesSharedClipboardAdapter(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.conversation.messages = []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeThinking, Thinking: "private chain"},
			{Type: gact.PartTypeText, Text: "visible answer"},
		},
	}}

	toast := a.clipboard.copyLastAssistantReply()
	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(*got, "<thinking>\nprivate chain\n</thinking>") || !strings.Contains(*got, "visible answer") {
		t.Fatalf("/copy clipboard = %q, want shared last-assistant formatter output", *got)
	}
	if !strings.Contains(toast, "copied") || strings.Contains(toast, "via ") || strings.Contains(toast, "wrote ") {
		t.Fatalf("/copy toast = %q, want shared clipboard confirmation", toast)
	}
}

func TestCopyCommandPrefersSelectedConversationBlock(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.conversation.messages = []gact.Message{
		{
			Role: gact.RoleAssistant,
			Parts: []gact.Part{{
				Type:     gact.PartTypeToolCall,
				CallID:   "call_read",
				ToolName: "ReadFile",
				Input:    map[string]any{"path": "main.go"},
			}},
		},
		{
			Role: gact.RoleTool,
			Parts: []gact.Part{{
				Type:   gact.PartTypeToolResult,
				CallID: "call_read",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "package main\n\nfunc main() {}",
				}},
			}},
		},
		{
			Role:  gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "latest assistant"}},
		},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0

	toast := a.clipboard.copySelectedOrLastAssistant()
	mu.Lock()
	defer mu.Unlock()
	if *got != "package main\n\nfunc main() {}" {
		t.Fatalf("/copy selected block clipboard = %q", *got)
	}
	if !strings.Contains(toast, "selected block") {
		t.Fatalf("/copy selected block toast = %q, want selected block", toast)
	}
}

func TestCopyCommandFallsBackToSelectedMessageThenLatestAssistant(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.conversation.messages = []gact.Message{
		{
			Role: gact.RoleUser,
			Parts: []gact.Part{
				{Type: gact.PartTypeText, Text: "selected message"},
				{Type: gact.PartTypeText, Text: "second paragraph"},
			},
		},
		{
			Role:  gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "latest assistant"}},
		},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 99

	toast := a.clipboard.copySelectedOrLastAssistant()
	mu.Lock()
	if *got != "selected message\n\nsecond paragraph" {
		t.Fatalf("/copy selected message clipboard = %q", *got)
	}
	mu.Unlock()
	if !strings.Contains(toast, "selected message") {
		t.Fatalf("/copy selected message toast = %q, want selected message", toast)
	}

	a.conversation.bodySelMsgIdx = -1
	a.conversation.bodySelPartIdx = -1
	toast = a.clipboard.copySelectedOrLastAssistant()
	mu.Lock()
	defer mu.Unlock()
	if *got != "latest assistant" {
		t.Fatalf("/copy latest fallback clipboard = %q", *got)
	}
	if !strings.Contains(toast, "copied") || strings.Contains(toast, "selected") {
		t.Fatalf("/copy latest fallback toast = %q, want generic copied", toast)
	}
}

func TestCopyCommandClipboardFailureSurfacesHint(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("clipboard daemon unavailable")
	mu.Unlock()

	a := New("http://unused")
	a.conversation.messages = []gact.Message{{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: "visible answer"}},
	}}

	toast := a.clipboard.copyLastAssistantReply()
	for _, want := range []string{"copy failed", "gact diag", "clipboard_native", "clipboard_missing", "clipboard_osc52"} {
		if !strings.Contains(toast, want) {
			t.Fatalf("/copy failure toast missing %q:\n%s", want, toast)
		}
	}
	if strings.Contains(toast, "clipboard daemon unavailable") {
		t.Fatalf("/copy failure toast should stay footer-readable and omit raw backend error:\n%s", toast)
	}
}

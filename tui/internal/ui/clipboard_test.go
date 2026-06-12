package ui

import (
	"errors"
	"fmt"
	"strconv"
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
	prevOSC52 := osc52Write
	prevLookPath := clipboardLookPath
	prevRunCommand := clipboardRunCommand
	prevAtotto := clipboardAtottoWrite
	prevForcedFailure := clipboardForcedFailure
	prevPreferred := clipboardPreferredCommand
	clipboardWrite = func(s string) error {
		mu.Lock()
		defer mu.Unlock()
		got = s
		return err
	}
	osc52Write = func(string) error {
		return errors.New("terminal clipboard unavailable")
	}
	t.Cleanup(func() {
		clipboardWrite = prev
		osc52Write = prevOSC52
		clipboardLookPath = prevLookPath
		clipboardRunCommand = prevRunCommand
		clipboardAtottoWrite = prevAtotto
		clipboardForcedFailure = prevForcedFailure
		clipboardPreferredCommand = prevPreferred
	})
	return &mu, &got, &err
}

func withNativeClipboardSpy(t *testing.T, available map[string]bool, failures map[string]error) *[]string {
	t.Helper()
	prevLookPath := clipboardLookPath
	prevRunCommand := clipboardRunCommand
	prevAtotto := clipboardAtottoWrite
	prevPreferred := clipboardPreferredCommand
	attempts := []string{}
	clipboardPreferredCommand = nil
	clipboardLookPath = func(name string) (string, error) {
		if available[name] {
			return "/fake/bin/" + name, nil
		}
		return "", errors.New("not found")
	}
	clipboardRunCommand = func(name string, args []string, input string) error {
		base := name[strings.LastIndex(name, "/")+1:]
		attempts = append(attempts, base+":"+input)
		if err := failures[base]; err != nil {
			return err
		}
		return nil
	}
	clipboardAtottoWrite = func(string) error {
		attempts = append(attempts, "atotto")
		return errors.New("atotto unavailable")
	}
	t.Cleanup(func() {
		clipboardLookPath = prevLookPath
		clipboardRunCommand = prevRunCommand
		clipboardAtottoWrite = prevAtotto
		clipboardPreferredCommand = prevPreferred
	})
	return &attempts
}

func TestCopyTextToClipboardFallsBackToOSC52(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("no clipboard utilities available")
	mu.Unlock()
	var oscPayload string
	osc52Write = func(s string) error {
		oscPayload = s
		return nil
	}

	hint := copyTextToClipboard("detail", "payload")
	if !strings.Contains(hint, "OSC52") || !strings.Contains(hint, "native clipboard unavailable") {
		t.Fatalf("fallback hint = %q, want truthful OSC52 fallback", hint)
	}
	if oscPayload != "payload" {
		t.Fatalf("osc52 payload = %q, want payload", oscPayload)
	}
}

func TestCopyTextToClipboardFinalFailureMentionsDiagRows(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("no native clipboard utilities available")
	mu.Unlock()
	osc52Write = func(string) error {
		return errors.New("terminal rejected OSC52")
	}

	hint := copyTextToClipboard("detail", "payload")
	for _, want := range []string{
		"copy failed",
		"gact diag",
		"clipboard_native",
		"clipboard_missing",
		"clipboard_osc52",
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("failure hint missing %q:\n%s", want, hint)
		}
	}
	for _, unwanted := range []string{"no native clipboard utilities available", "terminal rejected OSC52"} {
		if strings.Contains(hint, unwanted) {
			t.Fatalf("failure hint should stay footer-readable and omit raw backend error %q:\n%s", unwanted, hint)
		}
	}
}

func TestCopyTextToClipboardForcedFailureIsDiagnosticOnly(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)
	clipboardForcedFailure = func() bool { return true }

	hint := copyTextToClipboard("detail", "payload")

	mu.Lock()
	wrote := *got
	mu.Unlock()
	if wrote != "" {
		t.Fatalf("forced failure should not touch clipboard backend, wrote %q", wrote)
	}
	for _, want := range []string{
		"copy failed",
		"gact diag",
		"clipboard_native",
		"clipboard_missing",
		"clipboard_osc52",
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("forced failure hint missing %q:\n%s", want, hint)
		}
	}
	if strings.Contains(hint, "GACT_CLIPBOARD_FORCE_FAILURE") {
		t.Fatalf("forced failure hint should not leak test-only env details:\n%s", hint)
	}
}

func TestWriteNativeClipboardUsesFirstInstalledUtility(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, nil)

	if err := writeNativeClipboard("payload"); err != nil {
		t.Fatalf("writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:payload" {
		t.Fatalf("attempts = %q, want wl-copy only", got)
	}
}

func TestWriteNativeClipboardFallsThroughInstalledUtilities(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, map[string]error{
		"wl-copy": errors.New("wayland denied"),
	})

	if err := writeNativeClipboard("payload"); err != nil {
		t.Fatalf("writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:payload,xclip:payload" {
		t.Fatalf("attempts = %q, want wl-copy then xclip", got)
	}
}

func TestWriteNativeClipboardReusesSuccessfulUtility(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, nil)

	if err := writeNativeClipboard("first"); err != nil {
		t.Fatalf("first writeNativeClipboard: %v", err)
	}
	if err := writeNativeClipboard("second"); err != nil {
		t.Fatalf("second writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:first,wl-copy:second" {
		t.Fatalf("attempts = %q, want cached wl-copy path without probing fallback utilities", got)
	}
}

func TestWriteNativeClipboardUsesPlatformBridgeUtilities(t *testing.T) {
	for _, tc := range []struct {
		name      string
		available map[string]bool
		want      string
	}{
		{name: "macos", available: map[string]bool{"pbcopy": true}, want: "pbcopy:payload"},
		{name: "wsl clip", available: map[string]bool{"clip.exe": true}, want: "clip.exe:payload"},
		{name: "wsl powershell", available: map[string]bool{"powershell.exe": true}, want: "powershell.exe:payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			attempts := withNativeClipboardSpy(t, tc.available, nil)
			if err := writeNativeClipboard("payload"); err != nil {
				t.Fatalf("writeNativeClipboard: %v", err)
			}
			if got := strings.Join(*attempts, ","); got != tc.want {
				t.Fatalf("attempts = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestWriteNativeClipboardReportsAllFallbacksWhenUnavailable(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"xsel": true,
	}, map[string]error{
		"xsel": errors.New("display unavailable"),
	})

	err := writeNativeClipboard("payload")
	if err == nil {
		t.Fatal("writeNativeClipboard succeeded unexpectedly")
	}
	for _, want := range []string{"xsel", "display unavailable", "atotto/clipboard", "wl-copy", "xclip", "pbcopy", "clip.exe", "powershell.exe", "termux-clipboard-set"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error missing %q:\n%v", want, err)
		}
	}
	if got := fmt.Sprint(*attempts); !strings.Contains(got, "xsel:payload") || !strings.Contains(got, "atotto") {
		t.Fatalf("attempts = %v, want xsel and atotto", *attempts)
	}
}

func TestWriteNativeClipboardReportsNoInstalledUtilities(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{}, nil)

	err := writeNativeClipboard("payload")
	if err == nil {
		t.Fatal("writeNativeClipboard succeeded unexpectedly")
	}
	for _, want := range []string{"no native clipboard utilities found", "wl-copy", "xclip", "xsel", "pbcopy", "clip.exe", "powershell.exe", "termux-clipboard-set", "atotto/clipboard", "atotto unavailable"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error missing %q:\n%v", want, err)
		}
	}
	if got := fmt.Sprint(*attempts); got != "[atotto]" {
		t.Fatalf("attempts = %v, want only atotto fallback", *attempts)
	}
}

func TestCopyTextToClipboardPreservesTextAndSurfacesFailures(t *testing.T) {
	mu, got, errSlot := withClipboardSpy(t)

	if hint := copyTextToClipboard("compose draft", "   \n\t"); hint != "nothing to copy" {
		t.Fatalf("empty hint = %q, want nothing to copy", hint)
	}
	mu.Lock()
	if *got != "" {
		t.Fatalf("clipboard should not be touched for empty text, got %q", *got)
	}
	*errSlot = errors.New("clipboard daemon unavailable")
	mu.Unlock()

	if hint := copyTextToClipboard("compose draft", "draft body"); !strings.Contains(hint, "copy failed") || !strings.Contains(hint, "gact diag") {
		t.Fatalf("failure hint = %q, want surfaced clipboard error", hint)
	}

	mu.Lock()
	*errSlot = nil
	mu.Unlock()
	want := "  keep exact spacing\nand newlines  "
	if hint := copyTextToClipboard("detail", want); hint != "copied detail to clipboard" {
		t.Fatalf("success hint = %q, want copied detail to clipboard", hint)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != want {
		t.Fatalf("clipboard = %q, want exact payload %q", *got, want)
	}
}

func TestCopyExactTextToClipboardUsesCustomHints(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	if hint := copyExactTextToClipboard("", "empty transcript", nil); hint != "empty transcript" {
		t.Fatalf("empty hint = %q, want custom empty hint", hint)
	}
	if hint := copyExactTextToClipboard("abcd", "", func(chars int) string {
		return "copied chars: " + strconv.Itoa(chars)
	}); hint != "copied chars: 4" {
		t.Fatalf("success hint = %q, want custom character count", hint)
	}

	mu.Lock()
	defer mu.Unlock()
	if *got != "abcd" {
		t.Fatalf("clipboard = %q, want abcd", *got)
	}
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

func TestCopyCommandPrefersSelectedConversationBlock(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	a := New("http://unused")
	a.messages = []gact.Message{
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
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0

	toast := a.copySelectedConversationOrLastAssistantToClipboard()
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
	a.messages = []gact.Message{
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
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 99

	toast := a.copySelectedConversationOrLastAssistantToClipboard()
	mu.Lock()
	if *got != "selected message\n\nsecond paragraph" {
		t.Fatalf("/copy selected message clipboard = %q", *got)
	}
	mu.Unlock()
	if !strings.Contains(toast, "selected message") {
		t.Fatalf("/copy selected message toast = %q, want selected message", toast)
	}

	a.bodySelMsgIdx = -1
	a.bodySelPartIdx = -1
	toast = a.copySelectedConversationOrLastAssistantToClipboard()
	mu.Lock()
	defer mu.Unlock()
	if *got != "latest assistant" {
		t.Fatalf("/copy latest fallback clipboard = %q", *got)
	}
	if !strings.Contains(toast, "copied") || strings.Contains(toast, "selected") {
		t.Fatalf("/copy latest fallback toast = %q, want generic copied", toast)
	}
}

func TestFullConversationCopyIncludesToolEvidence(t *testing.T) {
	msgs := []gact.Message{
		{
			Role: gact.RoleUser,
			Parts: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "Inspect San Diego waveforms.",
			}},
		},
		{
			Role: gact.RoleAssistant,
			Parts: []gact.Part{
				{
					Type:     gact.PartTypeToolCall,
					CallID:   "call_sac",
					ToolName: "sac_discover_earthscope_region_waveform",
					Input: map[string]any{
						"location":  "San Diego, CA",
						"days_back": 7.0,
					},
				},
				{
					Type: gact.PartTypeText,
					Text: "I am querying EarthScope.",
				},
			},
		},
		{
			Role: gact.RoleTool,
			Parts: []gact.Part{{
				Type:     gact.PartTypeToolResult,
				CallID:   "call_sac",
				ToolName: "sac_discover_earthscope_region_waveform",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: `{"archive_path":"earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac","trace_count":1}`,
				}},
			}},
		},
		{
			Role: gact.RoleAssistant,
			Parts: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "SAC trace staged.",
			}},
		},
	}

	got, ok := fullConversationText(msgs)
	if !ok {
		t.Fatal("full conversation should be copyable")
	}
	for _, want := range []string{
		"## user:",
		"Inspect San Diego waveforms.",
		"## assistant:",
		"Tool call",
		"tool: sac_discover_earthscope_region_waveform",
		`"location": "San Diego, CA"`,
		"I am querying EarthScope.",
		"## tool:",
		"earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
		"SAC trace staged.",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("full conversation copy missing %q:\n%s", want, got)
		}
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
	for _, want := range []string{"copy failed", "gact diag", "clipboard_native", "clipboard_missing", "clipboard_osc52"} {
		if !strings.Contains(toast, want) {
			t.Fatalf("/copy failure toast missing %q:\n%s", want, toast)
		}
	}
	if strings.Contains(toast, "clipboard daemon unavailable") {
		t.Fatalf("/copy failure toast should stay footer-readable and omit raw backend error:\n%s", toast)
	}
}

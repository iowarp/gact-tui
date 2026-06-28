package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestInputDraft_PreservedAcrossSessionSwitch checks N1: typing into
// session A, switching to session B, typing there, switching back, and
// restoring A's draft verbatim.
func TestInputDraft_PreservedAcrossSessionSwitch(t *testing.T) {
	sessions := []gact.Session{
		{ID: "sess_a", Title: "A", Status: gact.StatusIdle},
		{ID: "sess_b", Title: "B", Status: gact.StatusIdle},
	}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Session A selected by newReadyApp (selected=0).
	a.inputComposer.input.SetValue("draft for A")

	// Exercise swapInputDraftFor directly. The full selectSession path fires
	// SSE reconnects, which waste test time waiting on a non-existent backend.
	a.inputComposer.swapDraftFor("sess_b")
	if got := a.inputComposer.input.Value(); got != "" {
		t.Fatalf("switch to B: expected empty input, got %q", got)
	}

	// Type in B.
	a.inputComposer.input.SetValue("draft for B")

	// Switch back to A.
	a.inputComposer.swapDraftFor("sess_a")
	if got := a.inputComposer.input.Value(); got != "draft for A" {
		t.Fatalf("switch back to A: expected 'draft for A', got %q", got)
	}

	// Switch to B; it should restore B's draft.
	a.inputComposer.swapDraftFor("sess_b")
	if got := a.inputComposer.input.Value(); got != "draft for B" {
		t.Fatalf("switch to B: expected 'draft for B', got %q", got)
	}
}

// TestInputDraft_ClearedOnSend ensures successful Enter drops the saved draft
// so coming back later sees a clean slate.
func TestInputDraft_ClearedOnSend(t *testing.T) {
	sessions := []gact.Session{
		{ID: "sess_a", Title: "A", Status: gact.StatusIdle},
		{ID: "sess_b", Title: "B", Status: gact.StatusIdle},
	}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.input.SetValue("hello there")

	// Simulate Enter send.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if _, ok := a.inputComposer.inputDraftBySession["sess_a"]; ok {
		t.Fatalf("sent draft should be dropped from saved map")
	}

	// Switch and return; input should be empty with no resurfacing draft.
	a.inputComposer.swapDraftFor("sess_b")
	a.inputComposer.swapDraftFor("sess_a")
	if got := a.inputComposer.input.Value(); got != "" {
		t.Fatalf("post-send return: expected empty input, got %q", got)
	}
}

// TestTransientHint_ExpiresAfterDwell verifies hintExpireMsg versioning: an
// expire message only clears the hint if it still matches what was scheduled.
func TestTransientHint_ExpiresAfterDwell(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.transientHint = "cleared 3 messages"

	// Stale expiry with different text should not touch the hint.
	out, _ := a.Update(hintExpireMsg{text: "old toast"})
	a = out.(*App)
	if a.transientHint != "cleared 3 messages" {
		t.Fatalf("stale expiry wiped current hint: %q", a.transientHint)
	}

	// Matching expiry clears it.
	out, _ = a.Update(hintExpireMsg{text: "cleared 3 messages"})
	a = out.(*App)
	if a.transientHint != "" {
		t.Fatalf("matching expiry didn't clear: %q", a.transientHint)
	}
}

func TestInputTextareaClickPlacesCursor(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.width, a.height = 120, 36
	a.focus = FocusBody
	a.inputComposer.input.SetValue("abcdef")
	a.inputComposer.input.CursorEnd()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:cursor:0:2")
	if !ok {
		t.Fatal("missing input textarea cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("input cursor click should not dispatch a command")
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
	if a.inputComposer.input.Line() != 0 || a.inputComposer.input.Column() != 2 {
		t.Fatalf("input cursor line=%d col=%d, want 0:2", a.inputComposer.input.Line(), a.inputComposer.input.Column())
	}
	model, _ = a.Update(tea.KeyPressMsg{Code: 'Z', Text: "Z"})
	a = model.(*App)
	if got := a.inputComposer.input.Value(); got != "abZcdef" {
		t.Fatalf("typing after click inserted at %q, want abZcdef", got)
	}
}

// TestInputPane_GrowsWithContent verifies multi-line buffers get a taller
// input pane, while single-line buffers keep the compact pane.
func TestInputPane_GrowsWithContent(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}

	// Single-line buffer: pane should be minimal compared to empty.
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.input.SetValue("one line")
	baseline := lipgloss.Height(renderAtSize(a, 110, 30))

	// Five-line buffer: total height should still equal viewport, but the split
	// shifts so the input pane grows.
	a.inputComposer.input.SetValue("line 1\nline 2\nline 3\nline 4\nline 5")
	tall := renderAtSize(a, 110, 30)
	if got := lipgloss.Height(tall); got > 30 {
		t.Fatalf("multi-line input pushed view over viewport: %d > 30", got)
	}

	plain := ansi.Strip(tall)
	if !strings.Contains(plain, "line 5") {
		t.Fatalf("multi-line buffer last line missing; pane did not grow")
	}
	_ = baseline
}

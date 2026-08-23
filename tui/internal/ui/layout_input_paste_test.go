package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestComposerPlaceholderDoesNotLeaveOrphanTerminalHint(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}, nil)
	rendered := stripANSI(renderAtSize(a, 150, 40))
	if strings.Contains(rendered, "\nsupporting\n") || strings.Contains(rendered, "\nsupporting ") {
		t.Fatalf("composer placeholder left orphan terminal hint:\n%s", rendered)
	}
}

func TestComposerPlaceholderFitsWhenMouseCommandChipIsVisible(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}, nil)
	a.MouseEnabled = true
	rendered := stripANSI(renderAtSize(a, 150, 40))
	if strings.Contains(rendered, "\nsupporting\n") || strings.Contains(rendered, "\nsupporting ") {
		t.Fatalf("composer placeholder left orphan terminal hint with command chip:\n%s", rendered)
	}
	if strings.Contains(rendered, "(Shift+Enter on supporting terminals)") {
		t.Fatalf("command-chip composer should use compact placeholder copy:\n%s", rendered)
	}
}

// TestShiftEnter_InsertsNewline checks that the textarea's InsertNewline
// keymap accepts shift+enter (our rebinding) and produces a two-line
// buffer.
func TestShiftEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.inputComposer.input.Focus()
	a.inputComposer.input.SetValue("first")

	// Simulate typing "shift+enter" then "second".
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter, Mod: tea.ModShift})
	a = out.(*App)
	for _, r := range "second" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}

	got := a.inputComposer.input.Value()
	if !strings.Contains(got, "\n") {
		t.Fatalf("expected newline in buffer, got %q", got)
	}
	if !strings.HasPrefix(got, "first") || !strings.HasSuffix(got, "second") {
		t.Fatalf("buffer content unexpected: %q", got)
	}
}

// TestEnter_InPaste_DoesNotSend guards the multi-prompt bug. During a
// bracketed paste window (PasteStartMsg received, PasteEndMsg not yet)
// a stray Enter keypress must NOT flush the buffer as a message - it
// should flow into the textarea as a literal newline.
func TestEnter_InPaste_DoesNotSend(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.input.SetValue("line-one")

	// Enter "paste mode" (simulates terminal sending ESC[200~).
	out, _ := a.Update(tea.PasteStartMsg{})
	a = out.(*App)
	if !a.inputComposer.inPaste {
		t.Fatalf("PasteStartMsg didn't set inPaste")
	}

	// Simulate an Enter keypress during paste - the bug was that this
	// triggered postMessageCmd and split the paste into multiple prompts.
	// Now it should flow to the textarea (newline in buffer, buffer not
	// reset).
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.inputComposer.input.Value() == "" {
		t.Fatalf("buffer was reset - Enter was intercepted despite inPaste")
	}

	// End of paste.
	out, _ = a.Update(tea.PasteEndMsg{})
	a = out.(*App)
	if a.inputComposer.inPaste {
		t.Fatalf("PasteEndMsg didn't clear inPaste")
	}
}

// TestBackslashEnter_InsertsNewline covers the Claude-Code muscle-memory
// rule: a trailing "\" + Enter drops the "\" and inserts a literal
// newline instead of sending.
func TestBackslashEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.inputComposer.input.Focus()
	a.inputComposer.input.SetValue("before\\")

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	got := a.inputComposer.input.Value()
	if got != "before\n" {
		t.Fatalf("expected %q, got %q", "before\n", got)
	}
}

func TestLongSingleLineInputKeepsBottomBorderVisible(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Status: gact.StatusIdle}}, nil)
	a.focus = FocusInput
	a.width = 92
	a.height = 30
	a.inputComposer.input.SetValue(strings.Repeat("current California NWS warnings ", 10))

	rendered := stripANSI(renderAtSize(a, 92, 30))
	lines := strings.Split(rendered, "\n")
	footerIdx := -1
	for i, line := range lines {
		if strings.Contains(line, "focus: input") {
			footerIdx = i
			break
		}
	}
	if footerIdx < 1 {
		t.Fatalf("could not find footer below input pane:\n%s", rendered)
	}
	borderLine := lines[footerIdx-1]
	if !strings.Contains(borderLine, "╰") || !strings.Contains(borderLine, "╯") {
		t.Fatalf("input bottom border should remain visible above footer, got %q\n%s", borderLine, rendered)
	}
}

package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// TestPaste_MultiLineCompresses verifies the M4 behaviour: a paste with
// 3+ lines gets compressed to a [pasted content: N lines] placeholder
// in the input buffer, and the full content is recorded for later
// substitution.
func TestPaste_MultiLineCompresses(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteStartMsg{})
	a = out.(*App)
	out, _ = a.Update(tea.PasteMsg{Content: "line 1\nline 2\nline 3\nline 4"})
	a = out.(*App)
	out, _ = a.Update(tea.PasteEndMsg{})
	a = out.(*App)

	buf := a.inputComposer.input.Value()
	if !strings.Contains(buf, "[pasted content") {
		t.Fatalf("buffer missing placeholder, got %q", buf)
	}
	if !strings.Contains(buf, "4 lines") {
		t.Fatalf("placeholder doesn't report line count, got %q", buf)
	}
	if len(a.inputComposer.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.inputComposer.pastes))
	}
	if a.inputComposer.pastes[0].content != "line 1\nline 2\nline 3\nline 4" {
		t.Fatalf("paste content not preserved: %q", a.inputComposer.pastes[0].content)
	}

	// expandPasteText should replace the placeholder with the real body.
	expanded := a.inputComposer.expandText(buf)
	if !strings.Contains(expanded, "line 1\nline 2\nline 3\nline 4") {
		t.Fatalf("expand failed: %q", expanded)
	}
	if strings.Contains(expanded, "[pasted content") {
		t.Fatalf("placeholder survived expansion: %q", expanded)
	}
}

func TestPaste_NormalizesCRLFBeforeCompression(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "line 1\r\nline 2\rline 3"})
	a = out.(*App)

	if len(a.inputComposer.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.inputComposer.pastes))
	}
	if got := a.inputComposer.pastes[0].content; got != "line 1\nline 2\nline 3" {
		t.Fatalf("normalized paste content = %q", got)
	}
	if expanded := a.inputComposer.expandText(a.inputComposer.input.Value()); strings.Contains(expanded, "\r") {
		t.Fatalf("expanded paste retained carriage returns: %q", expanded)
	}
}

func TestBufferedPaste_NormalizesCRLFBeforeCompression(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.Theme.PasteCompressThreshold = 3
	a.inputComposer.input.SetValue("before alpha\r\nbeta\rgamma")
	a.inputComposer.pasteBuffer = "alpha\r\nbeta\rgamma"

	a.inputComposer.compactBuffered()

	if len(a.inputComposer.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.inputComposer.pastes))
	}
	if got := a.inputComposer.pastes[0].content; got != "alpha\nbeta\ngamma" {
		t.Fatalf("normalized buffered paste = %q", got)
	}
	if raw := a.inputComposer.input.Value(); strings.Contains(raw, "\r") {
		t.Fatalf("input retained raw carriage returns after compression: %q", raw)
	}
	expanded := a.inputComposer.expandText(a.inputComposer.input.Value())
	if strings.Contains(expanded, "\r") {
		t.Fatalf("expanded buffered paste retained carriage returns: %q", expanded)
	}
	if !strings.Contains(expanded, "before alpha\nbeta\ngamma") {
		t.Fatalf("expanded buffered paste missing normalized body: %q", expanded)
	}
}

// TestPaste_ShortPassesThrough ensures 2-line pastes don't trigger the
// compression path - overhead isn't worth it at small sizes and the
// user experience of "pasted content: 2 lines" would feel silly.
func TestPaste_ShortPassesThrough(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "one\ntwo"})
	a = out.(*App)
	if len(a.inputComposer.pastes) != 0 {
		t.Fatalf("short paste shouldn't compress, pastes=%d", len(a.inputComposer.pastes))
	}
	// Content should be in the textarea directly (textarea's own
	// PasteMsg handling).
	if !strings.Contains(a.inputComposer.input.Value(), "one") {
		t.Fatalf("short paste content missing: %q", a.inputComposer.input.Value())
	}
}

func TestPaste_LongSingleLineCompressesByVisualLines(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Status: gact.StatusIdle}}, nil)
	a.focus = FocusInput
	a.width = 92
	a.height = 30
	a.Theme.PasteCompressThreshold = 2

	content := strings.Repeat("x", 180)
	out, _ := a.Update(tea.PasteMsg{Content: content})
	a = out.(*App)

	if len(a.inputComposer.pastes) != 1 {
		t.Fatalf("long visual paste should compress, pastes=%d input=%q", len(a.inputComposer.pastes), a.inputComposer.input.Value())
	}
	if a.inputComposer.pastes[0].lineCount < 2 {
		t.Fatalf("visual line count = %d, want >= 2", a.inputComposer.pastes[0].lineCount)
	}
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content #1: ") {
		t.Fatalf("input missing visual paste placeholder: %q", a.inputComposer.input.Value())
	}
}

func TestPaste_ExpandedLongSingleLineGrowsInputByVisualLines(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Status: gact.StatusIdle}}, nil)
	a.focus = FocusInput
	a.width = 92
	a.height = 30
	a.Theme.PasteCompressThreshold = 2

	content := strings.Repeat("x", 180)
	out, _ := a.Update(tea.PasteMsg{Content: content})
	a = out.(*App)
	out, _ = a.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	a = out.(*App)

	rendered := renderAtSize(a, 92, 30)
	if got := lipgloss.Height(rendered); got > 30 {
		t.Fatalf("expanded visual paste pushed view over viewport: %d > 30", got)
	}
	if visualLineCount(a.inputComposer.input.Value(), a.inputComposer.estimatedTextWidth()) < 2 {
		t.Fatalf("expanded long line was not counted as multiple visual rows")
	}
}

// TestPaste_CtrlPExpandsLatest ensures Ctrl+P swaps the most recent
// placeholder for real content in the buffer.
func TestPaste_CtrlPExpandsLatest(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "a\nb\nc"})
	a = out.(*App)
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Ctrl+P has no Text payload - Ctrl-modified keys aren't
	// considered printable input.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	a = out.(*App)

	buf := a.inputComposer.input.Value()
	if strings.Contains(buf, "[pasted content") {
		t.Fatalf("Ctrl+P didn't expand: %q", buf)
	}
	if !strings.Contains(buf, "a\nb\nc") {
		t.Fatalf("expanded content missing: %q", buf)
	}
	if len(a.inputComposer.pastes) != 0 {
		t.Fatalf("paste record should be dropped after expand, got %d", len(a.inputComposer.pastes))
	}
}

func TestPaste_CtrlPExpansionGrowsInputPane(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.Theme.PasteCompressThreshold = 3

	out, _ := a.Update(tea.PasteMsg{Content: "line 1\nline 2\nline 3\nline 4\nline 5"})
	a = out.(*App)
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste did not compress: %q", a.inputComposer.input.Value())
	}

	out, _ = a.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	a = out.(*App)

	rendered := renderAtSize(a, 110, 30)
	if got := lipgloss.Height(rendered); got > 30 {
		t.Fatalf("expanded paste pushed view over viewport: %d > 30", got)
	}
	plain := ansi.Strip(rendered)
	if strings.Contains(plain, "[pasted content") {
		t.Fatalf("expanded paste still shows placeholder:\n%s", plain)
	}
	if !strings.Contains(plain, "line 5") {
		t.Fatalf("expanded paste last line missing; input pane did not grow:\n%s", plain)
	}
}

func TestPaste_PostFailureRestoresExpandedContent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/sess_1/messages" {
			http.Error(w, `{"error":"temporarily unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.stage = StageReady
	a.focus = FocusInput
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.Theme.PasteCompressThreshold = 3

	model, cmd := a.Update(tea.PasteMsg{Content: "line 1\nline 2\nline 3"})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("compressed paste should not dispatch a command")
	}
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content") || len(a.inputComposer.pastes) != 1 {
		t.Fatalf("setup: paste did not compress, input=%q pastes=%d", a.inputComposer.input.Value(), len(a.inputComposer.pastes))
	}

	model, cmd = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("Enter should dispatch post command for expanded paste")
	}
	if got := a.inputComposer.input.Value(); got != "" {
		t.Fatalf("input should clear while post is in flight, got %q", got)
	}
	if len(a.inputComposer.pastes) != 0 {
		t.Fatalf("pastes should clear after dispatch, got %d", len(a.inputComposer.pastes))
	}

	msg := cmd()
	failed, ok := msg.(postFailedMsg)
	if !ok {
		t.Fatalf("post cmd returned %T, want postFailedMsg", msg)
	}
	if strings.Contains(failed.text, "[pasted content") {
		t.Fatalf("failed draft should not restore inert placeholder: %q", failed.text)
	}
	if failed.text != "line 1\nline 2\nline 3" {
		t.Fatalf("failed draft = %q, want expanded paste body", failed.text)
	}

	model, _ = a.Update(failed)
	a = model.(*App)
	if got := a.inputComposer.input.Value(); got != "line 1\nline 2\nline 3" {
		t.Fatalf("restored input = %q, want expanded paste body", got)
	}
	if strings.Contains(a.inputComposer.input.Value(), "[pasted content") || len(a.inputComposer.pastes) != 0 {
		t.Fatalf("retry draft should be expanded and have no stale paste records, input=%q pastes=%d", a.inputComposer.input.Value(), len(a.inputComposer.pastes))
	}
}

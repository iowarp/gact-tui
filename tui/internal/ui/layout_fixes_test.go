// Tests for the M-series fixes: footer clipping, shift+enter newline,
// bracketed-paste gating, and /clear optimistic updates.
//
// These tests bypass tea.NewProgram and poke the App model directly — the
// same pattern app_view_test.go already established for deterministic
// rendering and key-press behavioural tests.
package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// longConversation returns n alternating user/assistant messages so the
// rendered body is guaranteed to exceed any realistic viewport.
func longConversation(sessionID string, n int) []gact.Message {
	out := make([]gact.Message, 0, n)
	for i := 0; i < n; i++ {
		role := gact.RoleUser
		text := "user turn "
		if i%2 == 1 {
			role = gact.RoleAssistant
			text = "assistant turn "
		}
		out = append(out, gact.Message{
			ID:        "msg_" + itoa(i),
			SessionID: sessionID,
			Role:      role,
			Parts: []gact.Part{{
				ID: "p" + itoa(i), Type: gact.PartTypeText,
				Text: text + itoa(i) + "\nsecond line of " + itoa(i) + "\nthird line of " + itoa(i),
			}},
		})
	}
	return out
}

// TestFooter_StaysInFrameOnLongConversation reproduces the user-reported
// "footer disappears when conversation grows" bug. The fix keeps the
// total rendered height equal to a.height, which guarantees the footer
// row is visible at the bottom.
func TestFooter_StaysInFrameOnLongConversation(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 40))

	const W, H = 110, 30
	rendered := renderAtSize(a, W, H)
	lines := strings.Split(rendered, "\n")
	if len(lines) > H {
		t.Fatalf("rendered %d lines for height=%d — footer would overflow", len(lines), H)
	}

	// Footer must be on the last visible line (contains "Ctrl+N" hint).
	last := lines[len(lines)-1]
	if !strings.Contains(last, "Ctrl+N") {
		t.Fatalf("last row missing footer hint (Ctrl+N) — got:\n%q", last)
	}
}

// TestShiftEnter_InsertsNewline checks that the textarea's InsertNewline
// keymap accepts shift+enter (our rebinding) and produces a two-line
// buffer.
func TestShiftEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.input.Focus()
	a.input.SetValue("first")

	// Simulate typing "shift+enter" then "second".
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter, Mod: tea.ModShift})
	a = out.(*App)
	for _, r := range "second" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}

	got := a.input.Value()
	if !strings.Contains(got, "\n") {
		t.Fatalf("expected newline in buffer, got %q", got)
	}
	if !strings.HasPrefix(got, "first") || !strings.HasSuffix(got, "second") {
		t.Fatalf("buffer content unexpected: %q", got)
	}
}

// TestEnter_InPaste_DoesNotSend guards the multi-prompt bug. During a
// bracketed paste window (PasteStartMsg received, PasteEndMsg not yet)
// a stray Enter keypress must NOT flush the buffer as a message — it
// should flow into the textarea as a literal newline.
func TestEnter_InPaste_DoesNotSend(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("line-one")

	// Enter "paste mode" (simulates terminal sending ESC[200~).
	out, _ := a.Update(tea.PasteStartMsg{})
	a = out.(*App)
	if !a.inPaste {
		t.Fatalf("PasteStartMsg didn't set inPaste")
	}

	// Simulate an Enter keypress during paste — the bug was that this
	// triggered postMessageCmd and split the paste into multiple prompts.
	// Now it should flow to the textarea (newline in buffer, buffer not
	// reset).
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.input.Value() == "" {
		t.Fatalf("buffer was reset — Enter was intercepted despite inPaste")
	}

	// End of paste.
	out, _ = a.Update(tea.PasteEndMsg{})
	a = out.(*App)
	if a.inPaste {
		t.Fatalf("PasteEndMsg didn't clear inPaste")
	}
}

// TestBackslashEnter_InsertsNewline covers the Claude-Code muscle-memory
// rule: a trailing "\" + Enter drops the "\" and inserts a literal
// newline instead of sending.
func TestBackslashEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.input.Focus()
	a.input.SetValue("before\\")

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	got := a.input.Value()
	if got != "before\n" {
		t.Fatalf("expected %q, got %q", "before\n", got)
	}
}

// TestHelpOverlay_TabCycles checks that ←/→ rotate helpTab within bounds
// so the tabbed help overlay never wraps past either end.
func TestHelpOverlay_TabCycles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.helpOpen = true
	a.helpTab = 0

	// Right should increment up to helpTabCount-1 and stop.
	for i := 1; i < helpTabCount; i++ {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
		if a.helpTab != i {
			t.Fatalf("after %d right-presses, helpTab = %d, want %d", i, a.helpTab, i)
		}
	}
	// One more right should stay pinned to the last tab.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.helpTab != helpTabCount-1 {
		t.Fatalf("right past last tab: helpTab = %d, want %d", a.helpTab, helpTabCount-1)
	}

	// Left walks back to 0 and stops.
	for i := helpTabCount - 2; i >= 0; i-- {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
		if a.helpTab != i {
			t.Fatalf("helpTab = %d, want %d", a.helpTab, i)
		}
	}
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.helpTab != 0 {
		t.Fatalf("left past first tab: helpTab = %d, want 0", a.helpTab)
	}
}

// TestHelpOverlay_FitsInSmallViewport verifies the overlay no longer
// overflows at the viewport size users report — 80x24 was the smallest
// size reviewers complained about.
func TestHelpOverlay_FitsInSmallViewport(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.helpOpen = true

	for _, dim := range []struct{ W, H int }{
		{80, 24}, {100, 30}, {110, 30},
	} {
		for tab := 0; tab < helpTabCount; tab++ {
			a.helpTab = tab
			rendered := renderAtSize(a, dim.W, dim.H)
			lines := strings.Count(rendered, "\n") + 1
			if lines > dim.H {
				t.Errorf("tab=%d W=%d H=%d: rendered %d lines > H", tab, dim.W, dim.H, lines)
			}
		}
	}
}

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

	buf := a.input.Value()
	if !strings.Contains(buf, "[pasted content") {
		t.Fatalf("buffer missing placeholder, got %q", buf)
	}
	if !strings.Contains(buf, "4 lines") {
		t.Fatalf("placeholder doesn't report line count, got %q", buf)
	}
	if len(a.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.pastes))
	}
	if a.pastes[0].content != "line 1\nline 2\nline 3\nline 4" {
		t.Fatalf("paste content not preserved: %q", a.pastes[0].content)
	}

	// expandPasteText should replace the placeholder with the real body.
	expanded := a.expandPasteText(buf)
	if !strings.Contains(expanded, "line 1\nline 2\nline 3\nline 4") {
		t.Fatalf("expand failed: %q", expanded)
	}
	if strings.Contains(expanded, "[pasted content") {
		t.Fatalf("placeholder survived expansion: %q", expanded)
	}
}

// TestPaste_ShortPassesThrough ensures 2-line pastes don't trigger the
// compression path — overhead isn't worth it at small sizes and the
// user experience of "pasted content: 2 lines" would feel silly.
func TestPaste_ShortPassesThrough(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "one\ntwo"})
	a = out.(*App)
	if len(a.pastes) != 0 {
		t.Fatalf("short paste shouldn't compress, pastes=%d", len(a.pastes))
	}
	// Content should be in the textarea directly (textarea's own
	// PasteMsg handling).
	if !strings.Contains(a.input.Value(), "one") {
		t.Fatalf("short paste content missing: %q", a.input.Value())
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
	if !strings.Contains(a.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Ctrl+P has no Text payload — Ctrl-modified keys aren't
	// considered printable input.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	a = out.(*App)

	buf := a.input.Value()
	if strings.Contains(buf, "[pasted content") {
		t.Fatalf("Ctrl+P didn't expand: %q", buf)
	}
	if !strings.Contains(buf, "a\nb\nc") {
		t.Fatalf("expanded content missing: %q", buf)
	}
	if len(a.pastes) != 0 {
		t.Fatalf("paste record should be dropped after expand, got %d", len(a.pastes))
	}
}

// TestFilePicker_OpensOnAtAndInserts verifies M6: typing `@` at the
// start of input opens the picker, Enter on a loaded entry inserts
// `@path` into the buffer and triggers an AddContextFile command.
func TestFilePicker_OpensOnAtAndInserts(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Typing @ on empty input opens picker.
	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if !a.filePickerOpen {
		t.Fatalf("@ on empty didn't open picker")
	}

	// Inject loaded entries so we can exercise the selection path
	// without a live backend round-trip.
	a.filePicker.entries = []gact.FileEntry{
		{Path: "main.go", Type: "file"},
		{Path: "README.md", Type: "file"},
		{Path: "internal/store/store.go", Type: "file"},
	}
	a.filePicker.loaded = true

	// Type "sto" — should narrow to internal/store/store.go.
	for _, r := range "sto" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}
	matches := a.filePickerMatches()
	if len(matches) != 1 || matches[0].Path != "internal/store/store.go" {
		t.Fatalf("filter 'sto' didn't narrow: %+v", matches)
	}

	// Enter inserts.
	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.filePickerOpen {
		t.Fatalf("Enter didn't close picker")
	}
	if !strings.Contains(a.input.Value(), "@internal/store/store.go") {
		t.Fatalf("insert missing: %q", a.input.Value())
	}
	if cmd == nil {
		t.Fatalf("expected addContextFile cmd after insert")
	}
}

// TestFilePicker_AtMidWordPassesThrough ensures @ in the middle of a
// word (e.g. typing an email address) doesn't hijack input.
func TestFilePicker_AtMidWordPassesThrough(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("hi jaime")

	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if a.filePickerOpen {
		t.Fatalf("@ mid-word opened picker — should have passed through")
	}
}

// TestCompose_OpenCommitCancel covers M5's full state machine:
// Ctrl+G opens with seeded draft, Ctrl+S commits the modal body back
// to the base input, Esc cancels and preserves the pre-modal draft.
func TestCompose_OpenCommitCancel(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}

	// Open + commit path.
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("seed draft")

	out, _ := a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if !a.composeOpen {
		t.Fatalf("Ctrl+G didn't open compose modal")
	}
	if a.compose.ta.Value() != "seed draft" {
		t.Fatalf("compose not seeded: %q", a.compose.ta.Value())
	}

	// Type "more" in the compose modal.
	for _, r := range " more" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}
	// Ctrl+S commits.
	out, _ = a.Update(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	a = out.(*App)
	if a.composeOpen {
		t.Fatalf("Ctrl+S didn't close compose modal")
	}
	if a.input.Value() != "seed draft more" {
		t.Fatalf("commit didn't land: %q", a.input.Value())
	}

	// Open + cancel path.
	a2 := newReadyApp(sessions, nil)
	a2.focus = FocusInput
	a2.input.SetValue("original")

	out, _ = a2.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a2 = out.(*App)
	// Edit inside modal.
	for _, r := range " edit" {
		out, _ = a2.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a2 = out.(*App)
	}
	// Esc cancels.
	out, _ = a2.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	a2 = out.(*App)
	if a2.composeOpen {
		t.Fatalf("Esc didn't close compose modal")
	}
	if a2.input.Value() != "original" {
		t.Fatalf("cancel overwrote base input: %q", a2.input.Value())
	}
}

// TestCompose_ExpandsPastesOnOpen ensures compressed paste placeholders
// get inlined when the compose modal opens — "where everything
// renders expanded" is the point of the view.
func TestCompose_ExpandsPastesOnOpen(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Paste → placeholder in base input.
	out, _ := a.Update(tea.PasteMsg{Content: "a\nb\nc"})
	a = out.(*App)
	if !strings.Contains(a.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Open compose.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if strings.Contains(a.compose.ta.Value(), "[pasted content") {
		t.Fatalf("compose kept placeholder: %q", a.compose.ta.Value())
	}
	if !strings.Contains(a.compose.ta.Value(), "a\nb\nc") {
		t.Fatalf("compose missing expanded content: %q", a.compose.ta.Value())
	}
	if len(a.pastes) != 0 {
		t.Fatalf("pastes weren't cleared after compose open")
	}
}

// TestCollapseThreshold_ArrowKeysAdjust verifies the Settings > TUI tab
// keybindings for the collapse-threshold stepper: ←/→ nudge the value
// between 1 and 50 inclusive without blowing up.
func TestCollapseThreshold_ArrowKeysAdjust(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 5

	// Right bumps up.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.CollapseThreshold != 6 {
		t.Fatalf("right: got %d, want 6", a.Theme.CollapseThreshold)
	}

	// Left decrements.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.Theme.CollapseThreshold != 5 {
		t.Fatalf("left: got %d, want 5", a.Theme.CollapseThreshold)
	}

	// Lower bound is 1 — many lefts shouldn't drop below it.
	for i := 0; i < 10; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
	}
	if a.Theme.CollapseThreshold != 1 {
		t.Fatalf("clamp low: got %d, want 1", a.Theme.CollapseThreshold)
	}

	// Upper bound is 50.
	for i := 0; i < 60; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
	}
	if a.Theme.CollapseThreshold != 50 {
		t.Fatalf("clamp high: got %d, want 50", a.Theme.CollapseThreshold)
	}
}

// TestRenderBody_ReturnsExactHeight is the tightest contract: regardless
// of content size, the final rendered tui View is bounded by a.height
// rows. The footer can only stay in frame if every other pane respects
// the budget.
func TestRenderBody_ReturnsExactHeight(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 100))

	for _, dim := range []struct{ W, H int }{
		{80, 20}, {100, 30}, {140, 40}, {60, 12},
	} {
		rendered := renderAtSize(a, dim.W, dim.H)
		got := lipgloss.Height(rendered)
		if got > dim.H {
			t.Errorf("W=%d H=%d: rendered %d lines (> H)", dim.W, dim.H, got)
		}
	}
}

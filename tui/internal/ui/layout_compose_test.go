package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestCompose_OpenCommitCancel covers M5's full state machine:
// Ctrl+G opens with seeded draft, Ctrl+S commits the modal body back
// to the base input, Esc cancels and preserves the pre-modal draft.
func TestCompose_OpenCommitCancel(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}

	// Open + commit path.
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.input.SetValue("seed draft")

	out, _ := a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if !a.inputComposer.composeOpen {
		t.Fatalf("Ctrl+G didn't open compose modal")
	}
	if a.inputComposer.compose.ta.Value() != "seed draft" {
		t.Fatalf("compose not seeded: %q", a.inputComposer.compose.ta.Value())
	}

	// Type "more" in the compose modal.
	for _, r := range " more" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}
	// Ctrl+S commits.
	out, _ = a.Update(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	a = out.(*App)
	if a.inputComposer.composeOpen {
		t.Fatalf("Ctrl+S didn't close compose modal")
	}
	if a.inputComposer.input.Value() != "seed draft more" {
		t.Fatalf("commit didn't land: %q", a.inputComposer.input.Value())
	}

	// Open + cancel path.
	a2 := newReadyApp(sessions, nil)
	a2.focus = FocusInput
	a2.inputComposer.input.SetValue("original")

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
	if a2.inputComposer.composeOpen {
		t.Fatalf("Esc didn't close compose modal")
	}
	if a2.inputComposer.input.Value() != "original" {
		t.Fatalf("cancel overwrote base input: %q", a2.inputComposer.input.Value())
	}
}

func TestComposeButtonsUseSemanticHitTargets(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.input.SetValue("seed")
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue("seed from button")

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:commit")
	if !ok {
		t.Fatal("missing compose commit button hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.inputComposer.composeOpen {
		t.Fatal("commit button should close compose modal")
	}
	if got := a.inputComposer.input.Value(); got != "seed from button" {
		t.Fatalf("commit button wrote %q", got)
	}
}

func TestComposeCopyButtonUsesScopedClipboard(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue("draft line one\ndraft line two")
	mu, copied, _ := withClipboardSpy(t)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:copy")
	if !ok {
		t.Fatal("missing compose copy button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("compose copy button should not dispatch a command")
	}
	if !a.inputComposer.composeOpen || a.inputComposer.compose == nil {
		t.Fatal("compose copy should leave compose modal open")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "draft line one\ndraft line two" {
		t.Fatalf("compose copy clipboard = %q", gotCopy)
	}
	if !strings.Contains(a.transientHint, "copied compose draft") {
		t.Fatalf("compose copy hint = %q, want confirmation", a.transientHint)
	}
}

func TestComposeButtonsAlignWithSharedHeader(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.input.SetValue("seed")
	a.inputComposer.openCompose()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:commit")
	if !ok {
		t.Fatal("missing compose commit button hit target")
	}
	if _, ok := findHitTargetForTest(a, "button:compose:copy"); !ok {
		t.Fatal("missing compose copy button hit target")
	}
	view := a.inputComposer.viewCompose()
	rect := overlayMouseRect(view, a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("compose commit button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestComposeTextareaClickPlacesCursor(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.input.SetValue("seed")
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue("alpha\nbravo")
	a.inputComposer.compose.ta.CursorEnd()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "textarea:compose:cursor:1:2")
	if !ok {
		t.Fatal("missing compose textarea cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("compose cursor click should not dispatch a command")
	}
	if !a.inputComposer.composeOpen || a.inputComposer.compose == nil {
		t.Fatal("compose cursor click should keep compose open")
	}
	if a.inputComposer.compose.ta.Line() != 1 || a.inputComposer.compose.ta.Column() != 2 {
		t.Fatalf("compose cursor line=%d col=%d, want 1:2", a.inputComposer.compose.ta.Line(), a.inputComposer.compose.ta.Column())
	}
	model, _ = a.Update(tea.KeyPressMsg{Code: 'Z', Text: "Z"})
	a = model.(*App)
	if got := a.inputComposer.compose.ta.Value(); got != "alpha\nbrZavo" {
		t.Fatalf("typing after compose click inserted at %q, want alpha/brZavo", got)
	}
}

func TestComposeMouseWheelMovesTextareaCursor(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue(strings.Join([]string{
		"line 00", "line 01", "line 02", "line 03", "line 04",
		"line 05", "line 06", "line 07", "line 08", "line 09",
		"line 10", "line 11", "line 12", "line 13", "line 14",
	}, "\n"))
	a.inputComposer.compose.ta.CursorEnd()

	_ = a.View()
	startLine := a.inputComposer.compose.ta.Line()
	target, ok := findHitTargetForTest(a, "textarea:compose:wheel")
	if !ok {
		t.Fatal("missing compose textarea wheel target")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("compose wheel should not dispatch a command")
	}
	if !a.inputComposer.composeOpen || a.inputComposer.compose == nil {
		t.Fatal("compose wheel should keep compose open")
	}
	if got := a.inputComposer.compose.ta.Line(); got >= startLine {
		t.Fatalf("wheel up should move the compose cursor upward, got line %d from %d", got, startLine)
	}
}

func TestComposeMouseWheelOnModalChromeDoesNotMoveTextareaCursor(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue(strings.Join([]string{
		"line 00", "line 01", "line 02", "line 03", "line 04",
		"line 05", "line 06", "line 07", "line 08", "line 09",
	}, "\n"))
	a.inputComposer.compose.ta.CursorEnd()

	_ = a.View()
	startLine := a.inputComposer.compose.ta.Line()
	surface, ok := findHitTargetForTest(a, "compose:surface:wheel")
	if !ok {
		t.Fatal("missing compose surface wheel target")
	}
	rect := overlayMouseRect(a.inputComposer.viewCompose(), a.width, a.height)
	if surface.rect != rect {
		t.Fatalf("compose surface wheel rect = %+v, want modal rect %+v", surface.rect, rect)
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      rect.x + 1,
		Y:      rect.y + 1,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("compose chrome wheel should not dispatch a command")
	}
	if got := a.inputComposer.compose.ta.Line(); got != startLine {
		t.Fatalf("wheel on compose chrome should not move cursor, got line %d from %d", got, startLine)
	}
}

func TestComposeOutsideClickUsesSharedCancelState(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width, a.height = 120, 40
	a.inputComposer.input.SetValue("original")
	a.inputComposer.openCompose()
	a.inputComposer.compose.ta.SetValue("discarded edit")

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside click should not dispatch a command")
	}
	if a.inputComposer.composeOpen || a.inputComposer.compose != nil {
		t.Fatalf("outside click should close compose, open=%v compose=%v", a.inputComposer.composeOpen, a.inputComposer.compose)
	}
	if got := a.inputComposer.input.Value(); got != "original" {
		t.Fatalf("outside click should cancel without changing base input, got %q", got)
	}
}

// TestCompose_ExpandsPastesOnOpen ensures compressed paste placeholders
// get inlined when the compose modal opens; that expanded view is the point of
// opening the full editor.
func TestCompose_ExpandsPastesOnOpen(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Paste -> placeholder in base input.
	out, _ := a.Update(tea.PasteMsg{Content: "a\nb\nc"})
	a = out.(*App)
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Open compose.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if strings.Contains(a.inputComposer.compose.ta.Value(), "[pasted content") {
		t.Fatalf("compose kept placeholder: %q", a.inputComposer.compose.ta.Value())
	}
	if !strings.Contains(a.inputComposer.compose.ta.Value(), "a\nb\nc") {
		t.Fatalf("compose missing expanded content: %q", a.inputComposer.compose.ta.Value())
	}
	if len(a.inputComposer.pastes) != 0 {
		t.Fatalf("pastes weren't cleared after compose open")
	}
}

func TestCompose_PasteNormalizesCRLF(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.openCompose()

	out, _ := a.Update(tea.PasteMsg{Content: "alpha\r\nbeta\rgamma"})
	a = out.(*App)

	if !a.inputComposer.composeOpen || a.inputComposer.compose == nil {
		t.Fatal("compose should remain open after paste")
	}
	if got := a.inputComposer.compose.ta.Value(); got != "alpha\nbeta\ngamma" {
		t.Fatalf("compose paste = %q, want normalized LF newlines", got)
	}
}

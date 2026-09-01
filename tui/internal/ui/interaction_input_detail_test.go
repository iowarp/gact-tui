package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestInputCommandChipUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("input command chip click should not dispatch a command")
	}
	if !a.cmdPalette.paletteOpen || a.cmdPalette.paletteFilter != "" || a.cmdPalette.paletteSel != 0 {
		t.Fatalf("input command chip should open palette, open=%v filter=%q sel=%d", a.cmdPalette.paletteOpen, a.cmdPalette.paletteFilter, a.cmdPalette.paletteSel)
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func TestInputCommandChipHitUsesRenderedTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0

	view := a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command hit target")
	}
	lines := strings.Split(ansi.Strip(view.Content), "\n")
	if target.rect.y < 0 || target.rect.y >= len(lines) {
		t.Fatalf("input command y=%d outside rendered screen with %d rows", target.rect.y, len(lines))
	}
	if got := renderedCellsForTest(lines[target.rect.y], target.rect.x, target.rect.w); got != a.inputComposer.commandChipPlain() {
		t.Fatalf("input command hit covers %q, want rendered chip %q on line %q", got, a.inputComposer.commandChipPlain(), lines[target.rect.y])
	}
}

func TestInputFocusSurfaceRectUsesMainPaneGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect := a.inputComposer.focusSurfaceRect(28, 1, 3, 88)
	want := mouseRect{x: 30, y: 29, w: 86, h: 4}
	if rect != want {
		t.Fatalf("input focus rect = %+v, want %+v", rect, want)
	}
}

func TestInputPastePlaceholderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusInput
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.Theme.PasteCompressThreshold = 3

	model, cmd := a.Update(tea.PasteMsg{Content: "alpha\nbeta\ngamma"})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("compressed paste should not dispatch a command")
	}
	if len(a.inputComposer.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.inputComposer.pastes))
	}
	if !strings.Contains(a.inputComposer.input.Value(), "[pasted content #1: 3 lines]") {
		t.Fatalf("input missing paste placeholder: %q", a.inputComposer.input.Value())
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:paste:0")
	if !ok {
		t.Fatal("missing semantic input paste placeholder target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("paste placeholder click should not dispatch a command")
	}
	if len(a.inputComposer.pastes) != 0 {
		t.Fatalf("pastes = %d, want expanded/cleared", len(a.inputComposer.pastes))
	}
	if got := a.inputComposer.input.Value(); got != "alpha\nbeta\ngamma " {
		t.Fatalf("expanded input = %q", got)
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func TestDetailCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.detail.visible = true
	a.detail.scroll = 3
	a.detail.ref = &bulkyPartRef{
		title:    "Context detail",
		fullText: strings.Repeat("detail line\n", 20),
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:detail:close")
	if !ok {
		t.Fatal("missing semantic detail close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking detail close should not dispatch a command")
	}
	if a.detail.visible || a.detail.ref != nil {
		t.Fatal("clicking detail close should close detail")
	}
	if a.detail.scroll != 0 {
		t.Fatalf("detailScroll = %d, want reset to 0", a.detail.scroll)
	}
}

func TestDetailOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.detail.visible = true
	a.detail.scroll = 4
	a.detail.ref = &bulkyPartRef{
		title:    "Very long detail title that should not collide with the close action",
		fullText: strings.Repeat("detail line\n", 20),
	}

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside detail click should not dispatch a command")
	}
	if a.detail.visible || a.detail.ref != nil || a.detail.scroll != 0 {
		t.Fatalf("outside click should close detail and reset state, open=%v detail=%v scroll=%d", a.detail.visible, a.detail.ref, a.detail.scroll)
	}
}

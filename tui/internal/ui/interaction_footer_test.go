package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestFooterActionsUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 180
	a.height = 36
	a.stage = StageReady
	a.focus = FocusInput

	_ = a.View()
	paneTarget, ok := findHitTargetForTest(a, "footer:pane")
	if !ok {
		t.Fatal("missing visible footer pane hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      paneTarget.rect.x,
		Y:      paneTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer pane click should not dispatch a command")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("footer pane click should cycle focus to sidebar, got %v", a.focus)
	}

	a.focus = FocusInput
	_ = a.View()
	focusTarget, ok := findHitTargetForTest(a, "footer:focus")
	if !ok {
		t.Fatal("missing visible footer focus hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      focusTarget.rect.x,
		Y:      focusTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer focus click should not dispatch a command")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("footer focus click should cycle focus to sidebar, got %v", a.focus)
	}

	a.focus = FocusInput
	_ = a.View()
	settingsTarget, ok := findHitTargetForTest(a, "footer:settings")
	if !ok {
		t.Fatal("missing visible footer settings hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      settingsTarget.rect.x,
		Y:      settingsTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settings.open {
		t.Fatalf("footer settings click should open settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if cmd == nil {
		t.Fatal("footer settings click should dispatch settings load command")
	}

	a.settings.open = false
	_ = a.View()
	helpTarget, ok := findHitTargetForTest(a, "footer:help")
	if !ok {
		t.Fatal("missing visible footer help hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      helpTarget.rect.x,
		Y:      helpTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer help click should not dispatch a command")
	}
	if !a.help.open || a.help.tab != 0 || a.help.scroll != 0 {
		t.Fatalf("footer help click should open help from first tab, open=%v tab=%d scroll=%d", a.help.open, a.help.tab, a.help.scroll)
	}

	a.help.open = false
	_ = a.View()
	commandTarget, ok := findHitTargetForTest(a, "footer:command")
	if !ok {
		t.Fatal("missing visible footer command hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      commandTarget.rect.x,
		Y:      commandTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer command click should not dispatch a command")
	}
	if !a.cmdPalette.paletteOpen || a.cmdPalette.paletteFilter != "" || a.cmdPalette.paletteSel != 0 {
		t.Fatalf("footer command click should open command palette, open=%v filter=%q sel=%d", a.cmdPalette.paletteOpen, a.cmdPalette.paletteFilter, a.cmdPalette.paletteSel)
	}

	a.cmdPalette.paletteOpen = false
	_ = a.View()
	quitTarget, ok := findHitTargetForTest(a, "footer:quit")
	if !ok {
		t.Fatal("missing visible footer quit hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      quitTarget.rect.x,
		Y:      quitTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer quit click should not immediately dispatch a command")
	}
	if !a.quitConfirm.open || a.quitConfirm.selected != 0 {
		t.Fatalf("footer quit click should open quit confirmation, open=%v selected=%d", a.quitConfirm.open, a.quitConfirm.selected)
	}
}

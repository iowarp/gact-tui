package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestHelpTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.help.open = true
	a.help.tab = 0

	_ = a.View()
	targetTab := helpTabIndex("Commands")
	target, ok := findHitTargetForTest(a, "tab:help-commands")
	if !ok {
		t.Fatal("missing semantic help commands tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.help.tab != targetTab {
		t.Fatalf("helpTab = %d, want %d", a.help.tab, targetTab)
	}
	if !a.help.open {
		t.Fatal("clicking a help tab should not close help")
	}
}

func TestHelpCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.help.open = true
	a.help.tab = helpTabIndex("Commands")

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:help:close")
	if !ok {
		t.Fatal("missing semantic help close button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking help close should not dispatch a command")
	}
	if a.help.open {
		t.Fatal("clicking help close should close help")
	}
	if a.help.tab != 0 {
		t.Fatalf("helpTab = %d, want reset to 0", a.help.tab)
	}
}

func TestHelpOverlayUsesSharedBodyWindowAndMouseWheel(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 16
	a.stage = StageReady
	a.help.open = true
	a.help.tab = helpTabIndex("Commands")
	a.help.scroll = 1 << 30

	out := stripANSI(a.help.view())
	if !strings.Contains(out, "switch tab") {
		t.Fatalf("help footer should keep the base hint visible:\n%s", out)
	}
	if a.help.scroll <= 0 {
		t.Fatalf("render should clamp and persist positive help scroll, got %d", a.help.scroll)
	}

	before := a.help.scroll
	_ = a.View()
	target, ok := findHitTargetForTest(a, "help:body:wheel")
	if !ok {
		t.Fatal("missing semantic help body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.help.scroll >= before {
		t.Fatalf("wheel up should reduce help scroll, before=%d after=%d", before, a.help.scroll)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "help:surface:wheel")
	if !ok {
		t.Fatal("missing help surface wheel blocker")
	}
	before = a.help.scroll
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.help.scroll != before {
		t.Fatalf("wheel on help chrome should not scroll help, before=%d after=%d", before, a.help.scroll)
	}
}

package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestSettingsTUIRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:tui:cost-danger")
	if !ok {
		t.Fatal("missing semantic settings TUI cost danger target")
	}
	if target.rect.h != 1 {
		t.Fatalf("TUI row target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "token danger") || !strings.Contains(out, "150K") {
		t.Fatalf("TUI row should render label and value inline:\n%s", out)
	}
	if strings.Contains(out, "footer turns red near") {
		t.Fatalf("unselected TUI rows should keep descriptions out of the dense list:\n%s", out)
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings.tuiRow != 2 {
		t.Fatalf("settings TUI row = %v, want row 2", a.settings)
	}
	if !a.settings.open {
		t.Fatal("clicking a TUI option should not close settings")
	}
}

func TestSettingsTUISelectedRowUsesDetailSpace(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}

	_ = a.View()
	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "tool_result bodies longer than N lines collapse to a preview") {
		t.Fatalf("selected TUI row should render its full explanation in the body:\n%s", out)
	}
	if strings.Contains(out, "tool_result bodies longer than N lines collapse ...") {
		t.Fatalf("selected TUI row explanation should not be clipped with an ellipsis:\n%s", out)
	}
	target, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold")
	if !ok {
		t.Fatal("missing selected TUI row semantic target")
	}
	if target.rect.h < 2 {
		t.Fatalf("selected TUI row target height = %d, want detail row included", target.rect.h)
	}
}

func TestSettingsTUILayoutEditorMouseOpensModal(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 42
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 6}
	a.MouseEnabled = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:tui:layout-editor:open")
	if !ok {
		t.Fatal("missing sidebar layout editor open target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w/2,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.sidebarLayout.open {
		t.Fatal("layout editor mouse target should open the sidebar layout modal")
	}
	if a.settings.tuiRow != 6 {
		t.Fatalf("layout editor click should keep TUI row selected, settings=%+v", a.settings)
	}
}

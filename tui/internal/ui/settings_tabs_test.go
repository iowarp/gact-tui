package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestSettings_TabCycleWrapsAround(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{}

	// Four tabs (Model, Agent, Theme, TUI); Tab should step through
	// 0→1→2→3→0 without skipping or overshooting.
	for _, want := range []int{1, 2, 3, 0} {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyTab})
		if a.settings.tab != want {
			t.Errorf("Tab cycle → %d, want %d", a.settings.tab, want)
		}
	}
}

func TestSettings_ShiftTabCyclesBackwards(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 0}

	// Shift+Tab from 0 wraps to last tab (3).
	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift})
	if a.settings.tab != 3 {
		t.Errorf("Shift+Tab wrap-around = %d, want 3", a.settings.tab)
	}
}

func TestSettings_ThemeTabUpDownCycle(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 2, themeSel: 0}

	last := len(AllThemeModes) - 1

	// ↓ from 0 should advance to 1.
	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.settings.themeSel != 1 {
		t.Errorf("themeSel after ↓ = %d, want 1", a.settings.themeSel)
	}
	// Walk ↓ to the end, then confirm clamp.
	for i := 0; i < last*2; i++ {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}
	if a.settings.themeSel != last {
		t.Errorf("themeSel clamp at end = %d, want %d", a.settings.themeSel, last)
	}
	// ↑ back to 0, then confirm clamp.
	for i := 0; i < last*2; i++ {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyUp})
	}
	if a.settings.themeSel != 0 {
		t.Errorf("themeSel clamp below = %d, want 0", a.settings.themeSel)
	}
}

func TestSettings_ThemeEnterSwapsThemeLive(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 2, themeSel: 1} // "light"

	before := themeName(a.Theme)
	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settingsOpen {
		t.Error("Enter on Theme tab should close the modal")
	}
	if before == "light" {
		t.Skip("theme was already light, skipping swap assertion")
	}
	if themeName(a.Theme) != "light" {
		t.Errorf("theme after Enter = %q, want 'light'", themeName(a.Theme))
	}
	if !strings.Contains(a.transientHint, "theme: ") {
		t.Errorf("hint = %q, want 'theme: ' prefix", a.transientHint)
	}
}

func TestSettings_TUITabEnterClosesWithoutSideEffects(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3}
	before := a.Theme
	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settingsOpen {
		t.Error("Enter on TUI tab should close the modal")
	}
	if themeName(a.Theme) != themeName(before) {
		t.Errorf("TUI tab Enter shouldn't change theme")
	}
}

func TestSettings_ThemeSelPreSeeds(t *testing.T) {
	// Ctrl+S on a light-themed app should open Settings with themeSel
	// already on "light" so the Theme tab doesn't regress.
	a := New("http://unused")
	a.Theme = ThemeForMode(ModeLight)
	_, _ = a.handleKey(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	if a.settings == nil {
		t.Fatal("settings not opened")
	}
	if a.settings.themeSel != 1 {
		t.Errorf("themeSel pre-seed = %d, want 1 when Theme is light", a.settings.themeSel)
	}
}

func TestThemeName(t *testing.T) {
	if got := themeName(ThemeForMode(ModeDark)); got != "dark" {
		t.Errorf("dark theme named %q", got)
	}
	if got := themeName(ThemeForMode(ModeLight)); got != "light" {
		t.Errorf("light theme named %q", got)
	}
}

func TestBoolPretty(t *testing.T) {
	if got := boolPretty(true); got != "on" {
		t.Errorf("boolPretty(true) = %q", got)
	}
	if got := boolPretty(false); got != "off" {
		t.Errorf("boolPretty(false) = %q", got)
	}
}

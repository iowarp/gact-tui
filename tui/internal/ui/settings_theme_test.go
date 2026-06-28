package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestSettings_ThemeTabUpDownCycle(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}

	last := len(AllThemeModes) - 1

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.settings.themeSel != 1 {
		t.Errorf("themeSel after down = %d, want 1", a.settings.themeSel)
	}
	for i := 0; i < last*2; i++ {
		a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}
	if a.settings.themeSel != last {
		t.Errorf("themeSel clamp at end = %d, want %d", a.settings.themeSel, last)
	}
	for i := 0; i < last*2; i++ {
		a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyUp})
	}
	if a.settings.themeSel != 0 {
		t.Errorf("themeSel clamp below = %d, want 0", a.settings.themeSel)
	}
}

func TestSettings_ThemeEnterSwapsThemeLive(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 1} // "light"

	before := themeName(a.Theme)
	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settings.open {
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

func TestSettingsThemeTabExportsCurrentTheme(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("GACT_THEME_FILE", "")

	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}

	_, cmd := a.settings.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if cmd == nil {
		t.Fatal("theme export should return hint expiration command")
	}
	path := filepath.Join(configRoot, "gact", "theme.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("theme export did not write %s: %v", path, err)
	}
	if !strings.Contains(string(data), `"name"`) {
		t.Fatalf("exported theme missing JSON payload: %s", data)
	}
	if !a.settings.open || a.settings.tab != 2 {
		t.Fatalf("theme export should keep Settings open on Theme tab, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if !strings.Contains(a.transientHint, "exported") || !strings.Contains(a.transientHint, "theme.json") {
		t.Fatalf("hint = %q, want exported theme path", a.transientHint)
	}
}

func TestSettingsThemeTabImportsCustomTheme(t *testing.T) {
	resetCustomThemeForTest(t)
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("GACT_THEME_FILE", "")
	path := filepath.Join(configRoot, "gact", "theme.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	doc := `{
		"name": "demo operator",
		"bg": "#101820",
		"fg": "#F2F7FF",
		"primary": "#5DD39E",
		"secondary": "#F4D35E"
	}`
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}

	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}
	a.Theme.CollapseThreshold = 11
	a.Theme.CostWarnTokens = 75_000
	a.Theme.CostDangerTokens = 175_000
	a.Theme.PasteCompressThreshold = 8
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	_, cmd := a.settings.handleKey(tea.KeyPressMsg{Code: 'i', Text: "i"})
	if cmd == nil {
		t.Fatal("theme import should return hint expiration command")
	}
	if got := ThemeModeFor(a.Theme); got != ModeCustom {
		t.Fatalf("theme after import = %s, want custom", ThemeModeName(got))
	}
	if !a.settings.open || a.settings.tab != 2 {
		t.Fatalf("theme import should keep Settings open on Theme tab, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if AllThemeModes[a.settings.themeSel] != ModeCustom {
		t.Fatalf("theme selection = %s, want custom", ThemeModeName(AllThemeModes[a.settings.themeSel]))
	}
	if a.Theme.CollapseThreshold != 11 || a.Theme.CostWarnTokens != 75_000 ||
		a.Theme.CostDangerTokens != 175_000 || a.Theme.PasteCompressThreshold != 8 {
		t.Fatalf("theme import reset operator prefs: %#v", a.Theme)
	}
	if called != 1 {
		t.Fatalf("SaveConfig calls = %d, want 1", called)
	}
	if !strings.Contains(a.transientHint, "loaded custom theme") || !strings.Contains(a.transientHint, "demo operator") {
		t.Fatalf("hint = %q, want loaded custom theme name", a.transientHint)
	}
}

func TestSettingsThemeTabShowsExportAction(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}

	out := ansi.Strip(a.settings.view())
	for _, want := range []string{"Export custom theme", "Reload custom theme", "e exports", "i reloads", "~/.config/gact/theme.json"} {
		if !strings.Contains(out, want) {
			t.Fatalf("theme settings missing visible export action %q:\n%s", want, out)
		}
	}
}

func TestSettingsThemeExportActionUsesSemanticHitTarget(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("GACT_THEME_FILE", "")

	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:theme:export")
	if !ok {
		t.Fatal("theme export action should register a semantic hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	if cmd == nil {
		t.Fatal("theme export click should dispatch export command")
	}
	a = model.(*App)
	path := filepath.Join(configRoot, "gact", "theme.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("theme export click did not write %s: %v", path, err)
	}
	if !a.settings.open || a.settings.tab != 2 {
		t.Fatalf("theme export click should keep Settings open on Theme tab, open=%v settings=%+v", a.settings.open, a.settings)
	}
}

func TestSettingsThemeImportActionUsesSemanticHitTarget(t *testing.T) {
	resetCustomThemeForTest(t)
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("GACT_THEME_FILE", "")
	path := filepath.Join(configRoot, "gact", "theme.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"name":"clicked","bg":"#120F24","fg":"#F8F8F2"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 2, themeSel: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:theme:import")
	if !ok {
		t.Fatal("theme import action should register a semantic hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	if cmd == nil {
		t.Fatal("theme import click should dispatch import command")
	}
	a = model.(*App)
	if got := ThemeModeFor(a.Theme); got != ModeCustom {
		t.Fatalf("theme after import click = %s, want custom", ThemeModeName(got))
	}
	if !a.settings.open || a.settings.tab != 2 {
		t.Fatalf("theme import click should keep Settings open on Theme tab, open=%v settings=%+v", a.settings.open, a.settings)
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

func TestThemeRoundTrip(t *testing.T) {
	for _, mode := range AllThemeModes {
		theme := ThemeForMode(mode)
		back := ThemeModeFor(theme)
		if back != mode {
			t.Errorf("round-trip %q (%d) -> %d failed", ThemeModeName(mode), mode, back)
		}
		if got := ParseThemeMode(ThemeModeName(mode)); got != mode {
			t.Errorf("Parse(Name(%d)) = %d, want %d", mode, got, mode)
		}
	}
}

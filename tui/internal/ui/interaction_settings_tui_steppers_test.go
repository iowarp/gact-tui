package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestSettingsTUIArrowControlsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 4

	_ = a.View()
	inc, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold:inc")
	if !ok {
		t.Fatal("missing semantic TUI increment target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      inc.rect.x,
		Y:      inc.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.Theme.CollapseThreshold != 5 {
		t.Fatalf("increment click should raise collapse threshold, got %d", a.Theme.CollapseThreshold)
	}
	if a.settings.tuiRow != 0 || !a.settings.open {
		t.Fatalf("increment click should keep settings open and row selected, settings=%+v open=%v", a.settings, a.settings.open)
	}

	_ = a.View()
	dec, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold:dec")
	if !ok {
		t.Fatal("missing semantic TUI decrement target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      dec.rect.x,
		Y:      dec.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.Theme.CollapseThreshold != 4 {
		t.Fatalf("decrement click should lower collapse threshold, got %d", a.Theme.CollapseThreshold)
	}
}

func TestSettingsTUIStepperArrowsWorkBeyondFirstRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	for _, tc := range []struct {
		id     string
		assert func(*testing.T, *App)
	}{
		{id: "cost-warn", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn right arrow = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{id: "cost-danger", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger right arrow = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{id: "paste-compress", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste compress right arrow = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
	} {
		_ = a.View()
		target, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":inc")
		if !ok {
			t.Fatalf("missing right-arrow target for %s", tc.id)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x + target.rect.w/2,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		tc.assert(t, a)
		if !a.settings.open {
			t.Fatalf("%s right-arrow click closed settings", tc.id)
		}
	}
}

func TestSettingsTUIStepperLeftHitAreasWorkBeyondFirstRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	for _, tc := range []struct {
		id     string
		assert func(*testing.T, *App)
	}{
		{id: "cost-warn", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000-costStep {
				t.Fatalf("cost warn left hit = %d, want %d", app.Theme.CostWarnTokens, 50_000-costStep)
			}
		}},
		{id: "cost-danger", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000-costStep {
				t.Fatalf("cost danger left hit = %d, want %d", app.Theme.CostDangerTokens, 100_000-costStep)
			}
		}},
		{id: "paste-compress", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 2 {
				t.Fatalf("paste compress left hit = %d, want 2", app.Theme.PasteCompressThreshold)
			}
		}},
	} {
		_ = a.View()
		target, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":dec")
		if !ok {
			t.Fatalf("missing left-arrow target for %s", tc.id)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x + target.rect.w/2,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		tc.assert(t, a)
		if !a.settings.open {
			t.Fatalf("%s left-hit click closed settings", tc.id)
		}
	}
}

func TestSettingsTUIEveryEditableRowHasMouseSelectionAndControls(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 42
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	cases := []struct {
		rowID  string
		incID  string
		want   int
		assert func(*testing.T, *App)
	}{
		{rowID: "settings:tui:cost-warn", incID: "settings:tui:cost-warn:inc", want: 1, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn inc = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{rowID: "settings:tui:cost-danger", incID: "settings:tui:cost-danger:inc", want: 2, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger inc = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{rowID: "settings:tui:paste-compress", incID: "settings:tui:paste-compress:inc", want: 3, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste compress inc = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
		{rowID: "settings:tui:intro", incID: "settings:tui:intro:inc", want: 4, assert: func(t *testing.T, app *App) {
			t.Helper()
			if !app.IntroDisabled {
				t.Fatal("intro inc should toggle IntroDisabled on")
			}
		}},
		{rowID: "settings:tui:mouse", incID: "settings:tui:mouse:inc", want: 5, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.MouseEnabled {
				t.Fatal("mouse inc should toggle MouseEnabled off")
			}
		}},
	}
	for _, tc := range cases {
		a.MouseEnabled = true
		_ = a.View()
		row, ok := findHitTargetForTest(a, tc.rowID)
		if !ok {
			t.Fatalf("missing row target %s", tc.rowID)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      row.rect.x,
			Y:      row.rect.y + row.rect.h - 1,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if a.settings.tuiRow != tc.want {
			t.Fatalf("%s click selected row %v, want %d", tc.rowID, a.settings, tc.want)
		}

		_ = a.View()
		inc, ok := findHitTargetForTest(a, tc.incID)
		if !ok {
			t.Fatalf("missing inc target %s", tc.incID)
		}
		model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      inc.rect.x + inc.rect.w/2,
			Y:      inc.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if a.settings.tuiRow != tc.want || !a.settings.open {
			t.Fatalf("%s click should keep row selected/open, settings=%+v open=%v", tc.incID, a.settings, a.settings.open)
		}
		tc.assert(t, a)
	}
}

func TestSettingsTUIVisibleArrowGlyphsAreClickableForEveryRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 42
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	cases := []struct {
		label  string
		assert func(*testing.T, *App)
	}{
		{label: "token warning", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn visible right arrow = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{label: "token danger", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger visible right arrow = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{label: "paste preview", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste visible right arrow = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
		{label: "intro splash skip", assert: func(t *testing.T, app *App) {
			t.Helper()
			if !app.IntroDisabled {
				t.Fatal("intro visible right arrow should toggle IntroDisabled on")
			}
		}},
		{label: "mouse selection", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.MouseEnabled {
				t.Fatal("mouse visible right arrow should toggle MouseEnabled off")
			}
		}},
	}

	for _, tc := range cases {
		a.MouseEnabled = true
		_ = a.View()
		view := a.settings.view()
		x, y := visibleSettingsArrowGlyphForTest(t, view, a.width, a.height, tc.label, "▶")
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      x,
			Y:      y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if !a.settings.open {
			t.Fatalf("%s visible right arrow closed settings", tc.label)
		}
		tc.assert(t, a)

		_ = a.View()
		view = a.settings.view()
		x, y = visibleSettingsArrowGlyphForTest(t, view, a.width, a.height, tc.label, "◀")
		model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      x,
			Y:      y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if !a.settings.open {
			t.Fatalf("%s visible left arrow closed settings", tc.label)
		}
	}
}

func visibleSettingsArrowGlyphForTest(t *testing.T, view string, width int, height int, label string, glyph string) (int, int) {
	t.Helper()
	rect := overlayMouseRect(view, width, height)
	for lineIdx, raw := range strings.Split(view, "\n") {
		line := ansi.Strip(raw)
		if !strings.Contains(line, label) || !strings.Contains(line, glyph) {
			continue
		}
		glyphIdx := strings.Index(line, glyph)
		if glyphIdx < 0 {
			continue
		}
		return rect.x + lipgloss.Width(line[:glyphIdx]), rect.y + lineIdx
	}
	t.Fatalf("missing visible %q glyph for settings row %q:\n%s", glyph, label, ansi.Strip(view))
	return 0, 0
}

package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestSettings_TabCycleWrapsAround(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40
	a.settings.open = true
	a.settings.settingsState = settingsState{}

	// Five tabs: Model, Expert, Theme, TUI, Language.
	for _, want := range []int{1, 2, 3, 4, 0} {
		a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
		if a.settings.tab != want {
			t.Errorf("Tab cycle -> %d, want %d", a.settings.tab, want)
		}
	}
}

func TestSettings_ShiftTabCyclesBackwards(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 0}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift})
	if a.settings.tab != 4 {
		t.Errorf("Shift+Tab wrap-around = %d, want 4", a.settings.tab)
	}
}

func TestSettings_TUITabEnterClosesWithoutSideEffects(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}
	before := a.Theme
	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settings.open {
		t.Error("Enter on TUI tab should close the modal")
	}
	if themeName(a.Theme) != themeName(before) {
		t.Errorf("TUI tab Enter shouldn't change theme")
	}
}

func TestSettingsTUITabUsesOperatorPreferenceLabels(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	out := ansi.Strip(a.settings.view())
	for _, want := range []string{"transcript preview", "token warning", "token danger", "paste preview"} {
		if !strings.Contains(out, want) {
			t.Fatalf("TUI settings missing operator label %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"Current connection", "connected to", "voice input", "screen mode"} {
		if !strings.Contains(out, want) {
			t.Fatalf("TUI settings missing runtime context label %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"collapse threshold", "cost warn tokens", "cost danger tokens", "paste compress", "Current runtime context", "Runtime state", "edit config.json", "server", "backend URL", "voice cmd", "terminal screen", "AltScreen"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("TUI settings leaked old backend-style label %q:\n%s", unwanted, out)
		}
	}
}

func TestSettingsTUITabUsesDeploymentLabelInsteadOfRawURL(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:41982", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.BackendLabel = "demo-clio (clio)"
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "connected to") || !strings.Contains(out, "demo-clio (clio)") {
		t.Fatalf("TUI settings missing friendly connection label:\n%s", out)
	}
	if strings.Contains(out, "http://127.0.0.1:41982") {
		t.Fatalf("TUI settings leaked raw backend URL despite deployment label:\n%s", out)
	}
}

func TestSettings_ThemeAndLanguageSelectionsPreSeed(t *testing.T) {
	a := New("http://unused")
	a.Theme = ThemeForMode(ModeLight)
	a.SetLocale("ja")

	_, _ = a.handleKey(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	if !a.settings.open {
		t.Fatal("settings not opened")
	}
	if a.settings.themeSel != 1 {
		t.Errorf("themeSel pre-seed = %d, want 1 when Theme is light", a.settings.themeSel)
	}
	wantLanguageSel := languageIndex("ja")
	if a.settings.languageSel != wantLanguageSel {
		t.Errorf("languageSel pre-seed = %d, want %d when locale is ja", a.settings.languageSel, wantLanguageSel)
	}
}

func TestSettings_LanguageTabPreviewsAndPersists(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40
	a.SetLocale("en")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 4, languageSel: 0}
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "el" {
		t.Fatalf("preview locale = %q, want el", got)
	}
	if got := ansi.Strip(a.settings.view()); !strings.Contains(got, "Ελληνικά") ||
		!strings.Contains(got, "μηχανική") {
		t.Fatalf("Greek settings view did not show language options/status: %q", got)
	}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "es" {
		t.Fatalf("preview locale = %q, want es", got)
	}
	if got := ansi.Strip(a.settings.view()); !strings.Contains(got, "Español") ||
		!strings.Contains(got, "traducción automática") {
		t.Fatalf("Spanish settings view did not show language options/status: %q", got)
	}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "ja" {
		t.Fatalf("preview locale = %q, want ja", got)
	}
	if got := ansi.Strip(a.settings.view()); !strings.Contains(got, "日本語") ||
		!strings.Contains(got, "機械翻訳") {
		t.Fatalf("Japanese settings view did not show language options/status: %q", got)
	}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settings.open {
		t.Fatal("Enter on Language tab should close the modal")
	}
	if called != 1 {
		t.Fatalf("SaveConfig calls = %d, want 1", called)
	}
	if !strings.Contains(a.transientHint, "言語") {
		t.Fatalf("transientHint = %q, want localized language confirmation", a.transientHint)
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

func TestSettings_TUIPrefsMouseToggle(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 5}
	a.MouseEnabled = true
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyLeft, Text: "left"})
	a = model.(*App)
	if a.MouseEnabled {
		t.Fatal("MouseEnabled = true after toggle, want false")
	}
	if called != 1 {
		t.Fatalf("SaveConfig calls = %d, want 1", called)
	}

	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "mouse") || !strings.Contains(out, "selection") || !strings.Contains(out, "terminal select") {
		t.Fatalf("settings output missing mouse controls row: %q", out)
	}
	if !strings.Contains(out, "App copy") || !strings.Contains(out, "drag-copy") || !strings.Contains(out, "Terminal select") || !strings.Contains(out, "normal drag") {
		t.Fatalf("settings output should explain CLIO copy versus terminal selection: %q", out)
	}
}

func TestSettings_TUIStepperMouseTargetsAdjustEveryEditableRow(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 50
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}
	a.Theme.CollapseThreshold = 10
	a.Theme.CostWarnTokens = 100_000
	a.Theme.CostDangerTokens = 150_000
	a.Theme.PasteCompressThreshold = 5
	a.IntroDisabled = false
	a.MouseEnabled = true
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}
	click := func(target uiHitTarget) {
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x + target.rect.w/2,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
	}

	type stepperCase struct {
		id      string
		row     int
		before  func() any
		wantInc any
		wantDec any
	}
	cases := []stepperCase{
		{id: "collapse-threshold", row: 0, before: func() any { return a.Theme.CollapseThreshold }, wantInc: 11, wantDec: 10},
		{id: "cost-warn", row: 1, before: func() any { return a.Theme.CostWarnTokens }, wantInc: 125_000, wantDec: 100_000},
		{id: "cost-danger", row: 2, before: func() any { return a.Theme.CostDangerTokens }, wantInc: 175_000, wantDec: 150_000},
		{id: "paste-compress", row: 3, before: func() any { return a.Theme.PasteCompressThreshold }, wantInc: 6, wantDec: 5},
		{id: "intro", row: 4, before: func() any { return a.IntroDisabled }, wantInc: true, wantDec: false},
	}

	for _, tc := range cases {
		_ = a.View()
		inc, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":inc")
		if !ok {
			t.Fatalf("missing increment hit for %s", tc.id)
		}
		dec, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":dec")
		if !ok {
			t.Fatalf("missing decrement hit for %s", tc.id)
		}
		line, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":line")
		if !ok {
			t.Fatalf("missing row hit for %s", tc.id)
		}
		if inc.rect.y != dec.rect.y || inc.rect.y != line.rect.y {
			t.Fatalf("%s stepper hits should share row, inc=%+v dec=%+v line=%+v", tc.id, inc.rect, dec.rect, line.rect)
		}
		if inc.rect.x <= dec.rect.x {
			t.Fatalf("%s increment hit should be to the right of decrement, inc=%+v dec=%+v", tc.id, inc.rect, dec.rect)
		}

		click(inc)
		if a.settings.tuiRow != tc.row {
			t.Fatalf("%s increment selected row %v, want %d", tc.id, a.settings, tc.row)
		}
		if got := tc.before(); got != tc.wantInc {
			t.Fatalf("%s increment value = %v, want %v", tc.id, got, tc.wantInc)
		}

		_ = a.View()
		dec, ok = findHitTargetForTest(a, "settings:tui:"+tc.id+":dec")
		if !ok {
			t.Fatalf("missing decrement hit for %s after increment", tc.id)
		}
		click(dec)
		if a.settings.tuiRow != tc.row {
			t.Fatalf("%s decrement selected row %v, want %d", tc.id, a.settings, tc.row)
		}
		if got := tc.before(); got != tc.wantDec {
			t.Fatalf("%s decrement value = %v, want %v", tc.id, got, tc.wantDec)
		}
	}
	_ = a.View()
	mouseDec, ok := findHitTargetForTest(a, "settings:tui:mouse:dec")
	if !ok {
		t.Fatal("missing decrement hit for mouse controls")
	}
	mouseInc, ok := findHitTargetForTest(a, "settings:tui:mouse:inc")
	if !ok {
		t.Fatal("missing increment hit for mouse controls")
	}
	if mouseInc.rect.x <= mouseDec.rect.x {
		t.Fatalf("mouse controls increment hit should be to the right of decrement, inc=%+v dec=%+v", mouseInc.rect, mouseDec.rect)
	}
	click(mouseDec)
	if a.MouseEnabled {
		t.Fatal("mouse controls decrement click should disable mouse capture")
	}
	if a.settings.tuiRow != 5 {
		t.Fatalf("mouse controls click selected row %v, want row 5", a.settings)
	}
	if called != len(cases)*2+1 {
		t.Fatalf("SaveConfig calls = %d, want %d", called, len(cases)*2+1)
	}
}

func TestSettings_TUILayoutUsesLayoutEditorForSidebarPlacement(t *testing.T) {
	a := New("http://unused")
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 6}

	out := ansi.Strip(a.settings.view())
	if strings.Contains(out, "context sidebar") {
		t.Fatalf("settings output should not expose legacy context placement row: %q", out)
	}
	if !strings.Contains(out, "sidebar layout") {
		t.Fatalf("settings output missing sidebar layout editor row: %q", out)
	}

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if !a.sidebarLayout.open {
		t.Fatal("enter on sidebar layout row should open layout editor")
	}
}

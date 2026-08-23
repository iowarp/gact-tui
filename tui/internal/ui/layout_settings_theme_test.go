package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// TestCollapseThreshold_CallsSaveConfig verifies N5 persistence: every
// stepper left/right flush fires SaveConfig so the on-disk file tracks the
// current value.
func TestCollapseThreshold_CallsSaveConfig(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 5
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	// Right nudges + persists.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if called != 1 {
		t.Fatalf("Right should call SaveConfig, got called=%d", called)
	}

	// Left nudges + persists.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if called != 2 {
		t.Fatalf("Left should call SaveConfig, got called=%d", called)
	}
}

// TestCostThresholds_DefaultAndOverride verifies P3: zero means defaults
// (100K / 150K); user override sticks through applyStyles.
func TestCostThresholds_DefaultAndOverride(t *testing.T) {
	dark := ThemeForMode(ModeDark)
	if dark.CostWarnTokens != 100_000 {
		t.Errorf("default warn = %d, want 100000", dark.CostWarnTokens)
	}
	if dark.CostDangerTokens != 150_000 {
		t.Errorf("default danger = %d, want 150000", dark.CostDangerTokens)
	}

	// User override via direct assignment survives applyStyles re-run
	// (mimics what the live-swap path does).
	custom := dark
	custom.CostWarnTokens = 20_000
	custom.CostDangerTokens = 30_000
	custom.applyStyles()
	if custom.CostWarnTokens != 20_000 {
		t.Errorf("override warn lost: %d", custom.CostWarnTokens)
	}
	if custom.CostDangerTokens != 30_000 {
		t.Errorf("override danger lost: %d", custom.CostDangerTokens)
	}
}

// TestCycleTheme_NextWrapsForward advances through AllThemeModes and
// wraps back to the first entry.
func TestCycleTheme_NextWrapsForward(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme = ThemeForMode(ModeDark)

	seen := []ThemeMode{}
	for i := 0; i <= len(AllThemeModes); i++ {
		seen = append(seen, ThemeModeFor(a.Theme))
		a.cmdPalette.cycleTheme(+1)
	}
	// After one full loop, we should be back where we started.
	if seen[0] != seen[len(seen)-1] {
		t.Errorf("wrap-around failed: start=%d, after full cycle=%d",
			seen[0], seen[len(seen)-1])
	}
	// Exactly one of each theme visited (+ the start repeated at end).
	counts := map[ThemeMode]int{}
	for _, m := range seen[:len(seen)-1] {
		counts[m]++
	}
	for _, m := range AllThemeModes {
		if counts[m] != 1 {
			t.Errorf("theme %s visited %d times, want 1", ThemeModeName(m), counts[m])
		}
	}
}

// TestCycleTheme_PreservesThresholds ensures the collapse + cost thresholds
// survive a cycle so users do not lose preferences when flipping palettes.
func TestCycleTheme_PreservesThresholds(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme.CollapseThreshold = 13
	a.Theme.CostWarnTokens = 42_000
	a.Theme.CostDangerTokens = 88_000

	a.cmdPalette.cycleTheme(+1)
	if a.Theme.CollapseThreshold != 13 {
		t.Errorf("CollapseThreshold lost: %d", a.Theme.CollapseThreshold)
	}
	if a.Theme.CostWarnTokens != 42_000 {
		t.Errorf("CostWarnTokens lost: %d", a.Theme.CostWarnTokens)
	}
	if a.Theme.CostDangerTokens != 88_000 {
		t.Errorf("CostDangerTokens lost: %d", a.Theme.CostDangerTokens)
	}
}

// TestPaletteCurrentValue_HintsForKnownCommands covers Q3 routing:
// well-known settings-style commands return a non-empty state hint;
// unknown commands return empty so the palette row stays clean.
func TestPaletteCurrentValue_HintsForKnownCommands(t *testing.T) {
	sessions := []gact.Session{{
		ID: "sess_1", Title: "refactor auth",
		Status: gact.StatusRunning,
		Agent:  gact.AgentRef{ID: "code_reviewer"},
	}}
	msgs := []gact.Message{{
		ID: "m1", SessionID: "sess_1", Role: gact.RoleUser,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hi"}},
	}}
	a := newReadyApp(sessions, msgs)
	a.Theme = ThemeForMode(ModeDracula)
	a.session.currentStatus = gact.StatusRunning

	cases := map[string]string{
		"/theme":                  "current: dracula",
		"/clear":                  "1 messages",
		"/cancel":                 "status: running",
		"/agent":                  "current: code_reviewer",
		"/rename":                 "current: refactor auth",
		"/completely_unknown_cmd": "",
	}
	for id, want := range cases {
		got := a.cmdPalette.currentValue(id)
		if got != want {
			t.Errorf("%s: got %q, want %q", id, got, want)
		}
	}
}

// TestThemeSlashCmd_OpensSettingsThemeTab verifies /theme lands the user on
// Settings > Theme with the current palette pre-selected so down/up immediately
// previews a neighbour.
func TestThemeSlashCmd_OpensSettingsThemeTab(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme = ThemeForMode(ModeDracula)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/theme", Title: "Pick a theme", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/theme")

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	if !a.settings.open {
		t.Fatalf("/theme should open settings")
	}
	if a.settings.tab != 2 {
		t.Fatalf("tab = %d, want 2 (Theme)", a.settings.tab)
	}
	// themeSel should pre-seed to Dracula's position in AllThemeModes.
	wantSel := 0
	for i, m := range AllThemeModes {
		if m == ModeDracula {
			wantSel = i
			break
		}
	}
	if a.settings.themeSel != wantSel {
		t.Fatalf("themeSel = %d, want %d (Dracula)", a.settings.themeSel, wantSel)
	}
}

// TestCollapseThreshold_ArrowKeysAdjust verifies the Settings > TUI tab
// keybindings for the collapse-threshold stepper: left/right nudge the value
// between 1 and 50 inclusive without blowing up.
func TestCollapseThreshold_ArrowKeysAdjust(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3, tuiRow: 0}
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

	// Lower bound is 1 - many lefts should not drop below it.
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

func TestSettings_CostThresholdArrows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	// Row 1 = cost warn. Start at default 100k.
	a.settings.tuiRow = 1
	a.Theme.CostWarnTokens = 100_000
	a.Theme.CostDangerTokens = 150_000

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.CostWarnTokens != 125_000 {
		t.Errorf("right warn: got %d, want 125000", a.Theme.CostWarnTokens)
	}
	if a.Theme.CostDangerTokens != 150_000 {
		t.Errorf("danger should NOT change when row=1: got %d", a.Theme.CostDangerTokens)
	}

	// Lower bound stops at costMin (1_000).
	for i := 0; i < 200; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
	}
	if a.Theme.CostWarnTokens != 1_000 {
		t.Errorf("clamp low warn: got %d, want 1000", a.Theme.CostWarnTokens)
	}

	// Row 2 = cost danger. Same shape.
	a.settings.tuiRow = 2
	a.Theme.CostDangerTokens = 200_000
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.CostDangerTokens != 225_000 {
		t.Errorf("right danger: got %d, want 225000", a.Theme.CostDangerTokens)
	}

	// Upper bound stops at costMax (1_000_000).
	for i := 0; i < 200; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
	}
	if a.Theme.CostDangerTokens != 1_000_000 {
		t.Errorf("clamp high danger: got %d, want 1000000", a.Theme.CostDangerTokens)
	}

	// Cross-talk check: row 0 still only affects CollapseThreshold.
	a.settings.tuiRow = 0
	a.Theme.CollapseThreshold = 5
	a.Theme.CostWarnTokens = 100_000
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.CollapseThreshold != 6 {
		t.Errorf("row=0 right should bump collapse: got %d", a.Theme.CollapseThreshold)
	}
	if a.Theme.CostWarnTokens != 100_000 {
		t.Errorf("row=0 right should NOT touch cost warn: got %d", a.Theme.CostWarnTokens)
	}
}

func TestSettings_PasteAndIntroToggle(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	// Row 3 = paste-compress.
	a.settings.tuiRow = 3
	a.Theme.PasteCompressThreshold = 5
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.PasteCompressThreshold != 6 {
		t.Errorf("right paste: got %d, want 6", a.Theme.PasteCompressThreshold)
	}
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.Theme.PasteCompressThreshold != 5 {
		t.Errorf("left paste: got %d, want 5", a.Theme.PasteCompressThreshold)
	}
	// Lower clamp at pasteThresholdMin (2).
	for i := 0; i < 30; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
	}
	if a.Theme.PasteCompressThreshold != 2 {
		t.Errorf("clamp low paste: got %d, want 2", a.Theme.PasteCompressThreshold)
	}
	// Upper clamp at pasteThresholdMax (20).
	for i := 0; i < 30; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
	}
	if a.Theme.PasteCompressThreshold != 20 {
		t.Errorf("clamp high paste: got %d, want 20", a.Theme.PasteCompressThreshold)
	}

	// Row 4 = intro toggle. Both left/right flip the bool.
	a.settings.tuiRow = 4
	a.IntroDisabled = false
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if !a.IntroDisabled {
		t.Errorf("right on intro row should flip false->true")
	}
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.IntroDisabled {
		t.Errorf("left on intro row should flip true->false")
	}

	// Cross-talk: right on row 3 must NOT touch IntroDisabled.
	a.settings.tuiRow = 3
	a.Theme.PasteCompressThreshold = 5
	a.IntroDisabled = false
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.IntroDisabled {
		t.Errorf("row=3 right should NOT flip intro: got %v", a.IntroDisabled)
	}
}

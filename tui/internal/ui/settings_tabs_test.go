package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestSettings_TabCycleWrapsAround(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40
	a.settingsOpen = true
	a.settings = &settingsState{}

	// Five tabs: Model, Agent, Theme, TUI, Language.
	for _, want := range []int{1, 2, 3, 4, 0} {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyTab})
		if a.settings.tab != want {
			t.Errorf("Tab cycle -> %d, want %d", a.settings.tab, want)
		}
	}
}

func TestSettings_ShiftTabCyclesBackwards(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 0}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift})
	if a.settings.tab != 4 {
		t.Errorf("Shift+Tab wrap-around = %d, want 4", a.settings.tab)
	}
}

func TestSettings_ThemeTabUpDownCycle(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 2, themeSel: 0}

	last := len(AllThemeModes) - 1

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.settings.themeSel != 1 {
		t.Errorf("themeSel after down = %d, want 1", a.settings.themeSel)
	}
	for i := 0; i < last*2; i++ {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}
	if a.settings.themeSel != last {
		t.Errorf("themeSel clamp at end = %d, want %d", a.settings.themeSel, last)
	}
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

func TestSessionUpdatedAgentPatchShowsConfirmation(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
		Agent:  gact.AgentRef{ID: "main"},
	}}, nil)
	a.settingsOpen = false

	model, cmd := a.Update(sessionUpdatedMsg{
		session: gact.Session{
			ID:     "sess_1",
			Title:  "demo",
			Status: gact.StatusIdle,
			Agent:  gact.AgentRef{ID: "tui-test"},
		},
		agentID: "tui-test",
	})
	a = model.(*App)

	if got := a.sessions[0].Agent.ID; got != "tui-test" {
		t.Fatalf("session agent = %q, want tui-test", got)
	}
	if !strings.Contains(a.transientHint, "agent: tui-test") {
		t.Fatalf("transientHint = %q, want agent confirmation", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("expected hint-expiration command")
	}
}

func TestSelectableSessionAgentsExcludesSkillsAndNanoagents(t *testing.T) {
	agents := []gact.AgentDef{
		{ID: "main", Source: "builtin", Tier: 1},
		{ID: "analysis", Source: "builtin", Tier: 2},
		{ID: "tui-test", Source: "skill", Tier: 2},
		{ID: "worker-1", Source: "builtin", Tier: 3},
		{ID: "custom", Source: "user", Tier: 2},
	}

	got := selectableSessionAgents(agents)
	ids := make([]string, 0, len(got))
	for _, ag := range got {
		ids = append(ids, ag.ID)
	}
	want := []string{"main", "analysis", "custom"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Fatalf("selectable ids = %v, want %v", ids, want)
	}
}

func TestSettingsAgentTabShowsSelectedAgentDetails(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
		Agent:  gact.AgentRef{ID: "analysis"},
	}}, nil)
	a.width = 140
	a.height = 42
	a.settingsOpen = true
	a.settings = &settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:             "analysis",
			Source:         "builtin",
			Title:          "Analysis Expert",
			Description:    "Scientific reasoning and quantitative analysis",
			SystemPrompt:   "You are the CLIO Analysis Expert.",
			Tier:           2,
			Specialization: "data_analysis",
			Keywords:       []string{"statistics", "parquet"},
			Tools:          []string{"parquet_analyze_schema", "csv_read_table"},
		}},
	}

	out := ansi.Strip(a.viewSettings())

	for _, want := range []string{
		"Details",
		"ID: analysis",
		"Source: builtin",
		"Tier: 2",
		"Specialization: data_analysis",
		"Tools: parquet_analyze_schema, csv_read_table",
		"Keywords: statistics, parquet",
		"Prompt: You are the CLIO Analysis Expert.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("settings agent details missing %q:\n%s", want, out)
		}
	}
}

func TestSettingsAgentTabLoadErrorDoesNotRenderLoadingPlaceholder(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
	}}, nil)
	a.width = 120
	a.height = 32
	a.settingsOpen = true
	a.settings = &settingsState{
		tab:     1,
		loadErr: "agents: backend unavailable",
	}

	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, "agents: backend unavailable") {
		t.Fatalf("settings agent tab should surface backend error:\n%s", out)
	}
	if strings.Contains(out, "loading") || strings.Contains(out, "Loading") {
		t.Fatalf("agent tab load error should not be paired with loading placeholder:\n%s", out)
	}
}

func TestSettingsAgentListDescriptionOmitsGeneratedCommonToolsTail(t *testing.T) {
	a := New("http://unused")
	ag := gact.AgentDef{
		ID:          "extracted",
		Title:       "Extracted from 2 session(s)",
		Description: "Auto-extracted agent from 2 session log(s). Common tools: analysis, data, shell",
		Tools:       []string{"analysis", "data", "shell"},
		CapabilityRefs: []gact.AgentCapabilityRef{
			{Kind: "tool", ID: "hdf5_analyze_dataset", Status: "available", Source: "builtin"},
			{Kind: "command", ID: "/optimize", Status: "unavailable", Metadata: map[string]any{"error": "not_implemented"}},
		},
	}

	got := a.settingsAgentListDescription(ag)
	want := "Auto-extracted agent from 2 session log(s)."
	if got != want {
		t.Fatalf("list description = %q, want %q", got, want)
	}
	if detail := a.agentDetailText(ag); !strings.Contains(detail, "analysis") {
		t.Fatalf("detail text should retain tool evidence:\n%s", detail)
	} else if !strings.Contains(detail, "hdf5_analyze_dataset") ||
		!strings.Contains(detail, "/optimize") ||
		!strings.Contains(detail, "not_implemented") {
		t.Fatalf("detail text should surface capability refs:\n%s", detail)
	}
}

func TestSettingsAgentTabScrollsSelectionIntoView(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 30
	a.settingsOpen = true
	agents := make([]gact.AgentDef, 0, 18)
	for i := 0; i < 18; i++ {
		agents = append(agents, gact.AgentDef{
			ID:          "agent-" + itoa2(i),
			Source:      "builtin",
			Title:       "Agent " + itoa2(i),
			Description: "desc",
			Tier:        2,
		})
	}
	a.settings = &settingsState{tab: 1, agentList: agents}

	for i := 0; i < 14; i++ {
		a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}

	if a.settings.agentSel != 14 {
		t.Fatalf("agentSel = %d, want 14", a.settings.agentSel)
	}
	if a.settings.agentScroll == 0 {
		t.Fatalf("agentScroll was not advanced for long list")
	}
	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, "Agent 14") || strings.Contains(out, "Agent 0  desc") {
		t.Fatalf("agent tab did not render a scrolled viewport:\n%s", out)
	}
}

func TestSettingsAgentTabEnterOpensDetailView(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40
	a.settingsOpen = true
	a.settings = &settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:           "main",
			Source:       "builtin",
			Title:        "Main Agent",
			Description:  "orchestrator",
			SystemPrompt: "Route to the right expert.",
			Tier:         1,
			Metadata: map[string]any{
				"routes_to": []any{"data", "analysis", "visualization", "utility"},
			},
		}},
	}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("Enter on Agent tab should open detail view")
	}
	if !strings.Contains(a.detailView.fullText, "Routes to:") ||
		!strings.Contains(a.detailView.fullText, "- analysis") ||
		!strings.Contains(a.detailView.fullText, "Prompt:") {
		t.Fatalf("agent detail missing routing/prompt data:\n%s", a.detailView.fullText)
	}
}

func TestSettings_ThemeAndLanguageSelectionsPreSeed(t *testing.T) {
	a := New("http://unused")
	a.Theme = ThemeForMode(ModeLight)
	a.SetLocale("ja")

	_, _ = a.handleKey(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	if a.settings == nil {
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
	a.settingsOpen = true
	a.settings = &settingsState{tab: 4, languageSel: 0}
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "el" {
		t.Fatalf("preview locale = %q, want el", got)
	}
	if got := ansi.Strip(a.viewSettings()); !strings.Contains(got, "Ελληνικά") ||
		!strings.Contains(got, "μηχανική") {
		t.Fatalf("Greek settings view did not show language options/status: %q", got)
	}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "es" {
		t.Fatalf("preview locale = %q, want es", got)
	}
	if got := ansi.Strip(a.viewSettings()); !strings.Contains(got, "Español") ||
		!strings.Contains(got, "traducción automática") {
		t.Fatalf("Spanish settings view did not show language options/status: %q", got)
	}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if got := a.Locale(); got != "ja" {
		t.Fatalf("preview locale = %q, want ja", got)
	}
	if got := ansi.Strip(a.viewSettings()); !strings.Contains(got, "日本語") ||
		!strings.Contains(got, "機械翻訳") {
		t.Fatalf("Japanese settings view did not show language options/status: %q", got)
	}

	a.handleSettingsKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.settingsOpen {
		t.Fatal("Enter on Language tab should close the modal")
	}
	if called != 1 {
		t.Fatalf("SaveConfig calls = %d, want 1", called)
	}
	if !strings.Contains(a.transientHint, "言語") {
		t.Fatalf("transientHint = %q, want localized language confirmation", a.transientHint)
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
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 5}
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

	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, "mouse") || !strings.Contains(out, "controls") || !strings.Contains(out, "off") {
		t.Fatalf("settings output missing mouse controls row: %q", out)
	}
}

func TestSettings_TUIStepperMouseTargetsAdjustEveryEditableRow(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 50
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3}
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
		if a.settings == nil || a.settings.tuiRow != tc.row {
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
		if a.settings == nil || a.settings.tuiRow != tc.row {
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
	if a.settings == nil || a.settings.tuiRow != 5 {
		t.Fatalf("mouse controls click selected row %v, want row 5", a.settings)
	}
	if called != len(cases)*2+1 {
		t.Fatalf("SaveConfig calls = %d, want %d", called, len(cases)*2+1)
	}
}

func TestSettings_TUILayoutUsesLayoutEditorForSidebarPlacement(t *testing.T) {
	a := New("http://unused")
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 6}

	out := ansi.Strip(a.viewSettings())
	if strings.Contains(out, "context sidebar") {
		t.Fatalf("settings output should not expose legacy context placement row: %q", out)
	}
	if !strings.Contains(out, "sidebar layout") {
		t.Fatalf("settings output missing sidebar layout editor row: %q", out)
	}

	model, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if !a.sidebarLayoutOpen {
		t.Fatal("enter on sidebar layout row should open layout editor")
	}
}

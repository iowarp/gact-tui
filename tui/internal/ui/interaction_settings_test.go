package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSettingsTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "tab:settings-tui")
	if !ok {
		t.Fatal("missing semantic settings TUI tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings.tab != 3 {
		t.Fatalf("settings tab = %v, want TUI tab", a.settings)
	}
	if !a.settings.open {
		t.Fatal("clicking a settings tab should not close settings")
	}
}

func TestSettingsCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:settings:close")
	if !ok {
		t.Fatal("missing semantic settings close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("settings close should not dispatch a command")
	}
	if a.settings.open {
		t.Fatal("settings close should close the modal")
	}
}

func TestSettingsOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 3}

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside settings click should not dispatch a command")
	}
	if a.settings.open {
		t.Fatal("outside settings click should close the modal")
	}
}

func TestSettingsModelRowUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:model:change-provider")
	if !ok {
		t.Fatal("missing semantic settings model target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("model row click should dispatch provider fetch command")
	}
	if a.settings.open || !a.lmConfig.open {
		t.Fatalf("model row click should switch to provider modal, settingsOpen=%v lmConfigOpen=%v lmConfig=%+v", a.settings.open, a.lmConfig.open, a.lmConfig)
	}
}

func TestSettingsAgentRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 40
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:           "main",
			Source:       "builtin",
			Title:        "Main Agent",
			Description:  "orchestrator",
			SystemPrompt: "Route to the right expert.",
			Tier:         1,
		}, {
			ID:           "analysis",
			Source:       "builtin",
			Title:        "Analysis Expert",
			Description:  "scientific reasoning",
			SystemPrompt: "Analyze the data.",
			Tier:         2,
		}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:agent:analysis")
	if !ok {
		t.Fatal("missing semantic settings agent target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("agent row click should not dispatch command")
	}
	if a.settings.agentSel != 1 {
		t.Fatalf("agent row click should select analysis, settings=%+v", a.settings)
	}
	if !a.detail.visible || a.detail.ref == nil || !strings.Contains(a.detail.ref.title, "Analysis") {
		t.Fatalf("agent row click should open clicked detail, detail=%+v", a.detail.ref)
	}
}

func TestSettingsAgentRailUsesSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
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
	a.settings.settingsState = settingsState{tab: 1, agentSel: 0, agentList: agents}

	_ = a.View()
	target, ok := findLastHitTargetWithPrefixForTest(a, "settings:agent:list:rail:")
	if !ok {
		t.Fatal("missing semantic settings agent rail target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("agent rail click should not dispatch command")
	}
	if a.settings.agentSel != len(agents)-1 {
		t.Fatalf("agent rail click should jump selection near list end, settings=%+v", a.settings)
	}
	if !a.settings.open || a.detail.visible {
		t.Fatalf("agent rail click should keep settings open without opening detail, settingsOpen=%v detail=%v", a.settings.open, a.detail.visible)
	}
}

func TestSettingsLanguageRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 4, languageSel: 0}

	_ = a.View()
	options := availableLanguageOptions()
	if len(options) < 3 {
		t.Fatalf("need at least three language options, got %d", len(options))
	}
	target, ok := findHitTargetForTest(a, "settings:language:"+options[2].Locale)
	if !ok {
		t.Fatal("missing semantic settings language target")
	}
	if target.rect.h != 1 {
		t.Fatalf("language target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, options[2].Locale) {
		t.Fatalf("language row should render locale inline:\n%s", out)
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings.languageSel != 2 {
		t.Fatalf("settings language row = %v, want row 2", a.settings)
	}
	if !a.settings.open {
		t.Fatal("clicking a language row should select without closing settings")
	}
}

func TestSettingsMouseWheelMovesSelectionOnlyOverBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settings.open = true
	a.settings.settingsState = settingsState{tab: 4, languageSel: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:body:wheel")
	if !ok {
		t.Fatal("missing semantic settings body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.settings.languageSel != 1 {
		t.Fatalf("wheel over settings body should move language selection, settings=%+v", a.settings)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "settings:surface:wheel")
	if !ok {
		t.Fatal("missing settings surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.settings.languageSel != 1 {
		t.Fatalf("wheel on settings chrome should not move language selection, settings=%+v", a.settings)
	}
}

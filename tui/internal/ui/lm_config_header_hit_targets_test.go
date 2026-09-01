package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestLMConfigSaveButtonUsesSemanticHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "alpha-model"}}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:lm-config:save")
	if !ok {
		t.Fatal("missing semantic LM save target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("save click should dispatch save command")
	}
	if a.lmConfig.field != lmFieldSave {
		t.Fatalf("field = %v, want save", a.lmConfig.field)
	}
	if !a.lmConfig.saving {
		t.Fatal("save click should put provider modal into saving state")
	}
}

func TestLMConfigCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:lm-config:close")
	if !ok {
		t.Fatal("missing semantic LM close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("close click should not dispatch a command")
	}
	if a.lmConfig.open {
		t.Fatal("close click should close LM config modal")
	}
}

func TestLMConfigCloseGlyphIsCenteredInHeaderButton(t *testing.T) {
	a := newLMConfigTestApp()

	plain := ansi.Strip(a.lmConfig.view())
	closeLine := ""
	for _, line := range strings.Split(plain, "\n") {
		if strings.Contains(line, "Choose Model Provider") && strings.Contains(line, "refresh") && strings.Contains(line, "x") {
			closeLine = line
			break
		}
	}
	if closeLine == "" {
		t.Fatalf("provider header with close button not found:\n%s", plain)
	}
	xCol := strings.LastIndex(closeLine, "x")
	if xCol < 2 || xCol+2 >= len(closeLine) {
		t.Fatalf("provider close x has no visible box padding in line: %q", closeLine)
	}
	if closeLine[xCol-2:xCol] != "  " || closeLine[xCol+1:xCol+3] != "  " {
		t.Fatalf("provider close x should be centered with two cells on each side: %q", closeLine)
	}
}

func TestLMConfigHeaderGapsOwnModalBackground(t *testing.T) {
	a := newLMConfigTestApp()

	styledLine := ""
	for _, line := range strings.Split(a.lmConfig.view(), "\n") {
		if strings.Contains(line, "Choose Model Provider") && strings.Contains(line, "refresh") && strings.Contains(line, "x") {
			styledLine = line
			break
		}
	}
	if styledLine == "" {
		t.Fatalf("provider header with close button not found")
	}
	bg := "48;2;25;25;35"
	if strings.Count(styledLine, bg) < 3 {
		t.Fatalf("provider header gaps should carry modal background escapes, got %d in %q", strings.Count(styledLine, bg), styledLine)
	}
}

func TestLMConfigRefreshButtonUsesCtrlRRefreshSemantics(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:lm-config:refresh")
	if !ok {
		t.Fatal("missing semantic LM refresh target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("refresh click should dispatch the same reload command as Ctrl+R")
	}
	if !a.lmConfig.open || a.lmConfig.err != nil {
		t.Fatalf("refresh should keep config open and clear errors, config=%+v", a.lmConfig)
	}
}

func TestLMConfigSurfaceWheelBlocksBackgroundScrolling(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldPreset

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "lm-config:surface:wheel")
	if !ok {
		t.Fatal("missing provider modal surface wheel blocker")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + surface.rect.w - 2,
		Y:      surface.rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("provider modal blank-surface wheel should not dispatch a command")
	}
	if !a.lmConfig.open {
		t.Fatal("provider modal should remain open after blank-surface wheel")
	}
	if a.lmConfig.selected != 0 {
		t.Fatalf("blank-surface wheel changed provider selection to %d", a.lmConfig.selected)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("blank-surface wheel changed field to %v", a.lmConfig.field)
	}
}

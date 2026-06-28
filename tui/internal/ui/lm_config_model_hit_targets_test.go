package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestLMConfigModelRowsUseSemanticHitTargets(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{
		{ID: "alpha-model"},
		{ID: "zeta-model"},
	}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:model:1")
	if !ok {
		t.Fatal("missing semantic LM model target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("field = %v, want model", a.lmConfig.field)
	}
	if a.lmConfig.model != "zeta-model" {
		t.Fatalf("model = %q, want zeta-model", a.lmConfig.model)
	}
	if a.lmConfig.modelIndex != 1 {
		t.Fatalf("modelIndex = %d, want 1", a.lmConfig.modelIndex)
	}
}

func TestLMConfigModelWheelUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{
		{ID: "alpha-model"},
		{ID: "zeta-model"},
	}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:model:wheel")
	if !ok {
		t.Fatal("missing semantic LM model wheel target")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("model wheel should not dispatch a command")
	}
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("field = %v, want model", a.lmConfig.field)
	}
	if a.lmConfig.model != "zeta-model" || a.lmConfig.modelIndex != 1 {
		t.Fatalf("model selection = %q/%d, want zeta-model/1", a.lmConfig.model, a.lmConfig.modelIndex)
	}
}

func TestLMConfigModelRailUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.height = 40
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldModel
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	var models []gact.Model
	for i := 0; i < 12; i++ {
		models = append(models, gact.Model{ID: "model-" + itoa2(i)})
	}
	a.lmConfig.modelCatalogs["lm_studio"] = models
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = models[0].ID

	_ = a.View()
	target, ok := findLastHitTargetWithPrefixForTest(a, "lm-config:model:rail:")
	if !ok {
		t.Fatal("missing semantic LM model rail target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("model rail should not dispatch a command")
	}
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("field = %v, want model", a.lmConfig.field)
	}
	if a.lmConfig.model != "model-11" || a.lmConfig.modelIndex != 11 {
		t.Fatalf("model selection = %q/%d, want model-11/11", a.lmConfig.model, a.lmConfig.modelIndex)
	}
}

func TestLMConfigModelListRowsAndHitsShareWindow(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldModel
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	var models []gact.Model
	for i := 0; i < 12; i++ {
		models = append(models, gact.Model{ID: "model-" + itoa2(i)})
	}
	a.lmConfig.modelCatalogs["lm_studio"] = models
	a.lmConfig.modelIndex = len(models) - 1
	a.lmConfig.model = models[len(models)-1].ID

	list, win := a.lmConfig.modelModalList(60, 5)
	if win.start != len(models)-5 || win.end != len(models) {
		t.Fatalf("model window = [%d,%d), want final 5 of %d", win.start, win.end, len(models))
	}
	if len(list.rows) != 5 || len(list.hits) != 5 {
		t.Fatalf("model list rows/hits = %d/%d, want 5/5", len(list.rows), len(list.hits))
	}
	for i, hit := range list.hits {
		if hit.row != i {
			t.Fatalf("model hit %d row = %d, want %d", i, hit.row, i)
		}
	}
	if list.hits[len(list.hits)-1].id != "lm-config:model:11" {
		t.Fatalf("last model hit id = %q, want final model", list.hits[len(list.hits)-1].id)
	}
}

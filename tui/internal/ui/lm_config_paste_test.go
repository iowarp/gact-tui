package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestLMConfigPasteRoutesToAPIKeyField(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 2 // OpenAI / ChatGPT
	a.lmConfig.field = lmFieldAPIKey

	_, _ = a.Update(tea.PasteMsg{Content: "sk-test\r\n"})

	if a.lmConfig.apiKey != "sk-test" {
		t.Fatalf("pasted API key = %q, want sk-test", a.lmConfig.apiKey)
	}
}

func TestLMConfigPasteProviderFilterSyncsSelectedPreset(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldPreset

	model, cmd := a.Update(tea.PasteMsg{Content: "openai\r\n"})
	a = model.(*App)

	if cmd == nil {
		t.Fatal("pasted provider filter should queue selected-provider model fetch")
	}
	if got := a.lmConfig.info.Presets[a.lmConfig.selected].ID; got != "openai" {
		t.Fatalf("selected provider = %q, want openai", got)
	}
	if a.lmConfig.apiBase != "https://api.openai.com/v1" {
		t.Fatalf("API base was not synced from pasted provider: %q", a.lmConfig.apiBase)
	}
	if a.lmConfig.model != "gpt-4o-mini" {
		t.Fatalf("model was not synced from pasted provider: %q", a.lmConfig.model)
	}
}

func TestLMConfigPasteRoutesToModelFilter(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldModel
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{
		{ID: "alpha-model"},
		{ID: "zeta-model"},
	}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	model, cmd := a.Update(tea.PasteMsg{Content: "zeta\r\n"})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("pasted model filter should not dispatch a command")
	}
	if a.lmConfig.modelFilter != "zeta" {
		t.Fatalf("model filter = %q, want zeta", a.lmConfig.modelFilter)
	}
	if a.lmConfig.model != "zeta-model" || a.lmConfig.modelIndex != 1 {
		t.Fatalf("selected model = %q/%d, want zeta-model/1", a.lmConfig.model, a.lmConfig.modelIndex)
	}
}

func TestLMConfigPasteAPIBaseInvalidatesCatalog(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldAPIBase
	a.lmConfig.apiBase = ""
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogPending = map[string]bool{"lm_studio": true}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "alpha-model"}}

	model, cmd := a.Update(tea.PasteMsg{Content: "http://127.0.0.1:8000/v1\r\n"})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("pasted API base should not dispatch a command")
	}
	if a.lmConfig.apiBase != "http://127.0.0.1:8000/v1" {
		t.Fatalf("API base = %q, want pasted endpoint", a.lmConfig.apiBase)
	}
	if _, ok := a.lmConfig.modelCatalogs["lm_studio"]; ok {
		t.Fatal("pasted API base should clear cached model catalog")
	}
	if _, ok := a.lmConfig.modelCatalogSources["lm_studio"]; ok {
		t.Fatal("pasted API base should clear cached catalog source")
	}
	if _, ok := a.lmConfig.modelCatalogPending["lm_studio"]; ok {
		t.Fatal("pasted API base should clear pending catalog flag")
	}
}

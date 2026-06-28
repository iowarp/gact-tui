package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigFallbackCatalogDoesNotOverwriteModel(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio
	a.lmConfig.model = "qwopus3.5-9b-v3"

	_, _ = a.Update(lmConfigModelsLoadedMsg{
		presetID: "lm_studio",
		models:   []gact.Model{{ID: "", Name: "(auto-discovered)"}},
		source:   "unavailable",
		warning:  "LM Studio unreachable",
	})

	if a.lmConfig.model != "qwopus3.5-9b-v3" {
		t.Fatalf("fallback catalog overwrote model: %q", a.lmConfig.model)
	}
	if got := len(a.lmConfig.modelCatalogs["lm_studio"]); got != 0 {
		t.Fatalf("fallback catalog should not be selectable, got %d rows", got)
	}
}

func TestLMConfigLiveCatalogPreservesProviderDefaultBeforeSorting(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio has no suggested model in CLIO's live response.
	a.lmConfig.info.Presets[0].SuggestedModel = ""
	a.lmConfig.model = ""
	a.lmConfig.modelIndex = -1

	_, _ = a.Update(lmConfigModelsLoadedMsg{
		presetID: "lm_studio",
		models: []gact.Model{
			{ID: "qwopus3.5-9b-v3"},
			{ID: "ibm/granite-4-h-tiny"},
		},
		source: "live",
	})

	if a.lmConfig.model != "qwopus3.5-9b-v3" {
		t.Fatalf("live provider default was not preserved; selected %q", a.lmConfig.model)
	}
	if got := a.lmConfig.modelCatalogs["lm_studio"][0].ID; got != "ibm/granite-4-h-tiny" {
		t.Fatalf("catalog should still render sorted alphabetically, first=%q", got)
	}
	out := ansi.Strip(a.lmConfig.view())
	if !strings.Contains(out, "✓ qwopus3.5-9b-v3") {
		t.Fatalf("render did not mark provider default selected after sorting\n%s", out)
	}
}

func TestLMConfigStaticCatalogShowsForUnavailableCLIProvider(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:                  "claude_code",
		Label:               "Claude Code (subscription)",
		Provider:            "claude_code",
		APIBase:             "claude-code://exec",
		SuggestedModel:      "sonnet",
		RequiresAPIKey:      false,
		Description:         "Routes through the local claude CLI.",
		Status:              "unavailable",
		StatusMessage:       "claude CLI not found on PATH",
		SupportsLiveCatalog: false,
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.modelCatalogSources["claude_code"] = "static_catalog"
	a.lmConfig.modelCatalogs["claude_code"] = []gact.Model{
		{ID: "sonnet"},
		{ID: "opus"},
		{ID: "haiku"},
	}

	if !a.lmConfig.lmConfigSelectedModelSelectable() {
		t.Fatal("static CLI catalog should remain selectable for model browsing")
	}
	out := ansi.Strip(a.lmConfig.view())
	if !strings.Contains(out, "Model candidates") || !strings.Contains(out, "opus") {
		t.Fatalf("static CLI catalog was not rendered\n%s", out)
	}
}

func TestLMConfigSyncUsesCachedStaticCatalogSelection(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:                  "claude_code",
		Label:               "Claude Code (subscription)",
		Provider:            "claude_code",
		APIBase:             "claude-code://exec",
		SuggestedModel:      "sonnet",
		RequiresAPIKey:      false,
		SupportsLiveCatalog: false,
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.modelCatalogSources["claude_code"] = "static_catalog"
	a.lmConfig.modelCatalogWarnings["claude_code"] = ""
	a.lmConfig.modelCatalogs["claude_code"] = []gact.Model{
		{ID: "sonnet"},
		{ID: "opus"},
	}

	cmd := a.lmConfig.syncFromPreset()

	if cmd != nil {
		t.Fatal("cached static catalog should not queue another fetch")
	}
	if a.lmConfig.modelIndex != 0 || a.lmConfig.model != "sonnet" {
		t.Fatalf("cached catalog selection = index %d model %q", a.lmConfig.modelIndex, a.lmConfig.model)
	}
}

func TestLMConfigFetchedQueuesBackgroundProviderChecks(t *testing.T) {
	fixture := newLMConfigTestApp()
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady

	_, cmd := a.Update(lmConfigFetchedMsg{info: fixture.lmConfig.info})

	if cmd == nil {
		t.Fatal("expected background provider check command")
	}
	for _, id := range []string{"ollama", "openai"} {
		if !a.lmConfig.modelCatalogPending[id] {
			t.Fatalf("%s was not marked pending", id)
		}
	}
	for _, id := range []string{"codex"} {
		if a.lmConfig.modelCatalogPending[id] {
			t.Fatalf("%s should not be background-probed", id)
		}
	}
	if status := a.lmConfig.presetStatusText(fixture.lmConfig.info.Presets[0]); status != "checking..." {
		t.Fatalf("pending status = %q, want checking...", status)
	}
}

func TestLMConfigProviderFilterUsesTypedText(t *testing.T) {
	a := newLMConfigTestApp()

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: 'l', Text: "l"})
	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: 'm', Text: "m"})

	if a.lmConfig.providerFilter != "lm" {
		t.Fatalf("provider filter = %q, want lm", a.lmConfig.providerFilter)
	}
	if got := a.lmConfig.info.Presets[a.lmConfig.selected].ID; got != "lm_studio" {
		t.Fatalf("filtered selection = %q, want lm_studio", got)
	}
}

func TestLMConfigModelFilterUsesTypedTextAndCatalogIsSorted(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio
	a.lmConfig.field = lmFieldModel
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = lmConfigSortModels([]gact.Model{
		{ID: "zeta-model"},
		{ID: "alpha-model"},
	})
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	if got := a.lmConfig.modelCatalogs["lm_studio"][0].ID; got != "alpha-model" {
		t.Fatalf("catalog was not sorted alphabetically: first=%q", got)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: 'z', Text: "z"})

	if a.lmConfig.modelFilter != "z" {
		t.Fatalf("model filter = %q, want z", a.lmConfig.modelFilter)
	}
	if a.lmConfig.model != "zeta-model" {
		t.Fatalf("filtered model = %q, want zeta-model", a.lmConfig.model)
	}
	out := ansi.Strip(a.lmConfig.view())
	if !strings.Contains(out, "filter: z_") {
		t.Fatalf("model filter was not rendered\n%s", out)
	}
}

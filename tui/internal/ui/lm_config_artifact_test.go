package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func newLMConfigTestApp() *App {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.lmConfig.open = true
	a.lmConfig.lmConfigState = lmConfigState{
		info: &client.LMProviderInfo{
			Configured: false,
			Presets: []client.LMProviderPreset{
				{
					ID:             "lm_studio",
					Label:          "LM Studio (localhost)",
					Provider:       "lm_studio",
					APIBase:        "http://127.0.0.1:1234/v1",
					SuggestedModel: "qwopus3.5-9b-v3",
					RequiresAPIKey: false,
					Description:    "Locally-hosted models via LM Studio.",
				},
				{
					ID:             "ollama",
					Label:          "Ollama (localhost)",
					Provider:       "ollama",
					APIBase:        "http://127.0.0.1:11434/v1",
					SuggestedModel: "granite3.1-dense:8b",
					RequiresAPIKey: false,
					Description:    "Locally-hosted models via Ollama.",
				},
				{
					ID:             "openai",
					Label:          "OpenAI / ChatGPT",
					Provider:       "openai",
					APIBase:        "https://api.openai.com/v1",
					SuggestedModel: "gpt-4o-mini",
					RequiresAPIKey: true,
					Description:    "Direct OpenAI API.",
				},
				{
					ID:             "codex",
					Label:          "OpenAI Codex (subscription)",
					Provider:       "codex",
					APIBase:        "codex://exec",
					SuggestedModel: "gpt-5.5",
					RequiresAPIKey: false,
					Description:    "Routes through the local codex CLI.",
				},
			},
		},
		selected:             1,
		model:                "granite3.1-dense:8b",
		apiBase:              "http://127.0.0.1:11434/v1",
		field:                lmFieldPreset,
		modelCatalogs:        map[string][]gact.Model{},
		modelCatalogWarnings: map[string]string{"ollama": "Ollama (localhost) unreachable"},
		modelCatalogSources:  map[string]string{"ollama": "unavailable"},
		modelCatalogPending:  map[string]bool{},
	}
	return a
}

func TestLMConfigNavigationUsesVerticalKeysInsideFocusedList(t *testing.T) {
	a := newLMConfigTestApp()

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.lmConfig.selected != 1 {
		t.Fatalf("right arrow changed provider selection: got %d", a.lmConfig.selected)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.selected != 2 {
		t.Fatalf("down arrow did not move provider selection: got %d", a.lmConfig.selected)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("tab should move to API key field for key-backed provider, got %v", a.lmConfig.field)
	}
}

func TestLMConfigPlaceholderAPIKeyIsOnlyForLocalNoAuthProviders(t *testing.T) {
	cases := []struct {
		name    string
		preset  client.LMProviderPreset
		apiBase string
		want    bool
	}{
		{
			name:    "lm studio",
			preset:  client.LMProviderPreset{Provider: "lm_studio", AuthMethod: "none"},
			apiBase: "http://127.0.0.1:1234/v1",
			want:    true,
		},
		{
			name:    "local vllm",
			preset:  client.LMProviderPreset{Provider: "openai", AuthMethod: "none"},
			apiBase: "http://127.0.0.1:8000/v1",
			want:    true,
		},
		{
			name:    "argonne oauth",
			preset:  client.LMProviderPreset{Provider: "argonne", AuthMethod: "oauth"},
			apiBase: "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			want:    false,
		},
		{
			name:    "codex cli",
			preset:  client.LMProviderPreset{Provider: "codex", AuthMethod: "none"},
			apiBase: "codex://exec",
			want:    false,
		},
		{
			name:    "cloud openai key required",
			preset:  client.LMProviderPreset{Provider: "openai", AuthMethod: "api_key", RequiresAPIKey: true},
			apiBase: "https://api.openai.com/v1",
			want:    false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := lmConfigNeedsPlaceholderAPIKey(tc.preset, tc.apiBase)
			if got != tc.want {
				t.Fatalf("placeholder decision = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestLMConfigTabMovesBetweenSectionsNotAdvancedRows(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio exposes model + model configuration sections.
	a.lmConfig.modelCatalogWarnings = map[string]string{}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "qwopus3.5-9b-v3"}}
	a.lmConfig.model = "qwopus3.5-9b-v3"
	a.lmConfig.modelIndex = 0
	a.lmConfig.field = lmFieldTemperature

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.lmConfig.field != lmFieldSave {
		t.Fatalf("tab from model configuration should jump to save, got %v", a.lmConfig.field)
	}

	a.lmConfig.field = lmFieldContextLength
	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift})
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("shift+tab from model configuration should jump to model, got %v", a.lmConfig.field)
	}
}

func TestLMConfigAPIKeyOnlyShowsWhenProviderRequiresIt(t *testing.T) {
	a := newLMConfigTestApp()
	for _, field := range a.lmConfig.lmConfigVisibleFields() {
		if field == lmFieldAPIKey {
			t.Fatal("no-key local provider should not include API key field")
		}
	}

	a.lmConfig.selected = 2 // OpenAI / ChatGPT
	found := false
	for _, field := range a.lmConfig.lmConfigVisibleFields() {
		if field == lmFieldAPIKey {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("API-key provider should include API key field")
	}

	a.lmConfig.field = lmFieldPreset
	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("Enter on key-backed provider should focus API key first, got %v", a.lmConfig.field)
	}
	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: 's', Text: "s"})
	if a.lmConfig.apiKey != "s" {
		t.Fatalf("API key input did not accept text, got %q", a.lmConfig.apiKey)
	}
}

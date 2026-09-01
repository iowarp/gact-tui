package ui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRenderLMConfigPolishArtifact(t *testing.T) {
	if os.Getenv("GACT_RENDER_LM_CONFIG_ARTIFACT") == "" {
		t.Skip("set GACT_RENDER_LM_CONFIG_ARTIFACT=1 to write the visual artifact")
	}

	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets,
		client.LMProviderPreset{
			ID:             "anthropic",
			Label:          "Anthropic API",
			Provider:       "anthropic",
			APIBase:        "https://api.anthropic.com/v1",
			SuggestedModel: "claude-sonnet-4-6",
			RequiresAPIKey: true,
			Description:    "Direct Anthropic API. Requires ANTHROPIC_API_KEY where CLIO is running.",
			Status:         "missing_key",
			StatusMessage:  "missing ANTHROPIC_API_KEY",
		},
		client.LMProviderPreset{
			ID:                  "claude_code",
			Label:               "Claude Code (subscription)",
			Provider:            "claude_code",
			APIBase:             "claude-code://exec",
			SuggestedModel:      "sonnet",
			RequiresAPIKey:      false,
			Description:         "Routes through the local claude CLI subscription. Candidate aliases are shown locally.",
			Status:              "ready",
			StatusMessage:       "claude CLI available",
			SupportsLiveCatalog: false,
		},
		client.LMProviderPreset{
			ID:             "argonne_local_vllm",
			Label:          "vLLM (localhost)",
			Provider:       "openai",
			APIBase:        "http://127.0.0.1:8000/v1",
			SuggestedModel: "meta-llama/Llama-3.1-8B-Instruct",
			RequiresAPIKey: false,
			Description:    "Any local OpenAI-compatible vLLM server. Override the API base when it is bound to another port.",
			Status:         "unknown",
		},
	)
	a.lmConfig.selected = 0
	a.lmConfig.model = "qwopus3.5-9b-v3"
	a.lmConfig.modelIndex = 0
	a.lmConfig.apiBase = "http://127.0.0.1:1234/v1"
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{
		"lm_studio":   "live",
		"claude_code": "static_catalog",
	}
	a.lmConfig.modelCatalogs = map[string][]gact.Model{
		"lm_studio": {
			{ID: "qwopus3.5-9b-v3"},
			{ID: "ibm/granite-4-h-tiny"},
		},
		"claude_code": {
			{ID: "sonnet"},
			{ID: "opus"},
			{ID: "haiku"},
		},
	}
	a.lmConfig.modelCatalogPending = map[string]bool{
		"ollama":             true,
		"argonne_local_vllm": true,
	}

	ansiOut := a.View().Content
	plain := ansi.Strip(ansiOut)
	root := filepath.Join("..", "..", "..", "screenshots")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "clio_lm_config_polish.ansi"), []byte(ansiOut), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "clio_lm_config_polish.txt"), []byte(plain), 0o644); err != nil {
		t.Fatal(err)
	}
}

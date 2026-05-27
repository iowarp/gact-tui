package ui

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func newLMConfigTestApp() *App {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.lmConfigOpen = true
	a.lmConfig = &lmConfigState{
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

func TestLMConfigIntroUsesSharedModalInnerWidth(t *testing.T) {
	a := newLMConfigTestApp()

	out := ansi.Strip(a.viewLMConfig())
	if strings.Contains(out, "shown on the\nright") {
		t.Fatalf("intro wrapped before final word despite shared modal width:\n%s", out)
	}
	if !strings.Contains(out, "Status and editable model settings appear on the right.") {
		t.Fatalf("intro did not render on the expected line:\n%s", out)
	}
}

func TestLMConfigBoxWidthsUseSharedPolicy(t *testing.T) {
	if got := lmConfigBoxBodyWidth(60); got != 56 {
		t.Fatalf("box body width = %d, want 56", got)
	}
	if got := lmConfigBoxContentWidth(60); got != 54 {
		t.Fatalf("box content width = %d, want 54", got)
	}
	if got := lmConfigBoxBodyWidth(8); got != 10 {
		t.Fatalf("tiny box body width = %d, want minimum 10", got)
	}
	if got := lmConfigBoxContentWidth(8); got != 8 {
		t.Fatalf("tiny box content width = %d, want minimum content 8", got)
	}
}

func TestLMConfigNavigationUsesVerticalKeysInsideFocusedList(t *testing.T) {
	a := newLMConfigTestApp()

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.lmConfig.selected != 1 {
		t.Fatalf("right arrow changed provider selection: got %d", a.lmConfig.selected)
	}

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.selected != 2 {
		t.Fatalf("down arrow did not move provider selection: got %d", a.lmConfig.selected)
	}

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("tab should move to API key field for key-backed provider, got %v", a.lmConfig.field)
	}
}

func TestLMConfigAdvancedRowsUseVerticalNavigation(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio exposes temperature/max output/context length.
	a.lmConfig.field = lmFieldTemperature
	a.lmConfig.temperature = "1.0"
	a.lmConfig.maxTokens = "4096"
	a.lmConfig.contextLength = "32768"

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("down should move from temperature to max output, got %v", a.lmConfig.field)
	}
	if a.lmConfig.temperature != "1.0" {
		t.Fatalf("down should not adjust temperature, got %q", a.lmConfig.temperature)
	}

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.field != lmFieldContextLength {
		t.Fatalf("down should move from max output to context length, got %v", a.lmConfig.field)
	}

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("up should move from context length to max output, got %v", a.lmConfig.field)
	}

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("right should keep focus on max output, got %v", a.lmConfig.field)
	}
	if a.lmConfig.maxTokens != "4608" {
		t.Fatalf("right should adjust max output by one step, got %q", a.lmConfig.maxTokens)
	}
}

func TestLMConfigAdvancedArrowTargetsAdjustValues(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.lmConfig.selected = 0 // LM Studio exposes temperature/max output/context length.
	a.lmConfig.field = lmFieldTemperature
	a.lmConfig.temperature = "1.0"
	a.lmConfig.maxTokens = "4096"
	a.lmConfig.contextLength = "32768"

	_ = a.View()
	targetID := "lm-config:advanced:" + strconv.Itoa(int(lmFieldMaxTokens))
	target, ok := findHitTargetForTest(a, targetID+":inc")
	if !ok {
		t.Fatal("missing semantic LM max output increment target")
	}
	if target.rect.w <= 3 {
		t.Fatalf("advanced increment hit width = %d, want wider than glyph-only", target.rect.w)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w/2,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("advanced increment click should not dispatch a command")
	}
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("field = %v, want max output", a.lmConfig.field)
	}
	if a.lmConfig.maxTokens != "4608" {
		t.Fatalf("increment click max output = %q, want 4608", a.lmConfig.maxTokens)
	}

	_ = a.View()
	target, ok = findHitTargetForTest(a, targetID+":dec")
	if !ok {
		t.Fatal("missing semantic LM max output decrement target")
	}
	if target.rect.w <= 3 {
		t.Fatalf("advanced decrement hit width = %d, want wider than glyph-only", target.rect.w)
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w/2,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("advanced decrement click should not dispatch a command")
	}
	if a.lmConfig.maxTokens != "4096" {
		t.Fatalf("decrement click max output = %q, want 4096", a.lmConfig.maxTokens)
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

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.lmConfig.field != lmFieldSave {
		t.Fatalf("tab from model configuration should jump to save, got %v", a.lmConfig.field)
	}

	a.lmConfig.field = lmFieldContextLength
	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift})
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("shift+tab from model configuration should jump to model, got %v", a.lmConfig.field)
	}
}

func TestLMConfigContextLabelsDistinguishMaxFromRequestedLoad(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldContextLength
	a.lmConfig.contextLength = "8192"
	a.lmConfig.modelCatalogWarnings = map[string]string{}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{
		ID:            "qwopus3.5-9b-v3",
		Name:          "Qwopus3.5 9B v3",
		ContextWindow: 262144,
	}}
	a.lmConfig.model = "qwopus3.5-9b-v3"
	a.lmConfig.modelIndex = 0

	out := ansi.Strip(a.renderLMConfigAdvancedBox(60, 12))

	for _, want := range []string{
		"Load context",
		"8192",
		"Max context: 262144 tokens",
		"Requested load context: 8192 tokens",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("context render missing %q\n%s", want, out)
		}
	}
	if strings.Contains(out, "Context length") || strings.Contains(out, "Context: 262144") {
		t.Fatalf("context render still uses ambiguous wording\n%s", out)
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
	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("Enter on key-backed provider should focus API key first, got %v", a.lmConfig.field)
	}
	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: 's', Text: "s"})
	if a.lmConfig.apiKey != "s" {
		t.Fatalf("API key input did not accept text, got %q", a.lmConfig.apiKey)
	}
}

func TestLMConfigRenderHidesStaleCatalogAndUnsupportedKnobs(t *testing.T) {
	a := newLMConfigTestApp()
	out := ansi.Strip(a.viewLMConfig())

	if strings.Contains(out, "stale catalog") {
		t.Fatal("render should not show stale-catalog wording")
	}
	if strings.Contains(out, "API key") {
		t.Fatal("render should not show API key row for no-key local provider")
	}
	for _, want := range []string{
		"Ollama (localhost) unreachable",
		"Provider unavailable",
		"Model configuration",
		"Temperature",
		"Max output",
		"Save and connect",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
	for _, unwanted := range []string{
		"Context length",
		"Model id:",
		"Advanced options",
		"Live catalog unavailable; static suggestions shown.",
	} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("render should not include %q\n%s", unwanted, out)
		}
	}
}

func TestLMConfigModelUnavailableWarningWraps(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:            "argonne_sophia",
		Label:         "ALCF Sophia (Globus Auth)",
		Provider:      "argonne",
		APIBase:       "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		AuthMethod:    "oauth",
		Status:        "auth_check_required",
		StatusMessage: "Globus token stored; validate or refresh before using ALCF",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.modelCatalogWarnings = map[string]string{
		"argonne_sophia": "Globus token stored; validate or refresh before using ALCF",
	}
	a.lmConfig.modelCatalogSources = map[string]string{"argonne_sophia": "unavailable"}

	out := ansi.Strip(a.renderLMConfigModelList(42, 5))

	for _, want := range []string{
		"Provider unavailable:",
		"validate or refresh",
		"using ALCF",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("wrapped unavailable warning missing %q\n%s", want, out)
		}
	}
}

func TestLMConfigLayoutRespondsToTerminalHeight(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio: no warning, selectable live catalog.
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.modelCatalogWarnings = map[string]string{}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{}
	for i := 0; i < 18; i++ {
		a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
			ID:             "local_extra_" + strconv.Itoa(i),
			Label:          "Local Extra " + strconv.Itoa(i),
			Provider:       "lm_studio",
			APIBase:        "http://127.0.0.1:1234/v1",
			SuggestedModel: "model-" + strconv.Itoa(i),
			Description:    "Local test provider.",
		})
		a.lmConfig.modelCatalogs["lm_studio"] = append(a.lmConfig.modelCatalogs["lm_studio"], gact.Model{
			ID: "model-" + strconv.Itoa(i),
		})
	}
	a.lmConfig.model = "model-0"
	a.lmConfig.modelIndex = 0

	a.height = 28
	smallRows := a.lmConfigBodyRows()
	small := a.lmConfigLayout(120, smallRows)
	smallBody := strings.Split(a.renderLMConfigBody(120, smallRows), "\n")

	a.height = 58
	largeRows := a.lmConfigBodyRows()
	large := a.lmConfigLayout(120, largeRows)
	largeBody := strings.Split(a.renderLMConfigBody(120, largeRows), "\n")

	if largeRows <= smallRows {
		t.Fatalf("body rows did not grow with terminal height: small=%d large=%d", smallRows, largeRows)
	}
	if large.providerRows <= small.providerRows {
		t.Fatalf("provider rows did not grow: small=%d large=%d", small.providerRows, large.providerRows)
	}
	if large.modelRows <= small.modelRows {
		t.Fatalf("model rows did not grow: small=%d large=%d", small.modelRows, large.modelRows)
	}
	if len(smallBody) != smallRows {
		t.Fatalf("small rendered body height = %d, want %d", len(smallBody), smallRows)
	}
	if len(largeBody) != largeRows {
		t.Fatalf("large rendered body height = %d, want %d", len(largeBody), largeRows)
	}
}

func TestLMConfigModalHeightDoesNotExceedTerminal(t *testing.T) {
	for _, height := range []int{18, 24, 40} {
		a := newLMConfigTestApp()
		a.width = 132
		a.height = height

		renderedHeight := len(strings.Split(ansi.Strip(a.viewLMConfig()), "\n"))
		if renderedHeight > height {
			t.Fatalf("modal height at terminal height %d = %d", height, renderedHeight)
		}
	}
}

func TestLMConfigShortModalKeepsSaveActionVisible(t *testing.T) {
	a := newLMConfigTestApp()
	a.width = 132
	a.height = 24
	a.lmConfig.selected = 0 // LM Studio has no API-key detour and exposes model settings.
	a.lmConfig.modelCatalogWarnings = map[string]string{}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "qwopus3.5-9b-v3"}}
	a.lmConfig.model = "qwopus3.5-9b-v3"
	a.lmConfig.modelIndex = 0

	out := ansi.Strip(a.viewLMConfig())

	if !strings.Contains(out, "Save and connect") {
		t.Fatalf("short modal should keep save action visible\n%s", out)
	}
	if renderedHeight := len(strings.Split(out, "\n")); renderedHeight > a.height {
		t.Fatalf("short modal height = %d, want <= %d", renderedHeight, a.height)
	}
}

func TestLMConfigPasteRoutesToAPIKeyField(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 2 // OpenAI / ChatGPT
	a.lmConfig.field = lmFieldAPIKey

	_, _ = a.Update(tea.PasteMsg{Content: "sk-test\r\n"})

	if a.lmConfig.apiKey != "sk-test" {
		t.Fatalf("pasted API key = %q, want sk-test", a.lmConfig.apiKey)
	}
}

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
	out := ansi.Strip(a.viewLMConfig())
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
	out := ansi.Strip(a.viewLMConfig())
	if !strings.Contains(out, "Model candidates") || !strings.Contains(out, "opus") {
		t.Fatalf("static CLI catalog was not rendered\n%s", out)
	}
}

func TestLMConfigPresetSwitchUsesPresetAPIBaseForSameProviderKind(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Provider = "argonne"
	a.lmConfig.info.APIBase = "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1"
	a.lmConfig.info.Model = "openai/gpt-oss-120b"
	a.lmConfig.info.Presets = []client.LMProviderPreset{
		{
			ID:             "argonne_metis",
			Label:          "ALCF Metis (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1",
			SuggestedModel: "gpt-oss-120b",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
		{
			ID:             "argonne_sophia",
			Label:          "ALCF Sophia (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			SuggestedModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
	}
	a.lmConfig.selected = 0

	_ = a.lmConfigSyncFromPreset()

	if a.lmConfig.apiBase != "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1" {
		t.Fatalf("metis preset inherited stale Sophia api_base: %q", a.lmConfig.apiBase)
	}
	if a.lmConfig.model != "gpt-oss-120b" {
		t.Fatalf("metis preset inherited stale Sophia model: %q", a.lmConfig.model)
	}
}

func TestLMConfigArgonneShowsAuthActionAndBlocksUntilAuthenticated(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:             "argonne_sophia",
		Label:          "ALCF Sophia (Globus Auth)",
		Provider:       "argonne",
		APIBase:        "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		SuggestedModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
		RequiresAPIKey: false,
		AuthMethod:     "oauth",
		Description:    "Argonne Sophia inference gateway.",
		Status:         "auth_required",
		StatusMessage:  "no Globus token stored; authenticate ALCF before connecting",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.field = lmFieldPreset

	fields := a.lmConfig.lmConfigVisibleFields()
	foundAuth := false
	for _, field := range fields {
		if field == lmFieldAuth {
			foundAuth = true
		}
	}
	if !foundAuth {
		t.Fatal("argonne oauth provider should expose an auth field")
	}
	if a.lmConfigCanSave(a.lmConfig.info.Presets[a.lmConfig.selected]) {
		t.Fatal("argonne provider should not be saveable before auth succeeds")
	}
	out := ansi.Strip(a.viewLMConfig())
	for _, want := range []string{
		"auth: Globus login required",
		"Authenticate",
		"no Globus token stored",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
}

func TestLMConfigArgonneReadyTokenRendersAsUsable(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:              "argonne_sophia",
		Label:           "ALCF Sophia (Globus Auth)",
		Provider:        "argonne",
		APIBase:         "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		SuggestedModel:  "meta-llama/Meta-Llama-3.1-8B-Instruct",
		RequiresAPIKey:  false,
		AuthMethod:      "oauth",
		IsAuthenticated: true,
		Description:     "Argonne Sophia inference gateway.",
		Status:          "ready",
		StatusMessage:   "Globus token validated",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.modelCatalogs["argonne_sophia"] = []gact.Model{
		{ID: "meta-llama/Meta-Llama-3.1-8B-Instruct", Name: "Meta-Llama-3.1-8B-Instruct"},
	}
	a.lmConfig.modelCatalogSources["argonne_sophia"] = "live"

	if !a.lmConfigCanSave(a.lmConfig.info.Presets[a.lmConfig.selected]) {
		t.Fatal("ready argonne provider should be saveable")
	}
	out := ansi.Strip(a.viewLMConfig())
	for _, want := range []string{
		"auth: Globus token ready",
		"Refresh token",
		"status: ready",
		"Meta-Llama-3.1-8B-Instruct",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
	if strings.Contains(out, "Globus login required") || strings.Contains(out, "Authenticate") {
		t.Fatalf("ready argonne provider still looks unauthenticated\n%s", out)
	}
}

func TestLMConfigProviderDetailsHardWrapsLongAPIBase(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:             "argonne_metis",
		Label:          "ALCF Metis (Globus Auth)",
		Provider:       "argonne",
		APIBase:        "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1",
		SuggestedModel: "gpt-oss-120b",
		AuthMethod:     "oauth",
		Description:    "Argonne Metis inference gateway.",
		Status:         "ready",
		StatusMessage:  "Globus token ready",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.apiBase = "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1"

	out := ansi.Strip(a.renderLMConfigProviderDetails(54, 9))

	if strings.Contains(out, "…") {
		t.Fatalf("API base should hard-wrap without ellipsis\n%s", out)
	}
	if !strings.Contains(out, "resource_server") || !strings.Contains(out, "/metis/api/v1") {
		t.Fatalf("wrapped API base missing expected segments\n%s", out)
	}
	if !strings.Contains(out, "status: ready") {
		t.Fatalf("status should remain visible after API base wrapping\n%s", out)
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

	cmd := a.lmConfigSyncFromPreset()

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
	if status := a.lmConfigPresetStatusText(fixture.lmConfig.info.Presets[0]); status != "checking..." {
		t.Fatalf("pending status = %q, want checking...", status)
	}
}

func TestLMConfigProviderFilterUsesTypedText(t *testing.T) {
	a := newLMConfigTestApp()

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: 'l', Text: "l"})
	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: 'm', Text: "m"})

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

	_, _ = a.handleLMConfigKey(tea.KeyPressMsg{Code: 'z', Text: "z"})

	if a.lmConfig.modelFilter != "z" {
		t.Fatalf("model filter = %q, want z", a.lmConfig.modelFilter)
	}
	if a.lmConfig.model != "zeta-model" {
		t.Fatalf("filtered model = %q, want zeta-model", a.lmConfig.model)
	}
	out := ansi.Strip(a.viewLMConfig())
	if !strings.Contains(out, "filter: z_") {
		t.Fatalf("model filter was not rendered\n%s", out)
	}
}

func TestLMConfigProviderRowsUseSemanticHitTargets(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:0")
	if !ok {
		t.Fatal("missing semantic LM provider target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("provider row click should queue provider sync/catalog fetch")
	}
	if a.lmConfig.selected != 0 {
		t.Fatalf("selected provider = %d, want 0", a.lmConfig.selected)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
	}
}

func TestLMConfigProviderRowsAlignWithSharedFrameBody(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:0")
	if !ok {
		t.Fatal("missing semantic LM provider target")
	}
	view := a.viewLMConfig()
	rect := overlayMouseRect(view, a.width, a.height)
	providerLine := -1
	for i, line := range strings.Split(stripANSI(view), "\n") {
		if strings.Contains(line, "LM Studio (localhost)") {
			providerLine = i
			break
		}
	}
	if providerLine < 0 {
		t.Fatalf("could not find visible LM Studio provider row in:\n%s", stripANSI(view))
	}
	if wantY := rect.y + providerLine; target.rect.y != wantY {
		t.Fatalf("LM Studio provider target y = %d, want visible provider row %d", target.rect.y, wantY)
	}
}

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

func TestLMConfigFilterAndEditableFieldsUseSemanticHitTargets(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldAPIBase
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "alpha-model"}}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	providerFilter, ok := findHitTargetForTest(a, "lm-config:provider:filter")
	if !ok {
		t.Fatal("missing provider filter hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      providerFilter.rect.x,
		Y:      providerFilter.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("provider filter click field = %v, want preset", a.lmConfig.field)
	}

	_ = a.View()
	modelFilter, ok := findHitTargetForTest(a, "lm-config:model:filter")
	if !ok {
		t.Fatal("missing model filter hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      modelFilter.rect.x,
		Y:      modelFilter.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("model filter click field = %v, want model", a.lmConfig.field)
	}

	_ = a.View()
	apiBase, ok := findHitTargetForTest(a, "lm-config:api-base")
	if !ok {
		t.Fatal("missing api base hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      apiBase.rect.x,
		Y:      apiBase.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldAPIBase {
		t.Fatalf("api base click field = %v, want api base", a.lmConfig.field)
	}

	a.lmConfig.selected = 2
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.apiBase = "https://api.openai.com/v1"
	_ = a.View()
	apiKey, ok := findHitTargetForTest(a, "lm-config:api-key")
	if !ok {
		t.Fatal("missing api key hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      apiKey.rect.x,
		Y:      apiKey.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("api key click field = %v, want api key", a.lmConfig.field)
	}
}

func TestLMConfigProviderWheelUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.lmConfig.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:wheel")
	if !ok {
		t.Fatal("missing semantic LM provider wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.lmConfig.selected != 1 {
		t.Fatalf("selected provider = %d, want 1", a.lmConfig.selected)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
	}
}

func TestLMConfigProviderRailUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.height = 40
	a.lmConfig.selected = 0
	for i := 0; i < 12; i++ {
		a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
			ID:             "provider_" + itoa2(i),
			Label:          "Provider " + itoa2(i),
			Provider:       "openai",
			SuggestedModel: "model",
		})
	}
	want := len(a.lmConfig.info.Presets) - 1

	_ = a.View()
	target, ok := findLastHitTargetWithPrefixForTest(a, "lm-config:provider:rail:")
	if !ok {
		t.Fatal("missing semantic LM provider rail target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.lmConfig.selected != want {
		t.Fatalf("selected provider = %d, want %d", a.lmConfig.selected, want)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
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

func TestLMConfigSaveButtonUsesSemanticHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "alpha-model"}}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:save")
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
	if a.lmConfigOpen || a.lmConfig != nil {
		t.Fatal("close click should close LM config modal")
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
	if a.lmConfig == nil || a.lmConfig.err != nil {
		t.Fatalf("refresh should keep config open and clear errors, config=%+v", a.lmConfig)
	}
}

func TestLMConfigSavingSuppressesCloseButtonHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.saving = true

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:lm-config:close"); ok {
		t.Fatal("saving provider setup should render close without registering an active close hit target")
	}
}

func TestLMConfigOutsideClickUsesSharedCloseState(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside click should not dispatch a command")
	}
	if a.lmConfigOpen || a.lmConfig != nil {
		t.Fatal("outside click should close LM config modal")
	}
}

func TestLMConfigUnsupportedEndpointReturnsToSettings(t *testing.T) {
	a := newLMConfigTestApp()
	a.settingsOpen = false

	_, _ = a.Update(lmConfigFetchedMsg{info: nil, err: nil})

	if a.lmConfigOpen {
		t.Fatal("unsupported endpoint should close LM config modal")
	}
	if !a.settingsOpen {
		t.Fatal("unsupported endpoint should return to Settings")
	}
	if a.settings == nil || !strings.Contains(a.settings.loadErr, "/v1/providers/lm") {
		t.Fatalf("missing unsupported-endpoint message: %#v", a.settings)
	}
}

func TestLMConfigSavedMirrorsGlobalProviderAndClearsSessionModels(t *testing.T) {
	a := newLMConfigTestApp()
	a.wsID = "ws_default"
	a.sessions = []gact.Session{
		{
			ID:    "sess_1",
			Title: "old model",
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
		{
			ID:    "sess_2",
			Title: "also old",
			Model: gact.ModelRef{ProviderID: "openai", ModelID: "gpt-4o-mini"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}

	info := &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		APIBase:    "http://127.0.0.1:1234/v1",
		Model:      "qwopus3.5-9b-v3",
	}
	updated, cmd := a.Update(lmConfigSavedMsg{info: info})
	a = updated.(*App)

	if a.lmConfigOpen || a.lmConfig != nil {
		t.Fatal("successful save should close the provider modal")
	}
	if a.lmProviderInfo == nil || a.lmProviderInfo.Model != "qwopus3.5-9b-v3" {
		t.Fatalf("provider info was not mirrored locally: %#v", a.lmProviderInfo)
	}
	for _, sess := range a.sessions {
		if sess.Model.ProviderID != "" || sess.Model.ModelID != "" || sess.Model.Variant != "" {
			t.Fatalf("stale session model was not cleared: %#v", sess.Model)
		}
	}
	if a.transientHint != "LM configured: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("successful save should schedule hint expiry and session refresh")
	}
}

func TestLMConfigAsyncSavePollsUntilReady(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfigOpen = true
	a.lmConfig.saving = true

	configuring := &client.LMProviderInfo{
		Configured:    false,
		Provider:      "lm_studio",
		Model:         "qwopus3.5-9b-v3",
		State:         "configuring",
		StatusMessage: "LM Studio provider configuration is in progress.",
		OperationID:   "lmcfg_test",
		ContextLength: 32768,
	}
	updated, cmd := a.Update(lmConfigSavedMsg{info: configuring})
	a = updated.(*App)

	if a.lmConfigOpen || a.lmConfig != nil {
		t.Fatalf(
			"configuring save should close modal and continue in background: open=%v state=%#v",
			a.lmConfigOpen,
			a.lmConfig,
		)
	}
	if a.lmProviderInfo == nil || a.lmProviderInfo.State != "configuring" {
		t.Fatalf("configuring provider info was not mirrored: %#v", a.lmProviderInfo)
	}
	if a.transientHint != "LM configuration in progress: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("configuring save should schedule provider-status polling")
	}

	a.focus = FocusInput
	updated, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = updated.(*App)
	if a.input.Value() != "d" {
		t.Fatalf("input should remain usable during background provider load, got %q", a.input.Value())
	}

	ready := &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		Model:      "qwopus3.5-9b-v3",
		State:      "ready",
	}
	updated, cmd = a.Update(lmConfigFetchedMsg{info: ready})
	a = updated.(*App)
	if a.lmConfigOpen || a.lmConfig != nil {
		t.Fatal("ready poll should close the provider modal")
	}
	if a.transientHint != "LM configured: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("ready poll should schedule hint expiry/session refresh")
	}
}

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
			Description:    "Direct Anthropic API. Requires ANTHROPIC_API_KEY on the backend host.",
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

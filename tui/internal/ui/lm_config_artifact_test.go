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

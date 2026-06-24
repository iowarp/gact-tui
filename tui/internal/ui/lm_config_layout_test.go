package ui

import (
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigIntroUsesSharedModalInnerWidth(t *testing.T) {
	a := newLMConfigTestApp()

	out := ansi.Strip(a.lmConfig.view())
	if strings.Contains(out, "shown on the\nright") {
		t.Fatalf("intro wrapped before final word despite shared modal width:\n%s", out)
	}
	if !strings.Contains(out, "Status and settings appear on the right.") {
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
	if got := lmConfigBoxRailCol(7, 60); got != 64 {
		t.Fatalf("box rail col = %d, want 64", got)
	}
	if got := lmConfigBoxContentTop(11); got != 13 {
		t.Fatalf("box content top = %d, want 13", got)
	}
	if got := lmConfigBoxHeight(5); got != 8 {
		t.Fatalf("box height = %d, want visible rows plus frame", got)
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

	out := ansi.Strip(a.lmConfig.renderAdvancedBox(60, 12))

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

func TestLMConfigRenderHidesStaleCatalogAndUnsupportedKnobs(t *testing.T) {
	a := newLMConfigTestApp()
	out := ansi.Strip(a.lmConfig.view())

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

	out := ansi.Strip(a.lmConfig.renderModelList(42, 5))

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
	smallRows := a.lmConfig.bodyRows()
	small := a.lmConfig.layout(120, smallRows)
	smallBody := strings.Split(a.lmConfig.renderBody(120, smallRows), "\n")

	a.height = 58
	largeRows := a.lmConfig.bodyRows()
	large := a.lmConfig.layout(120, largeRows)
	largeBody := strings.Split(a.lmConfig.renderBody(120, largeRows), "\n")

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

		renderedHeight := len(strings.Split(ansi.Strip(a.lmConfig.view()), "\n"))
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

	out := ansi.Strip(a.lmConfig.view())

	if !strings.Contains(out, "Save and connect") {
		t.Fatalf("short modal should keep save action visible\n%s", out)
	}
	if renderedHeight := len(strings.Split(out, "\n")); renderedHeight > a.height {
		t.Fatalf("short modal height = %d, want <= %d", renderedHeight, a.height)
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

	out := ansi.Strip(a.lmConfig.renderProviderDetails(54, 9))

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

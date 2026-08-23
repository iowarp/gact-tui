package ui

import (
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestJapaneseLMConfigChromeRendersUnicodeText(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("ja")
	a.width = 120
	a.height = 40
	a.lmConfig.open = true
	a.lmConfig.lmConfigState = lmConfigState{loading: true}

	plain := ansi.Strip(a.lmConfig.view())
	if !strings.Contains(plain, "LM プロバイダー設定") {
		t.Fatalf("LM config title = %q, want Japanese title", plain)
	}
	if !strings.Contains(plain, "/v1/providers/lm を取得中") {
		t.Fatalf("LM config loading text = %q, want Japanese loading text", plain)
	}
	if strings.Contains(plain, "Configure CLIO") || strings.Contains(plain, "fetching /v1") {
		t.Fatalf("LM config chrome fell back to English: %q", plain)
	}
}

func TestSpanishLMConfigBodyDoesNotFallBackToEnglish(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("es")
	a.width = 140
	a.height = 42
	a.lmConfig.open = true
	a.lmConfig.lmConfigState = lmConfigState{
		info: &client.LMProviderInfo{
			Configured: true,
			Provider:   "lm_studio",
			Model:      "qwopus3.5-9b-v3",
			Presets: []client.LMProviderPreset{{
				ID:                  "lm_studio",
				Label:               "LM Studio",
				Provider:            "lm_studio",
				APIBase:             "http://127.0.0.1:1234/v1",
				Status:              "ready",
				SupportsLiveCatalog: true,
			}},
		},
		selected:            0,
		modelIndex:          0,
		modelCatalogs:       map[string][]gact.Model{"lm_studio": {{ID: "qwopus3.5-9b-v3", Name: "Qwopus", ContextWindow: 262144}}},
		modelCatalogSources: map[string]string{"lm_studio": "live"},
		modelCatalogWarnings: map[string]string{
			"lm_studio": "",
		},
	}

	plain := ansi.Strip(a.lmConfig.view())
	for _, want := range []string{"Proveedor", "Configuración", "Modelo", "Configuración del modelo", "Detalles del modelo", "Contexto máximo"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("Spanish LM config missing %q in:\n%s", want, plain)
		}
	}
	for _, bad := range []string{"Provider (", "Selected", "Model configuration", "Model details", "Max context"} {
		if strings.Contains(plain, bad) {
			t.Fatalf("Spanish LM config still contains English %q in:\n%s", bad, plain)
		}
	}
}

func TestJapaneseLMConfigBoxKeepsBorderWidthWithWideText(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("ja")
	width := 44
	box := a.lmConfig.renderBox(
		"プロバイダー",
		[]string{"プロバイダーの説明がとても長い場合でも罫線は揃う必要があります"},
		width,
		2,
	)
	for _, line := range strings.Split(box, "\n") {
		stripped := ansi.Strip(line)
		if got := lipgloss.Width(stripped); got != width {
			t.Fatalf("line width = %d, want %d for %q in:\n%s", got, width, stripped, box)
		}
	}
}

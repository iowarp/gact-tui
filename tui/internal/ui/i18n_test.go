package ui

import (
	"reflect"
	"sort"
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLocalizerLoadsEnglishCatalog(t *testing.T) {
	l := newLocalizer("en")
	got := l.t(msgPostFailureAgentStarting, nil)
	want := "message not sent - CLIO agent is still starting; press Enter to retry"
	if got != want {
		t.Fatalf("localized string = %q, want %q", got, want)
	}
}

func TestLocaleCatalogsHaveTheSameMessageIDs(t *testing.T) {
	en, ok := loadLocaleCatalog("en")
	if !ok {
		t.Fatal("English locale catalog missing")
	}
	want := sortedCatalogKeys(en)
	for _, locale := range []string{"el", "es", "ja"} {
		catalog, ok := loadLocaleCatalog(locale)
		if !ok {
			t.Fatalf("%s locale catalog missing", locale)
		}
		if got := sortedCatalogKeys(catalog); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s catalog keys differ\n got: %v\nwant: %v", locale, got, want)
		}
	}
}

func sortedCatalogKeys(catalog map[string]string) []string {
	keys := make([]string, 0, len(catalog))
	for key := range catalog {
		if strings.HasPrefix(key, "__meta.") {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func TestAvailableLanguageOptionsComeFromLocaleFiles(t *testing.T) {
	options := availableLanguageOptions()
	if len(options) < 4 {
		t.Fatalf("language options = %v, want at least en/el/es/ja", options)
	}
	if options[0].Locale != "en" {
		t.Fatalf("first language = %q, want en as fallback/default", options[0].Locale)
	}
	seen := map[string]languageOption{}
	for _, opt := range options {
		seen[opt.Locale] = opt
		if opt.NativeName == "" {
			t.Fatalf("language option %q has empty native name: %#v", opt.Locale, opt)
		}
	}
	if seen["el"].Machine != true || seen["es"].Machine != true || seen["ja"].Machine != true {
		t.Fatalf("machine metadata not loaded from locale files: %#v", seen)
	}
	if seen["en"].Machine {
		t.Fatalf("English should not be marked machine translated: %#v", seen["en"])
	}
}

func TestLocalizerFallsBackToEnglishForUnknownLocale(t *testing.T) {
	l := newLocalizer("zz-ZZ")
	got := l.t(msgPostFailureAgentNotConfigured, nil)
	want := "message not sent - no CLIO agent is configured; configure or start an agent first"
	if got != want {
		t.Fatalf("fallback string = %q, want %q", got, want)
	}
	if l.locale != "en" {
		t.Fatalf("fallback locale = %q, want en", l.locale)
	}
}

func TestLocalizerInterpolatesNamedValues(t *testing.T) {
	l := newLocalizer("en")
	got := l.t(msgPostFailureRetryWithError, map[string]string{"error": "dial tcp: refused"})
	want := "message not sent - press Enter to retry · dial tcp: refused"
	if got != want {
		t.Fatalf("interpolated string = %q, want %q", got, want)
	}
}

func TestLocalizerLoadsSpanishCatalog(t *testing.T) {
	l := newLocalizer("es-MX")
	got := l.t(msgPostFailureAgentNotConfigured, nil)
	if !strings.Contains(got, "no hay ningún agente CLIO configurado") {
		t.Fatalf("localized string = %q, want Spanish not-configured text", got)
	}
	if strings.Contains(got, "message not sent") {
		t.Fatalf("localized string fell back to English: %q", got)
	}
}

func TestLocalizerLoadsJapaneseCatalog(t *testing.T) {
	l := newLocalizer("ja-JP")
	got := l.t(msgPostFailureAgentStarting, nil)
	if !strings.Contains(got, "起動中") {
		t.Fatalf("localized string = %q, want Japanese startup text", got)
	}
	if strings.Contains(got, "message not sent") {
		t.Fatalf("localized string fell back to English: %q", got)
	}
}

func TestLocalizerLoadsGreekCatalog(t *testing.T) {
	l := newLocalizer("el-GR")
	got := l.t(msgPostFailureAgentStarting, nil)
	if !strings.Contains(got, "εκκινεί") {
		t.Fatalf("localized string = %q, want Greek startup text", got)
	}
	if strings.Contains(got, "message not sent") {
		t.Fatalf("localized string fell back to English: %q", got)
	}
}

func TestInputPlaceholderUsesActiveLocale(t *testing.T) {
	a := New("http://unused")
	if !strings.Contains(a.input.Placeholder, "type a message") {
		t.Fatalf("English placeholder = %q, want English text", a.input.Placeholder)
	}

	a.SetLocale("es")
	if !strings.Contains(a.input.Placeholder, "escribe un mensaje") {
		t.Fatalf("Spanish placeholder = %q, want translated text", a.input.Placeholder)
	}
	if strings.Contains(a.input.Placeholder, "type a message") {
		t.Fatalf("Spanish placeholder fell back to English: %q", a.input.Placeholder)
	}

	a.SetLocale("ja")
	if !strings.Contains(a.input.Placeholder, "メッセージを入力") {
		t.Fatalf("Japanese placeholder = %q, want translated text", a.input.Placeholder)
	}
}

func TestPostFailedJapaneseHintRendersUnicodeText(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("ja")

	model, _ := a.Update(postFailedMsg{
		text: "hi",
		err: &client.Error{
			Status:  503,
			Code:    "agent_not_available",
			Message: "not ready",
			Details: map[string]any{"agent_status": "starting"},
		},
	})
	a = model.(*App)

	plain := ansi.Strip(a.transientHint)
	if !strings.Contains(plain, "起動中") {
		t.Fatalf("hint = %q, want Japanese startup text", plain)
	}
	if strings.Contains(plain, "message not sent") {
		t.Fatalf("hint fell back to English: %q", plain)
	}
}

func TestSpanishChromeStringsRenderInHeaderAndFooter(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model:       gact.ModelRef{ProviderID: "lm_studio", ModelID: "qwopus3.5-9b-v3"},
			Agent:       gact.AgentRef{ID: "analysis"},
			RoutingMode: "auto",
		},
	}, nil)
	a.SetLocale("es")
	a.width = 180

	header := ansi.Strip(a.renderHeader())
	if !strings.Contains(header, "espacio: default") ||
		!strings.Contains(header, "sesión: demo") ||
		!strings.Contains(header, "modelo: lm_studio/qwopus3.5-9b-v3") ||
		!strings.Contains(header, "agente: analysis") ||
		!strings.Contains(header, "ruteo: auto") {
		t.Fatalf("Spanish header did not render localized chrome: %q", header)
	}

	footer := ansi.Strip(a.renderFooter())
	if !strings.Contains(footer, "foco:") ||
		!strings.Contains(footer, "ajustes") ||
		!strings.Contains(footer, "salir") {
		t.Fatalf("Spanish footer did not render localized chrome: %q", footer)
	}
}

func TestJapaneseLMConfigChromeRendersUnicodeText(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("ja")
	a.width = 120
	a.height = 40
	a.lmConfigOpen = true
	a.lmConfig = &lmConfigState{loading: true}

	plain := ansi.Strip(a.viewLMConfig())
	if !strings.Contains(plain, "CLIO の LM プロバイダー設定") {
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
	a.lmConfigOpen = true
	a.lmConfig = &lmConfigState{
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

	plain := ansi.Strip(a.viewLMConfig())
	for _, want := range []string{"Proveedor", "Seleccionado", "Modelo", "Configuración del modelo", "Detalles del modelo", "Contexto máximo"} {
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

func TestSpanishHighVisibilityChromeDoesNotFallBackToEnglish(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.SetLocale("es")
	a.width = 140
	a.height = 34
	a.paletteOpen = true
	a.helpOpen = true
	a.quitConfirmOpen = true

	sidebar := ansi.Strip(a.renderSidebar(28, 20))
	if !strings.Contains(sidebar, "SESIONES") || strings.Contains(sidebar, "SESSIONS") {
		t.Fatalf("Spanish sidebar not localized: %q", sidebar)
	}

	body := ansi.Strip(a.renderBody(100, 24))
	if !strings.Contains(body, "CONVERSACIÓN") || strings.Contains(body, "CONVERSATION") {
		t.Fatalf("Spanish conversation pane not localized: %q", body)
	}

	help := ansi.Strip(a.viewHelp())
	if !strings.Contains(help, "Atajos") || strings.Contains(help, "Keybindings") {
		t.Fatalf("Spanish help chrome not localized: %q", help)
	}

	palette := ansi.Strip(a.viewPalette())
	if !strings.Contains(palette, "Comandos") || strings.Contains(palette, "Commands") {
		t.Fatalf("Spanish palette chrome not localized: %q", palette)
	}

	quit := ansi.Strip(a.viewQuitConfirm())
	if !strings.Contains(quit, "¿Cerrar la TUI?") || strings.Contains(quit, "Close the TUI?") {
		t.Fatalf("Spanish quit modal not localized: %q", quit)
	}
}

func TestSpanishSettingsHelpCommandsAndProviderDescriptionsAreLocalized(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.SetLocale("es")
	a.width = 150
	a.height = 42

	a.settings = &settingsState{
		tab: 1,
		agentList: []gact.AgentDef{
			{ID: "analysis", Title: "Analysis Expert"},
			{ID: "data_validator", Title: "Data Validator"},
		},
	}
	agentView := ansi.Strip(a.viewSettings())
	if !strings.Contains(agentView, "Experto de análisis") || strings.Contains(agentView, "Analysis Expert") {
		t.Fatalf("Spanish agent settings not localized:\n%s", agentView)
	}

	a.settings = &settingsState{tab: 2}
	themeView := ansi.Strip(a.viewSettings())
	if !strings.Contains(themeView, "Oscuro") || strings.Contains(themeView, "default - purple") {
		t.Fatalf("Spanish theme settings not localized:\n%s", themeView)
	}

	a.settings = &settingsState{tab: 3}
	tuiView := ansi.Strip(a.viewSettings())
	if !strings.Contains(tuiView, "umbral de colapso") || strings.Contains(tuiView, "collapse threshold") {
		t.Fatalf("Spanish TUI settings not localized:\n%s", tuiView)
	}

	helpView := ansi.Strip(a.viewHelp())
	if !strings.Contains(helpView, "cambiar foco entre paneles") || strings.Contains(helpView, "cycle focus") {
		t.Fatalf("Spanish help descriptions not localized:\n%s", helpView)
	}

	commands := a.paletteMatches()
	foundTheme := false
	for _, cmd := range commands {
		if cmd.ID == "/theme" {
			foundTheme = true
			if cmd.Title != "Tema" || strings.Contains(cmd.Description, "Pick a color") || strings.Contains(cmd.Description, "Pick a colour") {
				t.Fatalf("Spanish command palette entry not localized: %#v", cmd)
			}
		}
	}
	if !foundTheme {
		t.Fatal("did not find /theme command")
	}

	a.lmConfig = &lmConfigState{
		info: &client.LMProviderInfo{Presets: []client.LMProviderPreset{{
			ID:          "lm_studio",
			Label:       "LM Studio (localhost)",
			Provider:    "lm_studio",
			APIBase:     "http://127.0.0.1:1234/v1",
			Description: "Locally-hosted models via LM Studio.",
			Status:      "ready",
		}}},
		selected:             0,
		modelCatalogs:        map[string][]gact.Model{},
		modelCatalogWarnings: map[string]string{},
		modelCatalogSources:  map[string]string{},
	}
	providerView := ansi.Strip(a.renderLMConfigProviderDetails(72, 8))
	if !strings.Contains(providerView, "Modelos locales servidos por LM Studio") ||
		strings.Contains(providerView, "Locally-hosted models") {
		t.Fatalf("Spanish provider description not localized:\n%s", providerView)
	}
}

func TestJapaneseLMConfigBoxKeepsBorderWidthWithWideText(t *testing.T) {
	a := New("http://unused")
	a.SetLocale("ja")
	width := 44
	box := a.lmConfigBox(
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

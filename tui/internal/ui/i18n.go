package ui

// i18n.go provides the localizer, language options, and locale-aware placeholder handling.

import (
	"embed"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"
)

//go:embed locale/*.json
var localeFiles embed.FS

type languageOption struct {
	Locale      string
	NativeName  string
	EnglishName string
	Source      string
	Direction   string
	Machine     bool
}

// Localizer resolves user-visible strings from locale catalog files.
type Localizer struct {
	locale  string
	catalog map[string]string
}

func newLocalizer(locale string) Localizer {
	normalized := normalizeLocale(locale)
	catalog, ok := loadLocaleCatalog(normalized)
	if !ok && normalized != "en" {
		catalog, ok = loadLocaleCatalog("en")
		normalized = "en"
	}
	if !ok {
		catalog = map[string]string{}
	}
	return Localizer{locale: normalized, catalog: catalog}
}

// SetLocale switches the active UI locale immediately.
func (a *App) SetLocale(locale string) {
	a.localizer = newLocalizer(locale)
	a.refreshLocalizedPlaceholders()
}

// Locale returns the normalized active locale code.
func (a *App) Locale() string {
	return a.localizer.locale
}

func (a *App) refreshLocalizedPlaceholders() {
	a.inputComposer.input.Placeholder = a.inputComposer.localizedPlaceholder(0)
}

func (c *inputComposerComponent) localizedPlaceholder(width int) string {
	full := c.app.localizer.t(msgInputPlaceholder, nil)
	if width <= 0 || lipgloss.Width(full) <= width {
		return full
	}
	trimmed := strings.TrimSpace(full)
	if before, _, ok := strings.Cut(trimmed, " ("); ok && before != "" {
		trimmed = before
	}
	if lipgloss.Width(trimmed) <= width {
		return trimmed
	}
	if before, _, ok := strings.Cut(trimmed, " · "); ok && before != "" {
		trimmed = strings.TrimSpace(before)
	}
	return trimmed
}

func (l Localizer) languageOptionLabel(opt languageOption) string {
	label := opt.NativeName
	if label == "" {
		label = opt.Locale
	}
	if opt.Machine {
		label += " (" + l.t(msgLanguageMachine, nil) + ")"
	}
	return label
}

func availableLanguageOptions() []languageOption {
	entries, err := localeFiles.ReadDir("locale")
	if err != nil {
		return []languageOption{{Locale: "en", NativeName: "English", EnglishName: "English"}}
	}
	out := make([]languageOption, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		locale := normalizeLocale(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		catalog, ok := loadLocaleCatalog(locale)
		if !ok {
			continue
		}
		source := strings.TrimSpace(catalog["__meta.translation_source"])
		opt := languageOption{
			Locale:      locale,
			NativeName:  firstNonEmpty(catalog["__meta.native_name"], catalog[string(msgLanguageNativeName)], locale),
			EnglishName: firstNonEmpty(catalog["__meta.english_name"], locale),
			Source:      source,
			Direction:   firstNonEmpty(catalog["__meta.text_direction"], "ltr"),
			Machine:     strings.Contains(strings.ToLower(source), "machine"),
		}
		out = append(out, opt)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Locale == "en" {
			return true
		}
		if out[j].Locale == "en" {
			return false
		}
		return out[i].Locale < out[j].Locale
	})
	if len(out) == 0 {
		return []languageOption{{Locale: "en", NativeName: "English", EnglishName: "English"}}
	}
	return out
}

func languageIndex(locale string) int {
	normalized := normalizeLocale(locale)
	for i, opt := range availableLanguageOptions() {
		if opt.Locale == normalized {
			return i
		}
	}
	return 0
}

func activeLanguageOption(locale string) languageOption {
	options := availableLanguageOptions()
	idx := languageIndex(locale)
	if idx < 0 || idx >= len(options) {
		idx = 0
	}
	return options[idx]
}

func (l Localizer) activeLanguageLabel() string {
	return l.languageOptionLabel(activeLanguageOption(l.locale))
}

func normalizeLocale(locale string) string {
	locale = strings.TrimSpace(strings.ToLower(locale))
	if locale == "" {
		return "en"
	}
	locale = strings.ReplaceAll(locale, "_", "-")
	if idx := strings.Index(locale, "-"); idx > 0 {
		return locale[:idx]
	}
	return locale
}

func loadLocaleCatalog(locale string) (map[string]string, bool) {
	body, err := localeFiles.ReadFile("locale/" + locale + ".json")
	if err != nil {
		return nil, false
	}
	var catalog map[string]string
	if err := json.Unmarshal(body, &catalog); err != nil {
		return nil, false
	}
	return catalog, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (l Localizer) t(id messageID, values map[string]string) string {
	text := l.catalog[string(id)]
	if text == "" && l.locale != "en" {
		if fallback, ok := loadLocaleCatalog("en"); ok {
			text = fallback[string(id)]
		}
	}
	if text == "" {
		text = string(id)
	}
	for key, value := range values {
		text = strings.ReplaceAll(text, "{{"+key+"}}", value)
	}
	return text
}

func (l Localizer) tf(id messageID, values map[string]any) string {
	stringValues := make(map[string]string, len(values))
	for key, value := range values {
		stringValues[key] = fmt.Sprint(value)
	}
	return l.t(id, stringValues)
}

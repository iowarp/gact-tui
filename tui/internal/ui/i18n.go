package ui

import (
	"embed"
	"encoding/json"
	"strings"
)

//go:embed locale/*.json
var localeFiles embed.FS

type messageID string

const (
	msgPostFailureRetry              messageID = "post.failure.retry"
	msgPostFailureRetryWithError     messageID = "post.failure.retry_with_error"
	msgPostFailureAgentStarting      messageID = "post.failure.agent.starting"
	msgPostFailureAgentFailed        messageID = "post.failure.agent.failed"
	msgPostFailureAgentNotConfigured messageID = "post.failure.agent.not_configured"
	msgPostFailureAgentUnknown       messageID = "post.failure.agent.unknown"
)

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
	}
	if !ok {
		catalog = map[string]string{}
	}
	return Localizer{locale: normalized, catalog: catalog}
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

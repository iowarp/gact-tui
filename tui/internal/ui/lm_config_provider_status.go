package ui

// lm_config_provider_status.go computes LM-config provider preset status/problem text.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *lmConfigComponent) presetProblem(p client.LMProviderPreset) string {
	if !lmConfigSupportsLiveCatalog(p) {
		if p.Status == "unavailable" && strings.TrimSpace(p.StatusMessage) != "" {
			return strings.TrimSpace(p.StatusMessage)
		}
		return ""
	}
	if msg := strings.TrimSpace(p.StatusMessage); msg != "" && p.Status != "ready" {
		return lmConfigShortStatus(msg)
	}
	if status := strings.TrimSpace(p.Status); status != "" && status != "ready" && status != "unknown" {
		return lmConfigShortStatus(status)
	}
	if msg := strings.TrimSpace(c.modelCatalogWarnings[p.ID]); msg != "" {
		return lmConfigShortStatus(msg)
	}
	return ""
}

func (c *lmConfigComponent) presetPending(p client.LMProviderPreset) bool {
	return c.open && c.modelCatalogPending != nil && c.modelCatalogPending[p.ID]
}

func (c *lmConfigComponent) presetUnchecked(p client.LMProviderPreset) bool {
	if !c.open {
		return false
	}
	if p.Status != "" && p.Status != "unknown" {
		return false
	}
	if c.modelCatalogSources == nil {
		return true
	}
	_, checked := c.modelCatalogSources[p.ID]
	return !checked
}

func (c *lmConfigComponent) presetStatusText(p client.LMProviderPreset) string {
	if msg := c.presetProblem(p); msg != "" {
		return msg
	}
	if c.presetPending(p) {
		return "checking..."
	}
	if _, checked := c.modelCatalogWarnings[p.ID]; checked {
		if len(c.modelCatalogs[p.ID]) > 0 {
			return "ready"
		}
		if c.modelCatalogSources[p.ID] == "live" {
			return "reachable; no models"
		}
	}
	if p.Status == "unknown" {
		return "not checked"
	}
	if p.Status != "" {
		return p.Status
	}
	return "ready"
}

func (c *lmConfigComponent) presetStatusDetail(p client.LMProviderPreset) string {
	if msg := strings.TrimSpace(p.StatusMessage); msg != "" && p.Status != "ready" {
		return msg
	}
	if msg := strings.TrimSpace(c.modelCatalogWarnings[p.ID]); msg != "" {
		return msg
	}
	if c.presetPending(p) {
		return "checking..."
	}
	if _, checked := c.modelCatalogWarnings[p.ID]; checked {
		if len(c.modelCatalogs[p.ID]) > 0 {
			return "ready"
		}
		if c.modelCatalogSources[p.ID] == "live" {
			return "reachable; no models"
		}
	}
	if p.Status == "unknown" {
		return "not checked"
	}
	if p.Status != "" {
		return p.Status
	}
	return "ready"
}

func lmConfigShortStatus(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.Contains(s, "No connection adapters were found") {
		return "no live catalog for this provider"
	}
	if strings.Contains(s, "missing ") {
		return s
	}
	if strings.Contains(s, "unreachable") {
		parts := strings.SplitN(s, ":", 2)
		return strings.TrimSpace(parts[0])
	}
	return textutil.Truncate(s, 72)
}

func (c *lmConfigComponent) localizedProviderDescription(p client.LMProviderPreset) string {
	if key := providerDescriptionLocaleKey(p); key != "" {
		return c.app.localizer.t(messageID(key), nil)
	}
	return p.Description
}

func providerDescriptionLocaleKey(p client.LMProviderPreset) string {
	id := strings.ToLower(strings.TrimSpace(p.ID))
	provider := strings.ToLower(strings.TrimSpace(p.Provider))
	switch id {
	case "lm_studio":
		return "lm_config.provider_desc.lm_studio"
	case "ollama":
		return "lm_config.provider_desc.ollama"
	case "openai":
		return "lm_config.provider_desc.openai"
	case "anthropic":
		return "lm_config.provider_desc.anthropic"
	case "openrouter":
		return "lm_config.provider_desc.openrouter"
	case "codex", "openai_codex":
		return "lm_config.provider_desc.codex"
	case "claude_code":
		return "lm_config.provider_desc.claude_code"
	case "local_vllm", "vllm":
		return "lm_config.provider_desc.local_vllm"
	case "argonne_sophia":
		return "lm_config.provider_desc.argonne_sophia"
	case "argonne_metis":
		return "lm_config.provider_desc.argonne_metis"
	}
	switch provider {
	case "lm_studio":
		return "lm_config.provider_desc.lm_studio"
	case "ollama":
		return "lm_config.provider_desc.ollama"
	case "openai":
		return "lm_config.provider_desc.openai"
	case "anthropic":
		return "lm_config.provider_desc.anthropic"
	case "openrouter":
		return "lm_config.provider_desc.openrouter"
	case "codex":
		return "lm_config.provider_desc.codex"
	case "claude_code":
		return "lm_config.provider_desc.claude_code"
	case "local_vllm", "vllm":
		return "lm_config.provider_desc.local_vllm"
	case "argonne":
		if strings.Contains(id, "metis") {
			return "lm_config.provider_desc.argonne_metis"
		}
		if strings.Contains(id, "sophia") {
			return "lm_config.provider_desc.argonne_sophia"
		}
	}
	return ""
}

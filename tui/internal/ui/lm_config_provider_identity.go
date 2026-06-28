package ui

// lm_config_provider_identity.go resolves LM-config provider identity, summaries, and pending-vs-applied diffs.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func lmConfigIsLocalLiveProvider(p client.LMProviderPreset) bool {
	if !lmConfigSupportsLiveCatalog(p) {
		return false
	}
	base := strings.ToLower(strings.TrimSpace(p.APIBase))
	return p.Provider == "lm_studio" ||
		p.Provider == "ollama" ||
		strings.Contains(base, "127.0.0.1") ||
		strings.Contains(base, "localhost")
}

func lmConfigSupportsLiveCatalog(p client.LMProviderPreset) bool {
	if p.SupportsLiveCatalog {
		return true
	}
	base := strings.ToLower(strings.TrimSpace(p.APIBase))
	if strings.HasPrefix(base, "codex://") || strings.HasPrefix(base, "claude-code://") {
		return false
	}
	return p.Provider != "codex" && p.Provider != "claude_code"
}

// currentPresetID returns the preset id (e.g. "argonne_sophia",
// "argonne_metis", "anthropic") for the highlighted preset, or "" if
// nothing is selected. Used as the catalog cache key so presets that
// share a provider kind don't trample each other's catalogs.
func (c *lmConfigComponent) currentPresetID() string {
	if !c.open || c.info == nil {
		return ""
	}
	if c.selected < 0 || c.selected >= len(c.info.Presets) {
		return ""
	}
	return c.info.Presets[c.selected].ID
}

func lmConfigProviderID(p client.LMProviderPreset) string {
	if id := strings.TrimSpace(p.ID); id != "" {
		return id
	}
	return strings.TrimSpace(p.Provider)
}

func lmConfigProviderModelSummary(provider, model string) string {
	provider = strings.TrimSpace(provider)
	model = strings.TrimSpace(model)
	switch {
	case provider != "" && model != "":
		return provider + "/" + model
	case provider != "":
		return provider
	default:
		return model
	}
}

func lmConfigNormalizedAPIBase(base string) string {
	return strings.TrimRight(strings.TrimSpace(base), "/")
}

func (c *lmConfigComponent) currentPreset() *client.LMProviderPreset {
	if !c.open || c.info == nil {
		return nil
	}
	if c.selected < 0 || c.selected >= len(c.info.Presets) {
		return nil
	}
	return &c.info.Presets[c.selected]
}

func (c *lmConfigComponent) appliedSummary() string {
	if !c.open || c.info == nil || !c.info.Configured {
		return ""
	}
	return lmConfigProviderModelSummary(c.info.Provider, c.info.Model)
}

func (c *lmConfigComponent) pendingSummary(p client.LMProviderPreset) string {
	if !c.open {
		return ""
	}
	return lmConfigProviderModelSummary(lmConfigProviderID(p), c.model)
}

func (c *lmConfigComponent) pendingDiffersFromApplied(p client.LMProviderPreset) bool {
	if !c.open || c.info == nil || !c.info.Configured {
		return false
	}
	info := c.info
	appliedProvider := strings.TrimSpace(info.Provider)
	pendingProviderID := lmConfigProviderID(p)
	pendingProviderKind := strings.TrimSpace(p.Provider)
	providerMatches := appliedProvider != "" &&
		(strings.EqualFold(appliedProvider, pendingProviderID) || strings.EqualFold(appliedProvider, pendingProviderKind))
	modelMatches := strings.EqualFold(strings.TrimSpace(info.Model), strings.TrimSpace(c.model))
	appliedBase := lmConfigNormalizedAPIBase(info.APIBase)
	pendingBase := lmConfigNormalizedAPIBase(c.apiBase)
	apiBaseMatches := appliedBase == "" || pendingBase == "" || strings.EqualFold(appliedBase, pendingBase)
	return !providerMatches || !modelMatches || !apiBaseMatches
}

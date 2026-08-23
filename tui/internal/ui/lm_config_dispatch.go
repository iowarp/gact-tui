package ui

// lm_config_dispatch.go dispatches the LM-config save action and validates whether the preset can save.

import (
	"strconv"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *lmConfigComponent) dispatch() tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	if c.selected < 0 || c.selected >= len(c.info.Presets) {
		return nil
	}
	p := c.info.Presets[c.selected]
	if !c.canSave(p) {
		return nil
	}
	model := c.model
	if model == "" {
		model = p.SuggestedModel
	}
	c.saving = true
	c.err = nil

	// Two save paths share the same picker UI:
	//   1. session-patch: PATCH /v1/sessions/{sid} with just a
	//      ModelRef. Reserved for backends that implement per-session
	//      model refs. CLIO does not use this path.
	//   2. global-PUT: PUT /v1/providers/lm with the full set. Used
	//      on the first-connect lifecycle prompt to wire CLIO's LM
	//      from scratch.
	if c.sessionPatchMode {
		sid := c.targetSessionID
		if sid == "" {
			sid = c.app.session.currentID()
		}
		if sid == "" {
			c.saving = false
			return nil
		}
		ref := &gact.ModelRef{ProviderID: lmConfigProviderID(p), ModelID: model}
		return applySettingsCmd(c.app.c, sid, ref, nil)
	}

	apiKey := strings.TrimSpace(c.apiKey)
	if apiKey == "" && lmConfigNeedsPlaceholderAPIKey(p, c.apiBase) {
		apiKey = "x"
	}
	req := client.LMProviderRequest{
		Provider: lmConfigProviderID(p),
		APIBase:  c.apiBase,
		Model:    model,
		APIKey:   apiKey,
	}
	if c.temperature != "" {
		if v, err := strconv.ParseFloat(c.temperature, 64); err == nil {
			req.Temperature = v
		}
	}
	if c.maxTokens != "" {
		if v, err := strconv.Atoi(c.maxTokens); err == nil {
			req.MaxTokens = v
		}
	}
	if c.contextLength != "" {
		if v, err := strconv.Atoi(c.contextLength); err == nil {
			req.ContextLength = v
		}
	}
	if c.thinkingBudget != "" {
		if v, err := strconv.Atoi(c.thinkingBudget); err == nil {
			req.ThinkingBudget = v
		}
	}
	if c.parallel != "" {
		if v, err := strconv.Atoi(c.parallel); err == nil {
			req.Parallel = v
		}
	}
	return lmConfigSaveCmd(c.app.c, req)
}

func lmConfigNeedsPlaceholderAPIKey(p client.LMProviderPreset, apiBase string) bool {
	if p.RequiresAPIKey || p.AuthMethod == "oauth" || p.Provider == "argonne" {
		return false
	}
	switch p.Provider {
	case "lm_studio", "ollama":
		return true
	case "openai":
		base := strings.ToLower(strings.TrimSpace(apiBase))
		return strings.Contains(base, "127.0.0.1") || strings.Contains(base, "localhost")
	default:
		return false
	}
}

func (c *lmConfigComponent) canSave(p client.LMProviderPreset) bool {
	if !c.open {
		return false
	}
	if c.presetPending(p) || c.presetProblem(p) != "" {
		return false
	}
	if p.RequiresAPIKey && strings.TrimSpace(c.apiKey) == "" {
		return false
	}
	return c.lmConfigSelectedModelSelectable()
}

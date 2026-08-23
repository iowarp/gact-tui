package ui

// lm_config_catalog_handlers.go handles the LM-config models-loaded message.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *lmConfigComponent) handleModelsLoaded(m lmConfigModelsLoadedMsg) (tea.Model, tea.Cmd) {
	// Cache catalog for current provider kind. If still on the
	// matching preset and not typing custom, snap modelIndex to
	// suggested model.
	if !c.open {
		return c.app, nil
	}
	if c.modelCatalogs == nil {
		c.modelCatalogs = map[string][]gact.Model{}
	}
	if c.modelCatalogWarnings == nil {
		c.modelCatalogWarnings = map[string]string{}
	}
	if c.modelCatalogSources == nil {
		c.modelCatalogSources = map[string]string{}
	}
	if c.modelCatalogPending == nil {
		c.modelCatalogPending = map[string]bool{}
	}
	if c.modelCatalogRetries == nil {
		c.modelCatalogRetries = map[string]int{}
	}
	delete(c.modelCatalogPending, m.presetID)
	preferredModel := ""
	if len(m.models) > 0 {
		preferredModel = strings.TrimSpace(m.models[0].ID)
	}
	if m.err == nil && m.warning == "" {
		c.modelCatalogs[m.presetID] = lmConfigSortModels(m.models)
		c.modelCatalogRetries[m.presetID] = 0
	} else {
		c.modelCatalogs[m.presetID] = nil
	}
	c.modelCatalogSources[m.presetID] = m.source
	// Stash the backend's fallback reason (or transport error) so
	// the picker can render an actionable banner. Empty string
	// when the catalog came back live.
	switch {
	case m.err != nil:
		c.modelCatalogWarnings[m.presetID] =
			"transport error: " + m.err.Error()
	case m.warning != "":
		c.modelCatalogWarnings[m.presetID] = m.warning
	default:
		c.modelCatalogWarnings[m.presetID] = ""
	}
	if c.currentPresetID() == m.presetID && m.warning == "" && len(m.models) > 0 {
		if p := c.currentPreset(); p != nil {
			if strings.TrimSpace(c.model) == "" &&
				strings.TrimSpace(p.SuggestedModel) == "" &&
				preferredModel != "" {
				c.model = preferredModel
			}
			c.snapModelToCatalog(*p)
		}
	}
	c.lmConfigEnsureVisibleField()
	if cmd := c.maybeRetryModelFetch(m.presetID); cmd != nil {
		return c.app, cmd
	}
	return c.app, nil
}

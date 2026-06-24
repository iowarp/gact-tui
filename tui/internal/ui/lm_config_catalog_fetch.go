package ui

// lm_config_catalog_fetch.go schedules and retries background LM-config model-catalog fetches.

import (
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *lmConfigComponent) refresh() tea.Cmd {
	if !c.open {
		return nil
	}
	c.err = nil
	if p := c.currentPreset(); p != nil && !lmConfigSupportsLiveCatalog(*p) {
		c.invalidateCurrentCatalog()
		return c.syncFromPreset()
	}
	if pid := c.currentPresetID(); pid != "" {
		delete(c.modelCatalogs, pid)
		delete(c.modelCatalogWarnings, pid)
		delete(c.modelCatalogSources, pid)
		delete(c.modelCatalogPending, pid)
		if p := c.currentPreset(); p != nil {
			return c.queueModelFetch(*p, c.apiBase)
		}
	}
	return lmConfigFetchCmd(c.app.c)
}

func (c *lmConfigComponent) invalidateCurrentCatalog() {
	if !c.open {
		return
	}
	pid := c.currentPresetID()
	if pid == "" {
		return
	}
	delete(c.modelCatalogs, pid)
	delete(c.modelCatalogWarnings, pid)
	delete(c.modelCatalogSources, pid)
	delete(c.modelCatalogPending, pid)
}

func (c *lmConfigComponent) queueModelFetch(p client.LMProviderPreset, apiBaseOverride string) tea.Cmd {
	if !c.open {
		return nil
	}
	if _, cached := c.modelCatalogSources[p.ID]; cached {
		return nil
	}
	if c.modelCatalogPending[p.ID] {
		return nil
	}
	c.modelCatalogPending[p.ID] = true
	return lmConfigFetchModelsCmd(c.app.c, p.ID, apiBaseOverride)
}

func (c *lmConfigComponent) backgroundProbeCmds() []tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	cmds := []tea.Cmd{}
	selectedID := c.currentPresetID()
	for _, p := range c.info.Presets {
		if p.ID == selectedID {
			continue
		}
		if !lmConfigSupportsLiveCatalog(p) {
			continue
		}
		if p.Status != "" && p.Status != "unknown" && p.Status != "ready" {
			continue
		}
		if cmd := c.queueModelFetch(p, p.APIBase); cmd != nil {
			cmds = append(cmds, cmd)
		}
	}
	return cmds
}

func (c *lmConfigComponent) maybeRetryModelFetch(presetID string) tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	warning := strings.TrimSpace(c.modelCatalogWarnings[presetID])
	if warning == "" {
		return nil
	}
	var preset *client.LMProviderPreset
	for i := range c.info.Presets {
		if c.info.Presets[i].ID == presetID {
			preset = &c.info.Presets[i]
			break
		}
	}
	if preset == nil || !lmConfigIsLocalLiveProvider(*preset) {
		return nil
	}
	if c.modelCatalogRetries[presetID] >= 3 {
		return nil
	}
	c.modelCatalogRetries[presetID]++
	return lmConfigRetryFetchModelsCmd(c.app.c, presetID, preset.APIBase, 2*time.Second)
}

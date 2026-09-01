package ui

// lm_config_catalog.go manages LM-config provider/model selection and preset syncing to the catalog.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *lmConfigComponent) providerIndexes() []int {
	if !c.open || c.info == nil {
		return nil
	}
	filter := strings.ToLower(strings.TrimSpace(c.providerFilter))
	indexes := make([]int, 0, len(c.info.Presets))
	for i, p := range c.info.Presets {
		if filter == "" ||
			strings.Contains(strings.ToLower(p.Label), filter) ||
			strings.Contains(strings.ToLower(p.ID), filter) ||
			strings.Contains(strings.ToLower(p.Provider), filter) {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func (c *lmConfigComponent) modelIndexes() []int {
	if !c.open {
		return nil
	}
	pid := c.currentPresetID()
	catalog := c.modelCatalogs[pid]
	filter := strings.ToLower(strings.TrimSpace(c.modelFilter))
	indexes := make([]int, 0, len(catalog))
	for i, m := range catalog {
		haystack := strings.ToLower(strings.TrimSpace(m.ID + " " + m.Name + " " + m.Description))
		if filter == "" || strings.Contains(haystack, filter) {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func (c *lmConfigComponent) selectFirstFiltered() {
	indexes := c.providerIndexes()
	if len(indexes) == 0 {
		return
	}
	for _, idx := range indexes {
		if idx == c.selected {
			return
		}
	}
	c.selected = indexes[0]
}

func (c *lmConfigComponent) selectFirstFilteredModel() {
	if !c.open {
		return
	}
	pid := c.currentPresetID()
	catalog := c.modelCatalogs[pid]
	indexes := c.modelIndexes()
	if len(indexes) == 0 {
		c.modelIndex = -1
		return
	}
	for _, idx := range indexes {
		if idx == c.modelIndex {
			c.model = catalog[idx].ID
			return
		}
	}
	idx := indexes[0]
	c.modelIndex = idx
	c.model = catalog[idx].ID
}

func (c *lmConfigComponent) selectDefaultPreset() {
	if !c.open || c.info == nil || len(c.info.Presets) == 0 {
		return
	}
	wantProvider := strings.TrimSpace(c.info.Provider)
	wantModel := strings.TrimSpace(c.info.Model)
	for i, p := range c.info.Presets {
		if wantProvider != "" && p.Provider == wantProvider {
			if wantModel == "" || p.SuggestedModel == wantModel || p.ID == wantProvider {
				c.selected = i
				return
			}
		}
	}
	for i, p := range c.info.Presets {
		if p.ID == "lm_studio" {
			c.selected = i
			return
		}
	}
	c.selected = 0
}

// syncFromPreset copies the selected preset's defaults into
// the editable model + apiKey fields. Returns a tea.Cmd that fetches
// the model catalog for the new preset's provider kind, OR nil if
// the catalog is already cached.
//
// Temperature / Max tokens / Thinking budget / parallel are intentionally
// LEFT BLANK so CLIO resolves its current defaults (temperature 0.0,
// max_tokens=0 context-aware default, thinking off, parallel=0).
func (c *lmConfigComponent) syncFromPreset() tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	if c.selected < 0 || c.selected >= len(c.info.Presets) {
		return nil
	}
	p := c.info.Presets[c.selected]
	// Always reset to this preset's suggested model on a preset
	// switch — otherwise stale values like "gpt-4o-mini" linger after
	// the user navigates from openai → argonne_metis. The user can
	// still type a custom id (which flips modelIndex to -1); the
	// modelCatalog-loaded handler then snaps back to the suggested
	// row when the catalog arrives.
	c.model = p.SuggestedModel
	c.apiBase = p.APIBase
	c.modelIndex = -1
	c.modelFilter = ""
	c.temperature = ""
	c.maxTokens = ""
	c.contextLength = ""
	c.thinkingBudget = ""
	c.parallel = ""
	currentAPIBase := strings.TrimRight(strings.TrimSpace(c.info.APIBase), "/")
	presetAPIBase := strings.TrimRight(strings.TrimSpace(p.APIBase), "/")
	samePreset := c.info.Provider == p.Provider &&
		(currentAPIBase == "" || presetAPIBase == "" || strings.EqualFold(currentAPIBase, presetAPIBase))
	if samePreset {
		if strings.TrimSpace(c.info.Model) != "" {
			c.model = c.info.Model
		}
		if strings.TrimSpace(c.info.APIBase) != "" {
			c.apiBase = c.info.APIBase
		}
		if c.info.Temperature != 0 {
			c.temperature = fmt.Sprintf("%.1f", c.info.Temperature)
		}
		if c.info.MaxTokens > 0 {
			c.maxTokens = fmt.Sprintf("%d", c.info.MaxTokens)
		}
		if c.info.ContextLength > 0 {
			c.contextLength = fmt.Sprintf("%d", c.info.ContextLength)
		}
		if c.info.ThinkingBudget > 0 {
			c.thinkingBudget = fmt.Sprintf("%d", c.info.ThinkingBudget)
		}
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
	c.lmConfigEnsureVisibleField()
	c.snapModelToCatalog(p)
	return c.queueModelFetch(p, c.apiBase)
}

func (c *lmConfigComponent) snapModelToCatalog(p client.LMProviderPreset) {
	if !c.open {
		return
	}
	if strings.TrimSpace(c.modelCatalogWarnings[p.ID]) != "" {
		return
	}
	catalog := c.modelCatalogs[p.ID]
	if len(catalog) == 0 {
		return
	}
	target := strings.TrimSpace(c.model)
	if target == "" {
		target = p.SuggestedModel
	}
	idx := 0
	for i, model := range catalog {
		if model.ID == target || model.ID == p.SuggestedModel {
			idx = i
			break
		}
	}
	c.modelIndex = idx
	c.model = catalog[idx].ID
}

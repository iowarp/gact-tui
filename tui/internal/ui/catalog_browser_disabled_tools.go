package ui

// catalog_browser_disabled_tools.go toggles and exposes the set of disabled tool IDs.

import "sort"

// toggleToolDisabled flips a tool id in/out of the catalog's disabledTools
// set and persists. Used by the catalog browser's space key.
func (c *catalogComponent) toggleToolDisabled(id string) {
	if c.disabledTools == nil {
		c.disabledTools = map[string]bool{}
	}
	if c.disabledTools[id] {
		delete(c.disabledTools, id)
	} else {
		c.disabledTools[id] = true
	}
	if c.app.SaveConfig != nil {
		_ = c.app.SaveConfig()
	}
}

// SetDisabledTools seeds the disabled-tools set from main on startup
// (LLL2). Called once after Load() before the program runs.
func (a *App) SetDisabledTools(ids []string) {
	a.catalog.disabledTools = make(map[string]bool, len(ids))
	for _, id := range ids {
		a.catalog.disabledTools[id] = true
	}
}

// GetDisabledTools returns the disabled-tools set as a sorted slice
// for config persistence (LLL2). Stable order keeps config diffs
// readable.
func (a *App) GetDisabledTools() []string {
	out := make([]string, 0, len(a.catalog.disabledTools))
	for id := range a.catalog.disabledTools {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

package ui

// sidebar_module_layout.go converts between module IDs and strings and exposes layout get/set APIs.

import "strings"

func sidebarModuleIDsFromStrings(ids []string) []sidebarModuleID {
	out := make([]sidebarModuleID, 0, len(ids))
	seen := make(map[sidebarModuleID]bool, len(ids))
	for _, raw := range ids {
		id := sidebarModuleID(strings.TrimSpace(raw))
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func sidebarModuleIDStrings(ids []sidebarModuleID) []string {
	if len(ids) == 0 {
		ids = defaultSidebarModuleIDs()
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if s := strings.TrimSpace(string(id)); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// SetModuleIDs applies a persisted, human-editable sidebar module
// ordering. Unknown module ids remain in the layout and render disabled.
func (c *sidebarComponent) SetModuleIDs(ids []string) {
	c.moduleIDs = sidebarModuleIDsFromStrings(ids)
	c.rightSidebarModuleIDs = nil
	c.layoutConfigured = len(ids) > 0
}

// SetLayout applies the persisted left/right module placement. Unknown
// module ids remain visible as disabled rows in the side they were configured.
func (c *sidebarComponent) SetLayout(left []string, right []string) {
	c.moduleIDs, c.rightSidebarModuleIDs = normalizeSidebarLayoutIDs(
		sidebarModuleIDsFromStrings(left),
		sidebarModuleIDsFromStrings(right),
	)
	c.layoutConfigured = true
}

// SetSidebarLayout forwards to the sidebar component. It stays on App as the
// public, cross-package config API (called by the preferences/config loader).
func (a *App) SetSidebarLayout(left []string, right []string) { a.sidebar.SetLayout(left, right) }

// SidebarLayoutIDs forwards to the sidebar component for the public config API.
func (a *App) SidebarLayoutIDs() (left []string, right []string) { return a.sidebar.LayoutIDs() }

// ModuleIDs returns the effective left-sidebar module order using
// stable config ids.
func (c *sidebarComponent) ModuleIDs() []string {
	if !c.layoutConfigured {
		return sidebarModuleIDStrings(defaultSidebarModuleIDs())
	}
	return sidebarModuleIDStringsNoDefault(c.moduleIDs)
}

// LayoutIDs returns the effective left/right sidebar module placement
// using stable config ids.
func (c *sidebarComponent) LayoutIDs() (left []string, right []string) {
	if !c.layoutConfigured {
		return sidebarModuleIDStrings(defaultSidebarModuleIDs()), nil
	}
	return sidebarModuleIDStringsNoDefault(c.moduleIDs), sidebarModuleIDStringsNoDefault(c.rightSidebarModuleIDs)
}

func (c *sidebarComponent) ModulePlacement(id string) string {
	moduleID := sidebarModuleID(strings.TrimSpace(id))
	left, right := c.effectiveLayoutIDs()
	for _, existing := range left {
		if existing == moduleID {
			return string(sidebarPlacementLeft)
		}
	}
	for _, existing := range right {
		if existing == moduleID {
			return string(sidebarPlacementRight)
		}
	}
	return "hidden"
}

func (c *sidebarComponent) SetModulePlacement(id string, placement string) {
	moduleID := sidebarModuleID(strings.TrimSpace(id))
	if moduleID == "" {
		return
	}
	left, right := c.effectiveLayoutIDs()
	left = removeSidebarModuleID(left, moduleID)
	right = removeSidebarModuleID(right, moduleID)
	switch sidebarPlacement(strings.TrimSpace(placement)) {
	case sidebarPlacementRight:
		right = append(right, moduleID)
	case sidebarPlacementLeft:
		left = append(left, moduleID)
	default:
		// Hidden: keep it out of both sidebars.
	}
	c.moduleIDs = left
	c.rightSidebarModuleIDs = right
	c.layoutConfigured = true
}

func normalizeSidebarLayoutIDs(left []sidebarModuleID, right []sidebarModuleID) ([]sidebarModuleID, []sidebarModuleID) {
	rightSeen := map[sidebarModuleID]bool{}
	normalizedRight := make([]sidebarModuleID, 0, len(right))
	for _, id := range right {
		if id == "" || rightSeen[id] {
			continue
		}
		rightSeen[id] = true
		normalizedRight = append(normalizedRight, id)
	}
	leftSeen := map[sidebarModuleID]bool{}
	normalizedLeft := make([]sidebarModuleID, 0, len(left))
	for _, id := range left {
		if id == "" || rightSeen[id] || leftSeen[id] {
			continue
		}
		leftSeen[id] = true
		normalizedLeft = append(normalizedLeft, id)
	}
	return normalizedLeft, normalizedRight
}

func (c *sidebarComponent) effectiveLayoutIDs() (left []sidebarModuleID, right []sidebarModuleID) {
	left = append([]sidebarModuleID(nil), c.moduleIDs...)
	if len(left) == 0 && !c.layoutConfigured {
		left = defaultSidebarModuleIDs()
	}
	right = append([]sidebarModuleID(nil), c.rightSidebarModuleIDs...)
	return left, right
}

func removeSidebarModuleID(ids []sidebarModuleID, remove sidebarModuleID) []sidebarModuleID {
	out := ids[:0]
	for _, id := range ids {
		if id != remove {
			out = append(out, id)
		}
	}
	return out
}

func sidebarModuleIDStringsNoDefault(ids []sidebarModuleID) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if s := strings.TrimSpace(string(id)); s != "" {
			out = append(out, s)
		}
	}
	return out
}

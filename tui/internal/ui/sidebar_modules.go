package ui

import (
	"strings"

	"charm.land/lipgloss/v2"
)

type sidebarModuleID string

const (
	sidebarModuleSessions sidebarModuleID = "sessions"
	sidebarModuleContext  sidebarModuleID = "context"
)

type sidebarPlacement string

const (
	sidebarPlacementLeft  sidebarPlacement = "left"
	sidebarPlacementRight sidebarPlacement = "right"
)

type sidebarModuleDefinition struct {
	ID               sidebarModuleID
	Section          sidebarSection
	Title            messageID
	DefaultPlacement sidebarPlacement
	PersistenceKey   string
}

type resolvedSidebarModule struct {
	Definition sidebarModuleDefinition
	Disabled   bool
	Reason     string
}

func sidebarModuleRegistry() map[sidebarModuleID]sidebarModuleDefinition {
	return map[sidebarModuleID]sidebarModuleDefinition{
		sidebarModuleSessions: {
			ID:               sidebarModuleSessions,
			Section:          sidebarSectionSessions,
			Title:            msgSidebarTitle,
			DefaultPlacement: sidebarPlacementLeft,
			PersistenceKey:   "sidebar.sessions",
		},
		sidebarModuleContext: {
			ID:               sidebarModuleContext,
			Section:          sidebarSectionContext,
			Title:            msgSidebarContext,
			DefaultPlacement: sidebarPlacementLeft,
			PersistenceKey:   "sidebar.context",
		},
	}
}

func defaultSidebarModuleIDs() []sidebarModuleID {
	return []sidebarModuleID{sidebarModuleSessions, sidebarModuleContext}
}

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

// SetSidebarModuleIDs applies a persisted, human-editable sidebar module
// ordering. Unknown module ids remain in the layout and render disabled.
func (a *App) SetSidebarModuleIDs(ids []string) {
	a.sidebarModuleIDs = sidebarModuleIDsFromStrings(ids)
	a.sidebarLayoutConfigured = len(ids) > 0
}

// SetSidebarLayout applies the persisted left/right module placement. Unknown
// module ids remain visible as disabled rows in the side they were configured.
func (a *App) SetSidebarLayout(left []string, right []string) {
	a.sidebarModuleIDs = sidebarModuleIDsFromStrings(left)
	a.rightSidebarModuleIDs = sidebarModuleIDsFromStrings(right)
	a.sidebarLayoutConfigured = true
}

// SidebarModuleIDs returns the effective left-sidebar module order using
// stable config ids.
func (a *App) SidebarModuleIDs() []string {
	if !a.sidebarLayoutConfigured {
		return sidebarModuleIDStrings(defaultSidebarModuleIDs())
	}
	return sidebarModuleIDStringsNoDefault(a.sidebarModuleIDs)
}

// SidebarLayoutIDs returns the effective left/right sidebar module placement
// using stable config ids.
func (a *App) SidebarLayoutIDs() (left []string, right []string) {
	if !a.sidebarLayoutConfigured {
		return sidebarModuleIDStrings(defaultSidebarModuleIDs()), nil
	}
	return sidebarModuleIDStringsNoDefault(a.sidebarModuleIDs), sidebarModuleIDStringsNoDefault(a.rightSidebarModuleIDs)
}

func (a *App) SidebarModulePlacement(id string) string {
	moduleID := sidebarModuleID(strings.TrimSpace(id))
	left, right := a.effectiveSidebarLayoutIDs()
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

func (a *App) SetSidebarModulePlacement(id string, placement string) {
	moduleID := sidebarModuleID(strings.TrimSpace(id))
	if moduleID == "" {
		return
	}
	left, right := a.effectiveSidebarLayoutIDs()
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
	a.sidebarModuleIDs = left
	a.rightSidebarModuleIDs = right
	a.sidebarLayoutConfigured = true
}

func (a *App) effectiveSidebarLayoutIDs() (left []sidebarModuleID, right []sidebarModuleID) {
	left = append([]sidebarModuleID(nil), a.sidebarModuleIDs...)
	if len(left) == 0 && !a.sidebarLayoutConfigured {
		left = defaultSidebarModuleIDs()
	}
	right = append([]sidebarModuleID(nil), a.rightSidebarModuleIDs...)
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

func resolveSidebarModules(ids []sidebarModuleID, registry map[sidebarModuleID]sidebarModuleDefinition) []resolvedSidebarModule {
	if len(ids) == 0 {
		ids = defaultSidebarModuleIDs()
	}
	out := make([]resolvedSidebarModule, 0, len(ids))
	for _, id := range ids {
		if def, ok := registry[id]; ok {
			out = append(out, resolvedSidebarModule{Definition: def})
			continue
		}
		out = append(out, resolvedSidebarModule{
			Definition: sidebarModuleDefinition{
				ID:               id,
				DefaultPlacement: sidebarPlacementLeft,
				PersistenceKey:   "sidebar." + string(id),
			},
			Disabled: true,
			Reason:   "unknown module",
		})
	}
	return out
}

func (a *App) sidebarModules() []resolvedSidebarModule {
	left, _ := a.effectiveSidebarLayoutIDs()
	if len(left) == 0 && a.sidebarLayoutConfigured {
		return nil
	}
	return a.sidebarModulesForIDs(left)
}

func (a *App) rightSidebarModules() []resolvedSidebarModule {
	if len(a.rightSidebarModuleIDs) == 0 {
		return nil
	}
	return a.sidebarModulesForIDs(a.rightSidebarModuleIDs)
}

func (a *App) sidebarModulesForIDs(ids []sidebarModuleID) []resolvedSidebarModule {
	modules := resolveSidebarModules(ids, sidebarModuleRegistry())
	out := modules[:0]
	for _, module := range modules {
		if module.Definition.ID == sidebarModuleContext && !a.hasContextSection() {
			continue
		}
		out = append(out, module)
	}
	return out
}

func sidebarModulesHaveEnabled(modules []resolvedSidebarModule, id sidebarModuleID) bool {
	for _, module := range modules {
		if module.Definition.ID == id && !module.Disabled {
			return true
		}
	}
	return false
}

func sidebarDisabledModulesFrom(modules []resolvedSidebarModule) []resolvedSidebarModule {
	out := make([]resolvedSidebarModule, 0, len(modules))
	for _, module := range modules {
		if module.Disabled {
			out = append(out, module)
		}
	}
	return out
}

func (a *App) sidebarHasEnabledModule(id sidebarModuleID) bool {
	return sidebarModulesHaveEnabled(a.sidebarModules(), id)
}

func (a *App) sidebarDisabledModules() []resolvedSidebarModule {
	return sidebarDisabledModulesFrom(a.sidebarModules())
}

func (a *App) sidebarModuleTitle(id sidebarModuleID) string {
	if def, ok := sidebarModuleRegistry()[id]; ok && def.Title != "" {
		return a.localizer.t(def.Title, nil)
	}
	return string(id)
}

func (a *App) renderDisabledSidebarModule(module resolvedSidebarModule, width int) []string {
	t := a.Theme
	title := strings.TrimSpace(string(module.Definition.ID))
	if title == "" {
		title = "unknown"
	}
	reason := strings.TrimSpace(module.Reason)
	if reason == "" {
		reason = "unavailable"
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	return []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.FgMuted).Render("▸ " + truncate(title, contentW-2)),
		"  " + t.HintLabel.Italic(true).Render(truncate(reason, contentW-2)),
	}
}

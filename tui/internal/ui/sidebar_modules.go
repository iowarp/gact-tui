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
	modules := resolveSidebarModules(a.sidebarModuleIDs, sidebarModuleRegistry())
	out := modules[:0]
	for _, module := range modules {
		if module.Definition.ID == sidebarModuleContext && !a.hasContextSection() {
			continue
		}
		out = append(out, module)
	}
	return out
}

func (a *App) sidebarHasEnabledModule(id sidebarModuleID) bool {
	for _, module := range a.sidebarModules() {
		if module.Definition.ID == id && !module.Disabled {
			return true
		}
	}
	return false
}

func (a *App) sidebarDisabledModules() []resolvedSidebarModule {
	modules := a.sidebarModules()
	out := make([]resolvedSidebarModule, 0, len(modules))
	for _, module := range modules {
		if module.Disabled {
			out = append(out, module)
		}
	}
	return out
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

package ui

// sidebar_modules.go defines the sidebar module registry and resolves module IDs into placed modules.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

type sidebarModuleID string

const (
	sidebarModuleSessions sidebarModuleID = "sessions"
	sidebarModuleAgents   sidebarModuleID = "agents"
	sidebarModuleFiles    sidebarModuleID = "files"
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
		sidebarModuleAgents: {
			ID:               sidebarModuleAgents,
			Section:          sidebarSectionAgents,
			Title:            msgSidebarAgents,
			DefaultPlacement: sidebarPlacementLeft,
			PersistenceKey:   "sidebar.agents",
		},
		sidebarModuleFiles: {
			ID:               sidebarModuleFiles,
			Section:          sidebarSectionFiles,
			Title:            msgSidebarFiles,
			DefaultPlacement: sidebarPlacementLeft,
			PersistenceKey:   "sidebar.files",
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

func sidebarModuleRegistryOrder() []sidebarModuleID {
	return []sidebarModuleID{
		sidebarModuleSessions,
		sidebarModuleContext,
		sidebarModuleAgents,
		sidebarModuleFiles,
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

func (c *sidebarComponent) modules() []resolvedSidebarModule {
	left, _ := c.effectiveLayoutIDs()
	if len(left) == 0 && c.layoutConfigured {
		return nil
	}
	return c.modulesForIDs(left)
}

func (c *sidebarComponent) rightModules() []resolvedSidebarModule {
	if len(c.rightSidebarModuleIDs) == 0 {
		return nil
	}
	return c.modulesForIDs(c.rightSidebarModuleIDs)
}

func (c *sidebarComponent) modulesForIDs(ids []sidebarModuleID) []resolvedSidebarModule {
	modules := resolveSidebarModules(ids, sidebarModuleRegistry())
	out := modules[:0]
	for _, module := range modules {
		if module.Definition.ID == sidebarModuleContext && !c.hasContextSection() {
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

func (c *sidebarComponent) hasEnabledModule(id sidebarModuleID) bool {
	return sidebarModulesHaveEnabled(c.modules(), id)
}

func (c *sidebarComponent) disabledModules() []resolvedSidebarModule {
	return sidebarDisabledModulesFrom(c.modules())
}

func (c *sidebarComponent) moduleTitle(id sidebarModuleID) string {
	if def, ok := sidebarModuleRegistry()[id]; ok && def.Title != "" {
		return c.app.localizer.t(def.Title, nil)
	}
	return string(id)
}

func (c *sidebarComponent) renderDisabledModule(module resolvedSidebarModule, width int) []string {
	t := c.app.Theme
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
		lipgloss.NewStyle().Bold(true).Foreground(t.FgMuted).Render("▸ " + textutil.Truncate(title, contentW-2)),
		"  " + t.HintLabel.Italic(true).Render(textutil.Truncate(reason, contentW-2)),
	}
}

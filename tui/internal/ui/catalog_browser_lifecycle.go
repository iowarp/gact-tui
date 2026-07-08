package ui

// catalog_browser_lifecycle.go opens/closes catalog sub-views (detail/source/kind) and handles wheel scrolling.

import (
	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *catalogComponent) openExpertPackDetail(packID, packTitle string) tea.Cmd {
	parent := c.current
	title := valuefmt.FirstNonEmpty(packTitle, packID)
	c.current = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · " + title,
		loading:      true,
		expertPackID: packID,
		parent:       parent,
	}
	return loadExpertPackDetailCmd(c.app.c, c.app.session.runtimeScope(), packID)
}

func (c *catalogComponent) openBlueprintDetail(blueprintID, blueprintTitle string) tea.Cmd {
	parent := c.current
	title := valuefmt.FirstNonEmpty(blueprintTitle, blueprintID)
	c.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · " + title,
		loading:     true,
		blueprintID: blueprintID,
		parent:      parent,
	}
	return loadAgentBlueprintDetailCmd(c.app.c, c.app.session.runtimeScope(), blueprintID)
}

func (c *catalogComponent) openSourceBrowser() tea.Cmd {
	parent := c.current
	c.current = &catalogBrowserState{
		kind:    catalogKindAgentBlueprintSources,
		title:   "Marketplace sources",
		loading: true,
		parent:  parent,
	}
	return loadCatalogBrowserCmd(c.app.c, catalogKindAgentBlueprintSources, c.app.session.runtimeScope())
}

func (c *catalogComponent) openPromptDetail(promptID, promptTitle string) tea.Cmd {
	parent := c.current
	title := stripPromptRowPrefix(valuefmt.FirstNonEmpty(promptTitle, promptID))
	c.current = &catalogBrowserState{
		kind:     catalogKindPromptDetail,
		title:    "Prompt · " + title,
		loading:  true,
		promptID: promptID,
		parent:   parent,
	}
	return loadPromptDetailCmd(c.app.c, promptID, c.app.session.runtimeScope())
}

// openKind pops the modal for a given kind and starts the
// fetch. Skill list is synthetic (see cmd above) so it returns an
// immediate result instead of a round-trip.
func (c *catalogComponent) openKind(kind catalogBrowserKind) tea.Cmd {
	c.open = true
	c.current = &catalogBrowserState{
		kind:    kind,
		title:   catalogBrowserTitle(kind),
		loading: true,
	}
	return loadCatalogBrowserCmd(c.app.c, kind, c.app.session.runtimeScope())
}

func (c *catalogComponent) openAgentDetail(agentID, agentTitle string) tea.Cmd {
	// Own the open flag internally (like openKind) so callers from outside the
	// catalog — e.g. the sidebar agent rail — don't have to flip c.open first.
	// In-catalog callers already have open=true, so this is idempotent for them.
	c.open = true
	parent := c.current
	title := agentTitle
	if title == "" {
		title = agentID
	}
	c.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Expert · " + stripAgentHierarchyRolePrefix(title),
		loading: true,
		agentID: agentID,
		parent:  parent,
	}
	return loadAgentDetailCmd(c.app.c, agentID, c.app.session.runtimeScope())
}

func catalogBrowserTitle(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindMcp:
		return "MCP Connections"
	case catalogKindTools:
		return "Tools & MCP"
	case catalogKindSkills:
		return "Skills"
	case catalogKindMcpDetail:
		return "MCP detail"
	case catalogKindAgentDetail:
		return "Agent detail"
	case catalogKindAgents:
		return "Experts"
	case catalogKindPrompts:
		return "Prompts"
	case catalogKindPromptDetail:
		return "Prompt detail"
	case catalogKindExpertPacks:
		return "Expert Packs"
	case catalogKindExpertPackDetail:
		return "Expert Pack detail"
	case catalogKindAgentBlueprints:
		return "Agent Blueprints"
	case catalogKindAgentBlueprintDetail:
		return "Agent Blueprint detail"
	case catalogKindAgentBlueprintSources:
		return "Marketplace sources"
	}
	return "Catalog"
}

func catalogBrowserCanPop(kind catalogBrowserKind) bool {
	return kind == catalogKindMcpDetail ||
		kind == catalogKindAgentDetail ||
		kind == catalogKindPromptDetail ||
		kind == catalogKindExpertPackDetail ||
		kind == catalogKindAgentBlueprintDetail ||
		kind == catalogKindAgentBlueprintSources
}

// navigateToParent pops the catalog browser up one level to the parent state.
// The seam for navigation callers (back button, esc/backspace keys) that
// previously assigned catalog.current directly; no-op at the root.
func (c *catalogComponent) navigateToParent() {
	if c.current != nil && c.current.parent != nil {
		c.current = c.current.parent
	}
}

// close drops modal state.
func (c *catalogComponent) close() {
	c.open = false
	c.current = nil
}

func (c *catalogComponent) handleWheel(button tea.MouseButton) tea.Cmd {
	if c.current == nil {
		return nil
	}
	cb := c.current
	delta := mouseWheelDelta(button)
	if delta == 0 {
		cb.sel = moveSelectionByWheel(cb.sel, len(cb.items), button)
		cb.offset = catalogBrowserClampOffsetForKind(cb.kind, cb.sel, cb.offset, len(cb.items))
		c.cancelPendingDeletesOutsideSelection()
		return nil
	}
	catalogBrowserMoveSelection(cb, delta)
	c.cancelPendingDeletesOutsideSelection()
	return nil
}

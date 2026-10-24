package ui

// catalog_browser_lifecycle.go opens/closes catalog sub-views (detail/source/kind) and handles wheel scrolling.

import (
	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

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

// openAgentDetail shows an agent's catalog summary. Agent definitions are
// composed from plugins on the backend; the catalog row carries what the
// list endpoint reports.
func (c *catalogComponent) openAgentDetail(agentID, agentTitle string) tea.Cmd {
	title := valuefmt.FirstNonEmpty(stripAgentHierarchyRolePrefix(agentTitle), agentID)
	c.openDetail(title, "Agent "+agentID)
	return nil
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
	case catalogKindAgents:
		return "Experts"
	case catalogKindPrompts:
		return "Prompts"
	case catalogKindPromptDetail:
		return "Prompt detail"
	}
	return "Catalog"
}

func catalogBrowserCanPop(kind catalogBrowserKind) bool {
	return kind == catalogKindMcpDetail ||
		kind == catalogKindPromptDetail
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
		return nil
	}
	catalogBrowserMoveSelection(cb, delta)
	return nil
}

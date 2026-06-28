// Catalog-browser modal (L5). Used by the /mcp, /tools, /experts, and
// /skills slash commands to open a scoped list of items from the
// corresponding catalog endpoint. /experts shows a browseable
// hierarchy; Settings > Agent remains the narrow session-agent picker.
package ui

// catalog_browser.go declares the catalog-browser kinds, state, item type, and the loaded-message handler.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

// catalogBrowserKind identifies which slash command spawned the modal —
// also drives the fetch path and item rendering.
type catalogBrowserKind int

const (
	catalogKindMcp catalogBrowserKind = iota
	catalogKindTools
	catalogKindSkills
	// catalogKindMcpDetail shows one MCP server's tools+resources+prompts
	// in a single list. Pushed on Enter from the MCP server list (LLL2).
	catalogKindMcpDetail
	catalogKindAgentDetail
	// catalogKindAgents lists all agents from /v1/agents. Distinct from
	// the Settings > Agent picker which is for selecting; this one is
	// for browsing. LLL3.
	catalogKindAgents
	catalogKindPrompts
	catalogKindPromptDetail
	catalogKindExpertPacks
	catalogKindExpertPackDetail
	catalogKindAgentBlueprints
	catalogKindAgentBlueprintDetail
	catalogKindAgentBlueprintSources
)

// catalogBrowserState holds the runtime for the list modal.
type catalogBrowserState struct {
	kind    catalogBrowserKind
	title   string
	items   []catalogItem
	loading bool
	errText string
	sel     int
	offset  int
	// LLL2: when kind=catalogKindMcpDetail, mcpServerID identifies
	// which server's catalog we're viewing. parent is preserved so
	// Esc/Backspace can pop back to the server list rather than
	// closing the whole modal.
	mcpServerID               string
	agentID                   string
	promptID                  string
	promptProfile             string
	expertPackID              string
	pendingDeleteExpertPackID string
	blueprintID               string
	sourceID                  string
	pendingDeleteAgentID      string
	pendingDeleteBlueprintID  string
	pendingDeleteSourceID     string
	parent                    *catalogBrowserState
}

// catalogItem is the common shape we flatten each backend response into
// for uniform rendering. Backends return typed structs; we translate on
// the loaded message to keep viewCatalogBrowser kind-agnostic.
type catalogItem struct {
	id         string
	title      string
	desc       string
	inlineDesc string
	statusTag  string // e.g. "connected" / "disconnected" for MCP
	disabled   bool
}

// catalogBrowserLoadedMsg delivers the fetch result.
type catalogBrowserLoadedMsg struct {
	kind    catalogBrowserKind
	items   []catalogItem
	errText string
	// mcpServerID echoes the server context for catalogKindMcpDetail
	// loads — protects against late-arriving messages overwriting a
	// browser the user has since navigated back from.
	mcpServerID   string
	promptID      string
	promptProfile string
	expertPackID  string
	blueprintID   string
	sourceID      string
}

func (c *catalogComponent) applyCapabilityGates(kind catalogBrowserKind, items []catalogItem) []catalogItem {
	out := append([]catalogItem(nil), items...)
	for i := range out {
		switch {
		case kind == catalogKindAgentDetail && strings.HasPrefix(out[i].id, "agent-action/"):
			out[i].disabled = !c.app.session.caps.Capabilities.AgentWrite
			if out[i].disabled {
				out[i].desc = "backend does not advertise agent_write"
			}
		}
	}
	return out
}

func (c *catalogComponent) handleLoaded(m catalogBrowserLoadedMsg) (tea.Model, tea.Cmd) {
	if c.current == nil || c.current.kind != m.kind {
		return c.app, nil
	}
	// Late-arriving detail loads must match the entity currently being
	// viewed, otherwise a fast back-out + forward-in can overwrite with
	// stale data.
	if m.kind == catalogKindMcpDetail && m.mcpServerID != c.current.mcpServerID {
		return c.app, nil
	}
	if m.kind == catalogKindAgentDetail && m.mcpServerID != c.current.agentID {
		return c.app, nil
	}
	if m.kind == catalogKindPromptDetail && m.promptID != c.current.promptID {
		return c.app, nil
	}
	if m.kind == catalogKindExpertPackDetail && m.expertPackID != c.current.expertPackID {
		return c.app, nil
	}
	if m.kind == catalogKindAgentBlueprintDetail && m.blueprintID != c.current.blueprintID {
		return c.app, nil
	}
	items := c.applyCapabilityGates(m.kind, m.items)
	switch m.kind {
	case catalogKindAgentBlueprints:
		items = markActiveAgentBlueprintCatalogItems(items, c.app.agent.activeAgentBlueprintID(), c.app.agent.activeAgentBlueprintScope())
	case catalogKindAgentBlueprintDetail:
		items = markActiveAgentBlueprintDetailItems(items, c.current.blueprintID, c.app.agent.activeAgentBlueprintID(), c.app.agent.activeAgentBlueprintScope())
	}
	c.current.loading = false
	c.current.items = items
	c.current.errText = m.errText
	if m.kind == catalogKindPromptDetail && m.promptProfile != "" {
		c.current.promptProfile = m.promptProfile
	}
	if c.current.sel >= len(c.current.items) {
		c.current.sel = 0
	}
	c.current.offset = catalogBrowserClampOffsetForKind(
		c.current.kind,
		c.current.sel,
		c.current.offset,
		len(c.current.items),
	)
	return c.app, nil
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func (c *agentComponent) openAgentCreateFromCatalog() tea.Cmd {
	if !c.app.session.caps.Capabilities.AgentWrite {
		c.app.setHint("create agent unavailable: backend does not advertise agent_write")
		return scheduleHintExpire(c.app.transientHint)
	}
	c.app.agentWrite.openModal(agentWriteModeCreate, "", "new-agent")
	return nil
}

func (c *agentComponent) openAgentExtractFromCatalog() tea.Cmd {
	if !c.app.session.caps.Capabilities.SkillsExtraction {
		c.app.setHint("extract agent unavailable: backend does not advertise skills_extraction")
		return scheduleHintExpire(c.app.transientHint)
	}
	sessionID := c.app.session.currentID()
	if sessionID == "" {
		c.app.setHint("select a session before extracting an agent")
		return scheduleHintExpire(c.app.transientHint)
	}
	seed := "extracted-" + strings.TrimPrefix(sessionID, "sess_")
	c.app.agentWrite.openModal(agentWriteModeExtract, "", seed)
	return nil
}

// catalogCommandForID maps a slash-command ID into a browser kind.
// Returns (_, false) for commands that don't open a browser so the
// caller can fall through to the normal RunCommand dispatch.
func catalogCommandForID(id string) (catalogBrowserKind, bool) {
	switch strings.ToLower(id) {
	case "/mcp":
		return catalogKindMcp, true
	case "/tools":
		return catalogKindTools, true
	case "/skills":
		return catalogKindSkills, true
	case "/experts", "/agents-list":
		// Distinct from /agents which still routes to Settings (richer
		// picker). /agents-list remains a compatibility alias for the
		// operator-facing /experts catalog route.
		return catalogKindAgents, true
	case "/prompts":
		return catalogKindPrompts, true
	case "/expert-packs", "/expertpacks":
		return catalogKindExpertPacks, true
	case "/agent-blueprints", "/blueprints":
		return catalogKindAgentBlueprints, true
	}
	return 0, false
}

// catalogComponent is a modal (despite the "Component" suffix): the open bool
// is its show/hide flag, and it is opened/closed like the *Modal types. Renaming
// the type would be high-churn, so the modal nature is documented here instead.
//
// catalogComponent owns the catalog-browser modal: its open flag, the current
// browser node (current, a *catalogBrowserState that forms a parent stack for
// drill-down detail views), the disabled-tools filter set, and a back-reference
// to the root App for shared services. It replaces the old appCatalogState
// (catalogBrowserOpen bool + catalogBrowser *catalogBrowserState +
// disabledTools map) — open==false with current==nil is the closed state.
type catalogComponent struct {
	app *App

	open    bool
	current *catalogBrowserState

	disabledTools map[string]bool
}

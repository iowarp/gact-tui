// Catalog-browser modal (L5). Used by the /mcp, /tools, /agents, and
// /skills slash commands to open a scoped list of items from the
// corresponding catalog endpoint. /agents-list shows a browseable
// hierarchy; Settings > Agent remains the narrow session-agent picker.
package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
	mcpServerID string
	agentID     string
	parent      *catalogBrowserState
}

// catalogItem is the common shape we flatten each backend response into
// for uniform rendering. Backends return typed structs; we translate on
// the loaded message to keep viewCatalogBrowser kind-agnostic.
type catalogItem struct {
	id        string
	title     string
	desc      string
	statusTag string // e.g. "connected" / "disconnected" for MCP
}

// catalogBrowserLoadedMsg delivers the fetch result.
type catalogBrowserLoadedMsg struct {
	kind    catalogBrowserKind
	items   []catalogItem
	errText string
	// mcpServerID echoes the server context for catalogKindMcpDetail
	// loads — protects against late-arriving messages overwriting a
	// browser the user has since navigated back from.
	mcpServerID string
}

type catalogDetailLoadedMsg struct {
	title      string
	text       string
	err        error
	standalone bool
}

func loadToolDetailCmd(c *client.Client, toolID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		tool, err := c.GetTool(ctx, toolID)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Tool · " + toolID, err: err}
		}
		agents, _ := c.ListAgents(ctx)
		return catalogDetailLoadedMsg{
			title: "Tool · " + firstNonEmpty(tool.Title, tool.Name, tool.ID),
			text:  formatToolDetailWithAgents(tool, agents),
		}
	}
}

func loadMcpResourceDetailCmd(c *client.Client, serverID, uri, title string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		contents, err := c.McpResourceRead(ctx, serverID, uri)
		if err != nil {
			return catalogDetailLoadedMsg{title: firstNonEmpty(title, uri), err: err}
		}
		return catalogDetailLoadedMsg{
			title: firstNonEmpty(title, uri),
			text:  formatMcpResourceContents(contents),
		}
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// loadCatalogBrowserCmd dispatches the right fetch based on kind.
func loadCatalogBrowserCmd(c *client.Client, kind catalogBrowserKind) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		switch kind {
		case catalogKindMcp:
			servers, err := c.ListMcpServers(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := make([]catalogItem, 0, len(servers))
			for _, s := range servers {
				// McpServer.Status covers connecting|ready|error|
				// disconnected. Simplify to connected vs not for the
				// modal's status tag so the glance interpretation is
				// unambiguous.
				status := "disconnected"
				if s.Status == "ready" || s.Status == "connected" {
					status = "connected"
				}
				// Title already shows the server name; description is just
				// the transport so each row reads as a single line plus a
				// muted transport hint (was repeating the name twice).
				items = append(items, catalogItem{
					id: s.ID, title: s.Name, desc: s.Transport, statusTag: status,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindTools:
			// HHHHH1: unified view. /v1/tools already returns tools
			// from every source (built-in + each MCP server), but the
			// previous loader hid that — the user said "tools and mcps
			// were meant to be the same menu, not a separation". Now
			// each row is tagged with its source ("builtin", "mcp",
			// "recipe", "extension"); MCP-sourced tools also carry
			// the server id in the description so it's clear which
			// MCP exposes them. Sort by (source, name) so MCP tools
			// cluster together but the row stays scannable.
			tools, err := c.ListTools(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			sort.SliceStable(tools, func(i, j int) bool {
				if tools[i].Source != tools[j].Source {
					return tools[i].Source < tools[j].Source
				}
				return tools[i].Name < tools[j].Name
			})
			items := make([]catalogItem, 0, len(tools))
			for _, tl := range tools {
				src := tl.Source
				if src == "" {
					src = "builtin"
				}
				status := src
				if tl.ServerID != "" {
					status = tl.ServerID
				}
				items = append(items, catalogItem{
					id: tl.Name, title: tl.Name, desc: toolCatalogDescription(tl), statusTag: status,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindAgents, catalogKindSkills:
			// Per SPEC §6.5 line 807: skills *are* agents with
			// source="skill" — no dedicated namespace. Both verbs
			// hit /v1/agents; skills filter to source=skill, agents
			// shows everything.
			agents, err := c.ListAgents(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := agentCatalogItems(agents, kind)
			if len(items) == 0 && kind == catalogKindSkills {
				items = append(items, catalogItem{
					id:    "none",
					title: "(no skills on this backend)",
					desc:  "skills are agents with source=skill",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		}
		return catalogBrowserLoadedMsg{kind: kind, errText: "unknown catalog kind"}
	}
}

// openCatalogBrowser pops the modal for a given kind and starts the
// fetch. Skill list is synthetic (see cmd above) so it returns an
// immediate result instead of a round-trip.
func (a *App) openCatalogBrowser(kind catalogBrowserKind) tea.Cmd {
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    kind,
		title:   catalogBrowserTitle(kind),
		loading: true,
	}
	return loadCatalogBrowserCmd(a.c, kind)
}

// openMcpDetail pushes a new browser state showing one server's
// tools+resources+prompts. Called on Enter from the MCP server list
// (LLL2). Preserves the parent so backspace/esc can pop back.
func (a *App) openMcpDetail(serverID, serverName string) tea.Cmd {
	parent := a.catalogBrowser
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · " + serverName,
		loading:     true,
		mcpServerID: serverID,
		parent:      parent,
	}
	return loadMcpDetailCmd(a.c, serverID)
}

func (a *App) openAgentDetail(agentID, agentTitle string) tea.Cmd {
	parent := a.catalogBrowser
	title := agentTitle
	if title == "" {
		title = agentID
	}
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · " + title,
		loading: true,
		agentID: agentID,
		parent:  parent,
	}
	return loadAgentDetailCmd(a.c, agentID)
}

// loadMcpDetailCmd fetches tools, resources, and prompts for one MCP
// server in parallel and merges them into a single list with type
// prefixes (`[tool]` / `[res]` / `[prompt]`). Failures per slice are
// surfaced inline rather than aborting — partial data is still useful.
func loadMcpDetailCmd(c *client.Client, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var items []catalogItem
		var errs []string
		agents, _ := c.ListAgents(ctx)

		if tools, err := c.McpServerTools(ctx, serverID); err != nil {
			errs = append(errs, "tools: "+err.Error())
		} else {
			for _, t := range tools {
				toolID := firstNonEmpty(t.ID, t.Name)
				desc := toolSummary(t)
				if desc == "" {
					desc = t.Description
				}
				if owners := owningAgentsForTool(t, agents); len(owners) > 0 {
					if desc != "" {
						desc += " · "
					}
					desc += "agents: " + strings.Join(owners, ", ")
				}
				items = append(items, catalogItem{
					id: "tool/" + toolID, title: "[tool] " + firstNonEmpty(t.Name, toolID), desc: desc,
				})
			}
		}
		if rs, err := c.McpServerResources(ctx, serverID); err != nil {
			errs = append(errs, "resources: "+err.Error())
		} else {
			for _, r := range rs {
				name := r.Name
				if name == "" {
					name = r.URI
				}
				desc := r.Description
				if desc == "" {
					desc = r.URI
				}
				items = append(items, catalogItem{
					id: "res/" + r.URI, title: "[res] " + name, desc: desc,
				})
			}
		}
		if ps, err := c.McpServerPrompts(ctx, serverID); err != nil {
			errs = append(errs, "prompts: "+err.Error())
		} else {
			for _, p := range ps {
				items = append(items, catalogItem{
					id: "prompt/" + p.Name, title: "[prompt] " + p.Name, desc: p.Description,
				})
			}
		}
		errText := ""
		if len(errs) > 0 {
			errText = strings.Join(errs, "; ")
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindMcpDetail, items: items,
			errText: errText, mcpServerID: serverID,
		}
	}
}

func loadAgentDetailCmd(c *client.Client, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.GetAgent(ctx, agentID)
		if err != nil {
			return catalogBrowserLoadedMsg{
				kind: catalogKindAgentDetail, errText: err.Error(), mcpServerID: agentID,
			}
		}
		allAgents, _ := c.ListAgents(ctx)
		allTools, _ := c.ListTools(ctx)
		visibleTools := toolsForAgent(agent, allTools)
		items := []catalogItem{{
			id:        "agent/" + agent.ID,
			title:     "Agent · " + agent.Title,
			desc:      agent.Description,
			statusTag: agent.Source,
		}}
		if parent := agentParentID(agent); parent != "" {
			items = append(items, catalogItem{
				id: "agent/" + parent, title: "Parent agent · " + agentTitleByID(allAgents, parent),
			})
		}
		for _, child := range childAgentsOf(allAgents, agent.ID) {
			items = append(items, catalogItem{
				id: "agent/" + child.ID, title: "Child agent · " + firstNonEmpty(child.Title, child.ID), desc: child.Description, statusTag: child.Source,
			})
		}
		if agent.Specialization != "" {
			items = append(items, catalogItem{
				id: "specialization", title: "Specialization · " + agent.Specialization,
			})
		}
		items = append(items, catalogItem{
			id: "model", title: "Default model", desc: agentModelText(agent),
		})
		if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
			items = append(items, catalogItem{
				id: "routes", title: "Routes to", desc: strings.Join(routes, ", "),
			})
		}
		if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
			items = append(items, catalogItem{
				id: "delegates", title: "Delegates to", desc: strings.Join(delegates, ", "),
			})
		}
		if len(agent.Keywords) > 0 {
			items = append(items, catalogItem{
				id: "keywords", title: "Routing keywords", desc: strings.Join(agent.Keywords, ", "),
			})
		}
		if len(visibleTools) == 0 {
			items = append(items, catalogItem{id: "tools/none", title: "Tools · none declared"})
		} else {
			for _, tool := range visibleTools {
				toolID := firstNonEmpty(tool.ID, tool.Name)
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Tool · " + firstNonEmpty(tool.Name, toolID),
					desc:      toolSummary(tool),
					statusTag: tool.Owner,
				})
			}
			for _, server := range mcpServersForTools(visibleTools) {
				items = append(items, catalogItem{
					id:    "mcpserver/" + server,
					title: "MCP server · " + server,
					desc:  "source server for visible tools",
				})
			}
		}
		if agent.SystemPrompt != "" {
			items = append(items, catalogItem{id: "prompt", title: "Prompt", desc: agent.SystemPrompt})
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindAgentDetail, items: items, mcpServerID: agentID,
		}
	}
}

func catalogBrowserTitle(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindMcp:
		return "MCP servers"
	case catalogKindTools:
		return "Tools (built-in + MCP)"
	case catalogKindSkills:
		return "Skills"
	case catalogKindMcpDetail:
		return "MCP detail"
	case catalogKindAgentDetail:
		return "Agent detail"
	case catalogKindAgents:
		return "Agents"
	}
	return "Catalog"
}

// closeCatalogBrowser drops modal state.
func (a *App) closeCatalogBrowser() {
	a.catalogBrowserOpen = false
	a.catalogBrowser = nil
}

func (a *App) handleCatalogBrowserWheel(button tea.MouseButton) tea.Cmd {
	if a.catalogBrowser == nil {
		return nil
	}
	cb := a.catalogBrowser
	cb.sel = moveSelectionByWheel(cb.sel, len(cb.items), button)
	cb.offset = catalogBrowserClampOffset(cb.sel, cb.offset, len(cb.items))
	return nil
}

// handleCatalogBrowserKey handles keypresses while the modal is open.
// Up/down navigates, Esc closes (or pops MCP-detail back to parent),
// Enter on an MCP server row drills in, Space toggles a tool's
// enabled state (LLL2).
func (a *App) handleCatalogBrowserKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.catalogBrowser == nil {
		a.closeCatalogBrowser()
		return a, nil
	}
	cb := a.catalogBrowser
	switch k.String() {
	case "esc", "ctrl+c":
		// LLL2: in MCP detail, esc pops back to parent server list
		// rather than closing the whole modal — gives back-out
		// affordance without juggling separate keys.
		if (cb.kind == catalogKindMcpDetail || cb.kind == catalogKindAgentDetail) && cb.parent != nil {
			a.catalogBrowser = cb.parent
			return a, nil
		}
		a.closeCatalogBrowser()
	case "backspace":
		if (cb.kind == catalogKindMcpDetail || cb.kind == catalogKindAgentDetail) && cb.parent != nil {
			a.catalogBrowser = cb.parent
		}
	case "enter":
		// Drill into an MCP server when selected.
		if cb.kind == catalogKindMcp && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			return a, a.openMcpDetail(it.id, it.title)
		}
		if (cb.kind == catalogKindAgents || cb.kind == catalogKindSkills) && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.id == "none" {
				return a, nil
			}
			return a, a.openAgentDetail(it.id, it.title)
		}
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			return a, loadToolDetailCmd(a.c, it.id)
		}
		if cb.kind == catalogKindMcpDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			switch {
			case strings.HasPrefix(it.id, "tool/"):
				return a, loadToolDetailCmd(a.c, strings.TrimPrefix(it.id, "tool/"))
			case strings.HasPrefix(it.id, "res/"):
				uri := strings.TrimPrefix(it.id, "res/")
				return a, loadMcpResourceDetailCmd(a.c, cb.mcpServerID, uri, it.title)
			default:
				text := strings.TrimSpace(it.desc)
				if text == "" {
					text = it.title
				}
				a.openCatalogDetail(it.title, text)
				return a, nil
			}
		}
		if cb.kind == catalogKindAgentDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "agent/") {
				return a, a.openAgentDetail(strings.TrimPrefix(it.id, "agent/"), it.title)
			}
			if strings.HasPrefix(it.id, "tool/") {
				return a, loadToolDetailCmd(a.c, strings.TrimPrefix(it.id, "tool/"))
			}
			if strings.HasPrefix(it.id, "mcpserver/") {
				serverID := strings.TrimPrefix(it.id, "mcpserver/")
				return a, a.openMcpDetail(serverID, it.title)
			}
			text := strings.TrimSpace(it.desc)
			if text == "" {
				text = it.title
			}
			a.openCatalogDetail(it.title, text)
			return a, nil
		}
		// Other kinds: enter still closes (back-compat).
		a.closeCatalogBrowser()
	case " ", "space":
		// LLL2: toggle disabled state on a tool row. Persists to
		// config.json so the choice survives restart. Pure TUI
		// filter for now — backends that respect an allowed_tools
		// list could honour this on session create.
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			id := cb.items[cb.sel].id
			a.toggleToolDisabled(id)
		}
	case "up", "k":
		if cb.sel > 0 {
			cb.sel--
		}
		cb.offset = catalogBrowserClampOffset(cb.sel, cb.offset, len(cb.items))
	case "down", "j":
		if cb.sel < len(cb.items)-1 {
			cb.sel++
		}
		cb.offset = catalogBrowserClampOffset(cb.sel, cb.offset, len(cb.items))
	case "i":
		// Install a third-party MCP server. Closes the catalog and
		// opens the small inline install overlay. Only meaningful in
		// the MCP server list view (top-level /mcp).
		if cb.kind == catalogKindMcp {
			a.closeCatalogBrowser()
			a.openMcpInstallModal()
		}
	case "d":
		// Delete the highlighted MCP server. Bundled in_process
		// servers are non-removable; the existing remove flow already
		// filters those out and reports the "no third-party MCPs" toast.
		if cb.kind == catalogKindMcp {
			a.closeCatalogBrowser()
			return a, a.openMcpRemoveModal()
		}
	}
	return a, nil
}

// toggleToolDisabled flips a tool id in/out of App.disabledTools and
// persists. Used by the catalog browser's space key.
func (a *App) toggleToolDisabled(id string) {
	if a.disabledTools == nil {
		a.disabledTools = map[string]bool{}
	}
	if a.disabledTools[id] {
		delete(a.disabledTools, id)
	} else {
		a.disabledTools[id] = true
	}
	if a.SaveConfig != nil {
		_ = a.SaveConfig()
	}
}

func (a *App) openCatalogDetail(title, text string) {
	a.detailView = &bulkyPartRef{
		messageID: "catalog",
		partID:    strings.ToLower(strings.ReplaceAll(title, " ", "-")),
		title:     title,
		fullText:  text,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) catalogBrowserHeaderButtons() []menuButton {
	if a.catalogBrowser != nil &&
		(a.catalogBrowser.kind == catalogKindMcpDetail || a.catalogBrowser.kind == catalogKindAgentDetail) &&
		a.catalogBrowser.parent != nil {
		return []menuButton{{
			id:    "catalog:back",
			label: "back",
			action: func(app *App) tea.Cmd {
				if app.catalogBrowser != nil && app.catalogBrowser.parent != nil {
					app.catalogBrowser = app.catalogBrowser.parent
				}
				return nil
			},
		}}
	}
	return []menuButton{closeMenuButton("catalog:close", func(app *App) { app.closeCatalogBrowser() })}
}

const catalogBrowserRowBudget = 12
const catalogBrowserBodyRows = catalogBrowserRowBudget * 2

func catalogBrowserClampOffset(sel, offset, itemCount int) int {
	if itemCount <= catalogBrowserRowBudget {
		return 0
	}
	maxOffset := itemCount - catalogBrowserRowBudget
	if offset > maxOffset {
		offset = maxOffset
	}
	if offset < 0 {
		offset = 0
	}
	if sel < offset {
		return sel
	}
	if sel >= offset+catalogBrowserRowBudget {
		return sel - catalogBrowserRowBudget + 1
	}
	return offset
}

// SetDisabledTools seeds the disabled-tools set from main on startup
// (LLL2). Called once after Load() before the program runs.
func (a *App) SetDisabledTools(ids []string) {
	a.disabledTools = make(map[string]bool, len(ids))
	for _, id := range ids {
		a.disabledTools[id] = true
	}
}

// GetDisabledTools returns the disabled-tools set as a sorted slice
// for config persistence (LLL2). Stable order keeps config diffs
// readable.
func (a *App) GetDisabledTools() []string {
	out := make([]string, 0, len(a.disabledTools))
	for id := range a.disabledTools {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// viewCatalogBrowser renders the modal: title + rows + hint bar.
// Fixed result-height so the hint bar stays anchored regardless of
// how many items come back.
func (a *App) viewCatalogBrowser() string {
	t := a.Theme
	if a.catalogBrowser == nil {
		return ""
	}
	// Catalog rows carry descriptions, routing metadata, and source tags.
	// Use the inspection-pane width so lists remain readable without
	// consuming the whole application frame.
	w := a.detailModalWidth()

	buttons := a.catalogBrowserHeaderButtons()
	rows := make([]string, 0, catalogBrowserBodyRows)
	if a.catalogBrowser.loading && len(a.catalogBrowser.items) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading…"))
	}
	if a.catalogBrowser.errText != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).
			Render("error: "+a.catalogBrowser.errText))
	}
	a.catalogBrowser.offset = catalogBrowserClampOffset(
		a.catalogBrowser.sel,
		a.catalogBrowser.offset,
		len(a.catalogBrowser.items),
	)
	start := a.catalogBrowser.offset
	end := min(len(a.catalogBrowser.items), start+catalogBrowserRowBudget)
	listItems := make([]modalListItem, 0, end-start)
	for i := start; i < end; i++ {
		item := a.catalogBrowser.items[i]
		// LLL2: dim disabled tools so the user can scan what's off
		// at a glance. Selected highlight still wins so the cursor
		// never disappears on a disabled row.
		isDisabled := a.catalogBrowser.kind == catalogKindTools &&
			a.disabledTools != nil && a.disabledTools[item.id]
		idx := i
		listItems = append(listItems, modalListItem{
			id:          fmt.Sprintf("catalog:item:%d", idx),
			title:       item.title,
			description: compactCatalogText(item.desc),
			status:      item.statusTag,
			selected:    i == a.catalogBrowser.sel,
			disabled:    isDisabled,
			action: func(app *App) tea.Cmd {
				if app.catalogBrowser == nil || idx < 0 || idx >= len(app.catalogBrowser.items) {
					return nil
				}
				app.catalogBrowser.sel = idx
				app.catalogBrowser.offset = catalogBrowserClampOffset(idx, app.catalogBrowser.offset, len(app.catalogBrowser.items))
				_, cmd := app.handleCatalogBrowserKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	descriptionLines := 2
	if a.catalogBrowser.kind == catalogKindTools {
		descriptionLines = 1
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            w - 8,
		rowBudget:        catalogBrowserBodyRows,
		descriptionLines: descriptionLines,
	})
	listStartRow := len(rows)
	rows = append(rows, list.rows...)
	end = start + list.renderedItems

	// Hint text adapts per kind: tools get a Space toggle, MCP-server
	// list gets Enter-to-drill, MCP-detail gets Backspace-to-back.
	var hintText string
	switch a.catalogBrowser.kind {
	case catalogKindTools:
		hintText = "↑/↓ navigate · Space toggle · Esc close"
	case catalogKindMcp:
		hintText = "↑/↓ navigate · Enter drill in · i install · d delete · Esc close"
	case catalogKindAgents:
		hintText = "↑/↓ navigate · Enter details · Esc close"
	case catalogKindMcpDetail:
		hintText = "↑/↓ navigate · Enter details · Esc/Backspace back"
	case catalogKindAgentDetail:
		hintText = "↑/↓ navigate · Enter details · Esc/Backspace back"
	default:
		hintText = "↑/↓ navigate · Esc close"
	}
	win := scrollWindow{
		start:  start,
		end:    end,
		scroll: start,
		total:  len(a.catalogBrowser.items),
	}
	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   a.catalogBrowser.title,
			buttons: buttons,
			footer:  t.HintLabel.Italic(true).Render(hintText),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      w - 8,
		bodyRows:       catalogBrowserBodyRows,
		window:         win,
		wheelID:        "catalog:list:wheel",
		surfaceWheelID: "catalog",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.handleCatalogBrowserWheel(button)
		},
	})
	return rendered.modal
}

// catalogCommandForID maps a slash-command ID into a browser kind.
// Returns (_, false) for commands that don't open a browser so the
// caller can fall through to the normal RunCommand dispatch.
func catalogCommandForID(id string) (catalogBrowserKind, bool) {
	switch strings.ToLower(id) {
	case "/mcp":
		return catalogKindMcp, true
	case "/tools", "/catalog":
		// HHHHH1: /catalog alias — the unified tool view IS the
		// catalog. Keeps /tools as the canonical name (back-compat
		// with help text + muscle memory) while letting users discover
		// the same view via /catalog.
		return catalogKindTools, true
	case "/skills":
		return catalogKindSkills, true
	case "/agents-list":
		// Distinct from /agents which still routes to Settings (richer
		// picker). LLL3 added this read-only browser route.
		return catalogKindAgents, true
	}
	return 0, false
}

func stringFromMetadata(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	if value, ok := metadata[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func agentParentID(agent gact.AgentDef) string {
	if parent := stringFromMetadata(agent.Metadata, "parent"); parent != "" {
		return parent
	}
	return stringFromMetadata(agent.Metadata, "parent_id")
}

func agentCatalogItems(agents []gact.AgentDef, kind catalogBrowserKind) []catalogItem {
	filtered := make([]gact.AgentDef, 0, len(agents))
	for _, agent := range agents {
		if kind == catalogKindSkills && agent.Source != "skill" {
			continue
		}
		if kind == catalogKindAgents && agent.Source == "skill" {
			continue
		}
		filtered = append(filtered, agent)
	}
	if kind != catalogKindAgents {
		items := make([]catalogItem, 0, len(filtered))
		for _, agent := range filtered {
			items = append(items, agentCatalogItem(agent, agents, 0))
		}
		return items
	}

	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range filtered {
		parent := agentParentID(agent)
		if parent == "" {
			topLevel = append(topLevel, agent)
			continue
		}
		byParent[parent] = append(byParent[parent], agent)
	}
	sortAgentsForCatalog(topLevel)
	for parent := range byParent {
		sortAgentsForCatalog(byParent[parent])
	}

	items := make([]catalogItem, 0, len(filtered))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int)
	appendAgent = func(agent gact.AgentDef, depth int) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		items = append(items, agentCatalogItem(agent, agents, depth))
		for _, child := range byParent[agent.ID] {
			appendAgent(child, depth+1)
		}
	}
	for _, agent := range topLevel {
		appendAgent(agent, 0)
	}
	for _, agent := range filtered {
		appendAgent(agent, 0)
	}
	return items
}

func agentCatalogItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int) catalogItem {
	title := firstNonEmpty(agent.Title, agent.ID)
	if depth > 0 {
		title = strings.Repeat("  ", min(depth, 3)) + "└─ " + title
	}
	return catalogItem{
		id:        agent.ID,
		title:     title,
		desc:      agentCatalogDescription(agent, allAgents),
		statusTag: firstNonEmpty(agent.Source, "agent"),
	}
}

func agentCatalogDescription(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 6)
	if agent.Tier > 0 {
		parts = append(parts, "tier "+itoa2(agent.Tier))
	}
	if agent.Specialization != "" {
		parts = append(parts, agent.Specialization)
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "child of "+agentTitleByID(allAgents, parent))
	}
	if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
		parts = append(parts, "routes: "+strings.Join(routes, ", "))
	}
	if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
		parts = append(parts, "delegates: "+strings.Join(delegates, ", "))
	}
	if len(agent.Tools) > 0 {
		parts = append(parts, fmt.Sprintf("%d tools", len(agent.Tools)))
	}
	if agent.DefaultModel != nil && agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	}
	if desc := compactCatalogText(agent.Description); desc != "" {
		parts = append(parts, desc)
	}
	return strings.Join(parts, " · ")
}

func sortAgentsForCatalog(agents []gact.AgentDef) {
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].Tier != agents[j].Tier {
			if agents[i].Tier == 0 {
				return false
			}
			if agents[j].Tier == 0 {
				return true
			}
			return agents[i].Tier < agents[j].Tier
		}
		return firstNonEmpty(agents[i].Title, agents[i].ID) < firstNonEmpty(agents[j].Title, agents[j].ID)
	})
}

func compactCatalogText(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

func childAgentsOf(agents []gact.AgentDef, parentID string) []gact.AgentDef {
	out := make([]gact.AgentDef, 0)
	for _, agent := range agents {
		if agent.ID == parentID {
			continue
		}
		if agentParentID(agent) == parentID {
			out = append(out, agent)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return firstNonEmpty(out[i].Title, out[i].ID) < firstNonEmpty(out[j].Title, out[j].ID)
	})
	return out
}

func agentTitleByID(agents []gact.AgentDef, id string) string {
	for _, agent := range agents {
		if agent.ID == id {
			return firstNonEmpty(agent.Title, agent.ID)
		}
	}
	return id
}

func agentModelText(agent gact.AgentDef) string {
	if agent.DefaultModel == nil {
		return "backend/session default"
	}
	parts := make([]string, 0, 3)
	if agent.DefaultModel.ProviderID != "" {
		parts = append(parts, "provider: "+agent.DefaultModel.ProviderID)
	}
	if agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	}
	if agent.DefaultModel.Variant != "" {
		parts = append(parts, "variant: "+agent.DefaultModel.Variant)
	}
	if len(parts) == 0 {
		return "backend/session default"
	}
	return strings.Join(parts, " · ")
}

func toolsForAgent(agent gact.AgentDef, tools []gact.Tool) []gact.Tool {
	declared := map[string]bool{}
	for _, toolID := range agent.Tools {
		declared[toolID] = true
	}
	out := make([]gact.Tool, 0)
	seen := map[string]bool{}
	for _, tool := range tools {
		toolID := firstNonEmpty(tool.ID, tool.Name)
		if toolID == "" || seen[toolID] {
			continue
		}
		if declared[toolID] || stringInSlice(tool.VisibleTo, agent.ID) {
			out = append(out, tool)
			seen[toolID] = true
		}
	}
	if len(out) == 0 && len(declared) > 0 {
		for _, toolID := range agent.Tools {
			if toolID != "" && !seen[toolID] {
				out = append(out, gact.Tool{ID: toolID, Name: toolID})
				seen[toolID] = true
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return firstNonEmpty(out[i].Name, out[i].ID) < firstNonEmpty(out[j].Name, out[j].ID)
	})
	return out
}

func toolSummary(tool gact.Tool) string {
	parts := make([]string, 0, 4)
	if desc := strings.TrimSpace(tool.Description); desc != "" && !toolDescriptionRepeatsName(desc, tool) {
		parts = append(parts, desc)
	}
	if tool.ServerID != "" {
		parts = append(parts, "server: "+tool.ServerID)
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tags: "+strings.Join(tool.Tags, ", "))
	}
	if len(tool.VisibleTo) > 0 {
		parts = append(parts, "visible to: "+strings.Join(tool.VisibleTo, ", "))
	}
	return strings.Join(parts, " · ")
}

func toolCatalogDescription(tool gact.Tool) string {
	parts := make([]string, 0, 6)
	if tool.Owner != "" {
		parts = append(parts, "owner: "+tool.Owner)
	}
	if tool.PermissionDefault != "" {
		parts = append(parts, "permission: "+tool.PermissionDefault)
	}
	if fields := schemaFieldNames(tool.InputSchema, 2); len(fields) > 0 {
		parts = append(parts, "inputs: "+strings.Join(fields, ", "))
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tags: "+strings.Join(limitStrings(tool.Tags, 1), ", "))
	}
	if len(parts) == 0 {
		if desc := toolPurposeSummary(tool); desc != "" {
			parts = append(parts, desc)
		}
	}
	return truncate(strings.Join(parts, " · "), 88)
}

func toolPurposeSummary(tool gact.Tool) string {
	desc := strings.TrimSpace(tool.Description)
	if desc == "" || toolDescriptionRepeatsName(desc, tool) {
		return ""
	}
	for _, marker := range []string{"\n\n", "\nAgent story:", "Agent story:"} {
		if idx := strings.Index(desc, marker); idx >= 0 {
			desc = strings.TrimSpace(desc[:idx])
		}
	}
	return compactCatalogText(desc)
}

func schemaFieldNames(schema map[string]any, limit int) []string {
	if limit < 1 {
		limit = 1
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		return nil
	}
	names := sortedAnyMapKeys(props)
	if len(names) <= limit {
		return names
	}
	out := append([]string(nil), names[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(names)-limit))
	return out
}

func limitStrings(values []string, limit int) []string {
	if limit < 1 || len(values) <= limit {
		return values
	}
	out := append([]string(nil), values[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(values)-limit))
	return out
}

func toolDescriptionRepeatsName(desc string, tool gact.Tool) bool {
	normalizedDesc := normalizeCatalogComparable(desc)
	for _, candidate := range []string{tool.ID, tool.Name, tool.Title} {
		if normalizedDesc != "" && normalizedDesc == normalizeCatalogComparable(candidate) {
			return true
		}
	}
	return false
}

func normalizeCatalogComparable(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Trim(text, "`'\". ")
	return strings.Join(strings.Fields(text), " ")
}

func mcpServersForTools(tools []gact.Tool) []string {
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, tool := range tools {
		serverID := strings.TrimSpace(tool.ServerID)
		if serverID == "" || seen[serverID] {
			continue
		}
		seen[serverID] = true
		out = append(out, serverID)
	}
	sort.Strings(out)
	return out
}

func stringInSlice(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func formatToolDetail(tool gact.Tool) string {
	return formatToolDetailWithAgents(tool, nil)
}

func formatToolDetailWithAgents(tool gact.Tool, agents []gact.AgentDef) string {
	summary := []detailField{
		{"name", firstNonEmpty(tool.Name, tool.ID)},
		{"source", firstNonEmpty(tool.Source, "unknown")},
	}
	if tool.ServerID != "" {
		summary = append(summary, detailField{"server", tool.ServerID})
	}
	if tool.Owner != "" {
		summary = append(summary, detailField{"owner", tool.Owner})
	}
	if tool.PermissionDefault != "" {
		summary = append(summary, detailField{"permission", tool.PermissionDefault})
	}
	if tool.ID != "" && tool.ID != tool.Name {
		summary = append(summary, detailField{"tool id", tool.ID})
	}
	rows := appendDetailSection(nil, "Summary", summary...)

	availability := make([]detailField, 0, 3)
	if len(tool.VisibleTo) > 0 {
		availability = append(availability, detailField{"visible to", strings.Join(tool.VisibleTo, ", ")})
	}
	if len(tool.Tags) > 0 {
		availability = append(availability, detailField{"tags", strings.Join(tool.Tags, ", ")})
	}
	if owners := owningAgentsForTool(tool, agents); len(owners) > 0 {
		ownerRows := make([]string, 0, len(owners))
		for _, owner := range owners {
			ownerRows = append(ownerRows, "- "+owner)
		}
		availability = append(availability, detailField{"owning agents", strings.Join(ownerRows, "\n") + "\n"})
	}
	if len(availability) > 0 {
		rows = appendDetailSection(rows, "Availability", availability...)
	}

	if desc := strings.TrimSpace(tool.Description); desc != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", desc})
	}
	rows = appendSchemaSection(rows, "Inputs", tool.InputSchema)
	rows = appendSchemaSection(rows, "Outputs", tool.OutputSchema)
	if tool.Annotations != nil {
		if payload, err := json.MarshalIndent(tool.Annotations, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Annotations", detailField{"", string(payload)})
		}
	}
	return strings.Join(rows, "\n")
}

func owningAgentsForTool(tool gact.Tool, agents []gact.AgentDef) []string {
	toolIDs := map[string]bool{}
	for _, id := range []string{tool.ID, tool.Name, tool.Title} {
		id = strings.TrimSpace(id)
		if id != "" {
			toolIDs[id] = true
		}
	}
	visible := map[string]bool{}
	for _, id := range tool.VisibleTo {
		id = strings.TrimSpace(id)
		if id != "" {
			visible[id] = true
		}
	}
	owners := make([]string, 0)
	seen := map[string]bool{}
	for _, agent := range agents {
		if agent.ID == "" {
			continue
		}
		usesTool := visible[agent.ID]
		for _, declared := range agent.Tools {
			if toolIDs[strings.TrimSpace(declared)] {
				usesTool = true
				break
			}
		}
		if !usesTool {
			continue
		}
		label := firstNonEmpty(agent.Title, agent.ID)
		if agent.Specialization != "" {
			label += " · " + agent.Specialization
		} else if agent.Tier > 0 {
			label += " · tier " + itoa2(agent.Tier)
		}
		if !seen[label] {
			seen[label] = true
			owners = append(owners, label)
		}
	}
	sort.Strings(owners)
	return owners
}

func appendJSONMapSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, "", label+":", string(body))
	}
	return append(rows, "", label+":", fmt.Sprint(payload))
}

func appendSchemaSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	summary := summarizeJSONSchema(payload)
	if len(summary) == 0 {
		return appendJSONMapSection(rows, label, payload)
	}
	return appendDetailSection(rows, label, detailField{"", strings.Join(summary, "\n")})
}

func summarizeJSONSchema(schema map[string]any) []string {
	rows := make([]string, 0, 8)
	schemaType := jsonSchemaType(schema)
	if schemaType != "" {
		rows = append(rows, "type: "+schemaType)
	}
	required := requiredFieldSet(schema["required"])
	if len(required) > 0 {
		rows = append(rows, "required: "+strings.Join(sortedMapKeys(required), ", "))
	}
	if disabledAdditionalProperties(schema["additionalProperties"]) {
		rows = append(rows, "additional_properties: disabled")
	}

	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		if desc := strings.TrimSpace(stringFromAny(schema["description"])); desc != "" {
			rows = append(rows, "description: "+truncate(desc, 120))
		}
		if enum := schemaEnumSummary(schema["enum"]); enum != "" {
			rows = append(rows, "enum: "+enum)
		}
		return rows
	}

	rows = append(rows, "fields:")
	for _, name := range sortedAnyMapKeys(props) {
		prop, _ := props[name].(map[string]any)
		rows = append(rows, "- "+name+" — "+jsonSchemaPropertySummary(prop, required[name]))
	}
	return rows
}

func jsonSchemaPropertySummary(prop map[string]any, required bool) string {
	parts := make([]string, 0, 5)
	typ := jsonSchemaType(prop)
	if typ == "" {
		typ = "value"
	}
	parts = append(parts, typ)
	if required {
		parts = append(parts, "required")
	}
	if nested, ok := prop["properties"].(map[string]any); ok && len(nested) > 0 {
		parts = append(parts, "fields: "+strings.Join(sortedAnyMapKeys(nested), ", "))
	}
	if items, ok := prop["items"].(map[string]any); ok {
		if itemType := jsonSchemaType(items); itemType != "" {
			parts = append(parts, "items: "+itemType)
		}
	}
	if enum := schemaEnumSummary(prop["enum"]); enum != "" {
		parts = append(parts, "enum: "+enum)
	}
	if desc := strings.TrimSpace(stringFromAny(prop["description"])); desc != "" {
		parts = append(parts, truncate(desc, 96))
	}
	return strings.Join(parts, " · ")
}

func jsonSchemaType(schema map[string]any) string {
	if schema == nil {
		return ""
	}
	switch v := schema["type"].(type) {
	case string:
		return strings.TrimSpace(v)
	case []any:
		types := make([]string, 0, len(v))
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				types = append(types, s)
			}
		}
		return strings.Join(types, " | ")
	case []string:
		return strings.Join(v, " | ")
	default:
		return ""
	}
}

func requiredFieldSet(value any) map[string]bool {
	out := map[string]bool{}
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			if s := strings.TrimSpace(stringFromAny(item)); s != "" {
				out[s] = true
			}
		}
	case []string:
		for _, item := range v {
			if s := strings.TrimSpace(item); s != "" {
				out[s] = true
			}
		}
	}
	return out
}

func disabledAdditionalProperties(value any) bool {
	v, ok := value.(bool)
	return ok && !v
}

func sortedMapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedAnyMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func schemaEnumSummary(value any) string {
	var values []string
	switch v := value.(type) {
	case []any:
		values = make([]string, 0, len(v))
		for _, item := range v {
			values = append(values, stringFromAny(item))
		}
	case []string:
		values = append(values, v...)
	}
	if len(values) == 0 {
		return ""
	}
	for i, value := range values {
		values[i] = truncate(value, 28)
	}
	if len(values) > 5 {
		return strings.Join(values[:5], ", ") + fmt.Sprintf(" (+%d more)", len(values)-5)
	}
	return strings.Join(values, ", ")
}

func stringFromAny(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func formatMcpResourceContents(contents []gact.McpContent) string {
	if len(contents) == 0 {
		return "(resource returned no content)"
	}
	rows := make([]string, 0, len(contents)*5)
	for i, content := range contents {
		title := content.URI
		if title == "" {
			title = fmt.Sprintf("content[%d]", i)
		}
		fields := []detailField{{"uri", title}}
		fields = append(fields, detailField{"mime_type", content.MimeType})
		if content.Text != "" {
			fields = append(fields, detailField{"text", content.Text})
		}
		if content.Data != "" {
			fields = append(fields, detailField{"base64_data", fmt.Sprintf("%d bytes encoded", len(content.Data))})
		}
		rows = appendDetailSection(rows, "Resource content", fields...)
	}
	return strings.Join(rows, "\n")
}

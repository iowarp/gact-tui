// Catalog-browser modal (L5). Used by the /mcp, /tools, /agents, and
// /skills slash commands to open a scoped list of items from the
// corresponding catalog endpoint. /agents routes straight to the
// Settings > Agent tab since the picker there already does exactly
// the right thing; the other three open a read-only list modal with
// title + description per item.
package ui

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

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
	// LLL2: when kind=catalogKindMcpDetail, mcpServerID identifies
	// which server's catalog we're viewing. parent is preserved so
	// Esc/Backspace can pop back to the server list rather than
	// closing the whole modal.
	mcpServerID string
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
				// Name + command give the user a sense of what the
				// server provides; Transport rounds it out.
				desc := fmt.Sprintf("%s (%s)", s.Name, s.Transport)
				items = append(items, catalogItem{
					id: s.ID, title: s.Name, desc: desc, statusTag: status,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindTools:
			tools, err := c.ListTools(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := make([]catalogItem, 0, len(tools))
			for _, tl := range tools {
				items = append(items, catalogItem{
					id: tl.Name, title: tl.Name, desc: tl.Description,
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
			items := make([]catalogItem, 0, len(agents))
			for _, a := range agents {
				if kind == catalogKindSkills && a.Source != "skill" {
					continue
				}
				desc := a.Description
				if a.DefaultModel != nil && a.DefaultModel.ModelID != "" {
					if desc != "" {
						desc += " · "
					}
					desc += "model: " + a.DefaultModel.ModelID
				}
				items = append(items, catalogItem{
					id: a.ID, title: a.Title, desc: desc,
					statusTag: a.Source,
				})
			}
			if len(items) == 0 && kind == catalogKindSkills {
				items = append(items, catalogItem{
					id:    "none",
					title: "(no skills on this backend)",
					desc:  "Skills are agents with source=\"skill\". Backends doing automated extraction expose them via /v1/agents.",
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

		if tools, err := c.McpServerTools(ctx, serverID); err != nil {
			errs = append(errs, "tools: "+err.Error())
		} else {
			for _, t := range tools {
				items = append(items, catalogItem{
					id: "tool/" + t.ID, title: "[tool] " + t.Name, desc: t.Description,
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

func catalogBrowserTitle(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindMcp:
		return "MCP servers"
	case catalogKindTools:
		return "Tools"
	case catalogKindSkills:
		return "Skills"
	case catalogKindMcpDetail:
		return "MCP detail"
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
		if cb.kind == catalogKindMcpDetail && cb.parent != nil {
			a.catalogBrowser = cb.parent
			return a, nil
		}
		a.closeCatalogBrowser()
	case "backspace":
		if cb.kind == catalogKindMcpDetail && cb.parent != nil {
			a.catalogBrowser = cb.parent
		}
	case "enter":
		// Drill into an MCP server when selected.
		if cb.kind == catalogKindMcp && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			return a, a.openMcpDetail(it.id, it.title)
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
	case "down", "j":
		if cb.sel < len(cb.items)-1 {
			cb.sel++
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
	w := a.modalWidth() + 6 // slightly wider than standard modals for descriptions

	// LLL4: title bar matching the Settings modal — full-width Primary
	// background with inverted text. Reads as a real header.
	title := lipgloss.NewStyle().
		Background(t.Primary).Foreground(t.Bg).Bold(true).
		Padding(0, 2).Width(w - 4).Render(a.catalogBrowser.title)
	const rowBudget = 12
	rows := make([]string, 0, rowBudget)
	if a.catalogBrowser.loading && len(a.catalogBrowser.items) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading…"))
	}
	if a.catalogBrowser.errText != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).
			Render("error: "+a.catalogBrowser.errText))
	}
	for i, item := range a.catalogBrowser.items {
		if i >= rowBudget {
			rows = append(rows, t.HintLabel.Italic(true).Render(
				fmt.Sprintf("… and %d more", len(a.catalogBrowser.items)-rowBudget)))
			break
		}
		marker := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
		// LLL2: dim disabled tools so the user can scan what's off
		// at a glance. Selected highlight still wins so the cursor
		// never disappears on a disabled row.
		isDisabled := a.catalogBrowser.kind == catalogKindTools &&
			a.disabledTools != nil && a.disabledTools[item.id]
		if isDisabled {
			titleStyle = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true)
		}
		isSelected := i == a.catalogBrowser.sel
		if isSelected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = titleStyle.Foreground(t.Secondary)
		}
		line := marker + titleStyle.Render(item.title)
		if isDisabled {
			line += "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render("(disabled)")
		}
		if item.statusTag != "" {
			tagStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
			if item.statusTag == "connected" {
				tagStyle = lipgloss.NewStyle().Foreground(t.Success).Bold(true)
			}
			line += "  " + tagStyle.Render("["+item.statusTag+"]")
		}
		out := truncate(line, w-4)
		// LLL4: row-bg highlight for the selected row, mirroring the
		// Settings modal pattern.
		if isSelected {
			out = lipgloss.NewStyle().Background(t.Bg).Width(w - 4).Render(out)
		}
		rows = append(rows, out)
		if item.desc != "" {
			descStyle := t.HintLabel.Italic(true)
			descLine := "  " + truncate(descStyle.Render(item.desc), w-4)
			if isSelected {
				descLine = lipgloss.NewStyle().Background(t.Bg).
					Width(w - 4).Render(descLine)
			}
			rows = append(rows, descLine)
		}
	}
	// Pad to fixed height.
	for len(rows) < rowBudget {
		rows = append(rows, "")
	}

	// Hint text adapts per kind: tools get a Space toggle, MCP-server
	// list gets Enter-to-drill, MCP-detail gets Backspace-to-back.
	var hintText string
	switch a.catalogBrowser.kind {
	case catalogKindTools:
		hintText = "↑/↓ navigate · Space toggle · Esc close"
	case catalogKindMcp:
		hintText = "↑/↓ navigate · Enter drill in · Esc close"
	case catalogKindMcpDetail:
		hintText = "↑/↓ navigate · Esc/Backspace back"
	default:
		hintText = "↑/↓ navigate · Esc close"
	}
	hint := t.HintLabel.Italic(true).Render(hintText)

	body := lipgloss.JoinVertical(lipgloss.Left,
		title, "",
		lipgloss.JoinVertical(lipgloss.Left, rows...),
		"", hint,
	)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
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
	case "/agents-list":
		// Distinct from /agents which still routes to Settings (richer
		// picker). LLL3 added this read-only browser route.
		return catalogKindAgents, true
	}
	return 0, false
}

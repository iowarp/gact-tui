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
)

// catalogBrowserState holds the runtime for the list modal.
type catalogBrowserState struct {
	kind    catalogBrowserKind
	title   string
	items   []catalogItem
	loading bool
	errText string
	sel     int
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
		case catalogKindSkills:
			// Skills don't have a dedicated endpoint yet. Return a
			// single informational row so the modal is consistent and
			// the user sees a clear "not implemented" state rather
			// than an empty list with no explanation.
			return catalogBrowserLoadedMsg{kind: kind, items: []catalogItem{{
				id:    "none",
				title: "(no skills endpoint on this backend)",
				desc:  "Backends that implement skills will surface them here.",
			}}}
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

func catalogBrowserTitle(kind catalogBrowserKind) string {
	switch kind {
	case catalogKindMcp:
		return "MCP servers"
	case catalogKindTools:
		return "Tools"
	case catalogKindSkills:
		return "Skills"
	}
	return "Catalog"
}

// closeCatalogBrowser drops modal state.
func (a *App) closeCatalogBrowser() {
	a.catalogBrowserOpen = false
	a.catalogBrowser = nil
}

// handleCatalogBrowserKey handles keypresses while the modal is open.
// Read-only — up/down navigates, Esc closes.
func (a *App) handleCatalogBrowserKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.catalogBrowser == nil {
		a.closeCatalogBrowser()
		return a, nil
	}
	switch k.String() {
	case "esc", "ctrl+c", "enter":
		a.closeCatalogBrowser()
	case "up", "k":
		if a.catalogBrowser.sel > 0 {
			a.catalogBrowser.sel--
		}
	case "down", "j":
		if a.catalogBrowser.sel < len(a.catalogBrowser.items)-1 {
			a.catalogBrowser.sel++
		}
	}
	return a, nil
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

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(a.catalogBrowser.title)
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
		if i == a.catalogBrowser.sel {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = titleStyle.Foreground(t.Secondary)
		}
		line := marker + titleStyle.Render(item.title)
		if item.statusTag != "" {
			tagStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
			if item.statusTag == "connected" {
				tagStyle = lipgloss.NewStyle().Foreground(t.Success).Bold(true)
			}
			line += "  " + tagStyle.Render("["+item.statusTag+"]")
		}
		rows = append(rows, truncate(line, w-4))
		if item.desc != "" {
			descStyle := t.HintLabel.Italic(true)
			rows = append(rows, "  "+truncate(descStyle.Render(item.desc), w-4))
		}
	}
	// Pad to fixed height.
	for len(rows) < rowBudget {
		rows = append(rows, "")
	}

	hint := t.HintLabel.Italic(true).Render(
		"↑/↓ navigate    Esc / Enter close")

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
	}
	return 0, false
}

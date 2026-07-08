package ui

// agentComponent: the right-sidebar agent-hierarchy tree and next-turn-agent routing.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type agentHierarchyLoadedMsg struct {
	agents []gact.AgentDef
	err    string
}

func loadAgentHierarchyCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		agents, err := c.ListAgentsScoped(ctx, scope)
		if err != nil {
			return agentHierarchyLoadedMsg{err: err.Error()}
		}
		return agentHierarchyLoadedMsg{agents: agents}
	}
}

func (c *agentComponent) handleAgentHierarchyLoaded(m agentHierarchyLoadedMsg) (tea.Model, tea.Cmd) {
	c.hierarchyAgents = m.agents
	c.hierarchyErr = m.err
	c.clampAgentHierarchySelection()
	return c.app, nil
}

// setHierarchySel records the agent-hierarchy selection cursor. The seam for
// cross-domain callers (sidebar key navigation) that previously poked
// hierarchySel directly; callers stay responsible for range validity, matching
// the former inline writes.
func (c *agentComponent) setHierarchySel(index int) {
	c.hierarchySel = index
}

func (c *agentComponent) clampAgentHierarchySelection() {
	rows := c.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		c.hierarchySel = 0
		return
	}
	c.hierarchySel = clampSelection(c.hierarchySel, len(rows))
}

func (c *agentComponent) openSelectedAgentHierarchyDetail() tea.Cmd {
	rows := c.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		return nil
	}
	c.hierarchySel = clampSelection(c.hierarchySel, len(rows))
	agent := rows[c.hierarchySel].agent
	return c.app.catalog.openAgentDetail(agent.ID, valuefmt.FirstNonEmpty(agent.Title, agent.ID))
}

func (c *agentComponent) renderAgentHierarchyModuleRows(width int, startRow int, rowBudget int) []string {
	t := c.app.Theme
	rowsData := c.visibleAgentHierarchyRows()
	title := agentHierarchyModuleTitle(rowsData, c.app.sidebar.moduleTitle(sidebarModuleAgents))
	disclosure := "▾ "
	if c.sidebarAgentsCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(rowsData))
	}
	prefix := ""
	if c.app.focus == c.app.sidebar.hitFocus && (c.app.sidebar.sessionsCollapsed || c.app.sidebar.sectionCursor) && c.app.sidebar.sectionFocus == sidebarSectionAgents {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	c.app.sidebar.registerSectionHeaderHit(startRow, width, sidebarSectionAgents)
	if c.sidebarAgentsCollapsed {
		return rows
	}
	if owner := c.agentHierarchyActiveBlueprintSummary(rowsData, width); owner != "" {
		rows = append(rows, owner)
		if rowBudget > 1 {
			rowBudget--
		}
	}
	if c.hierarchyErr != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(textutil.Truncate("error: "+c.hierarchyErr, width-6)))
		return rows
	}
	if len(rowsData) == 0 {
		rows = append(rows, t.HintLabel.Render("(no agents)"))
		return rows
	}
	c.clampAgentHierarchySelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(rowsData), c.hierarchySel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		rows = append(rows, c.renderAgentHierarchyRow(rowsData[i], width, i == c.hierarchySel))
		c.registerSidebarAgentHierarchyHit(row, width, i)
	}
	if win.end < len(rowsData) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(rowsData)-win.end)))
	}
	return rows
}

func (c *agentComponent) sidebarAgentHierarchyRowCount(rowBudget int) int {
	if !c.app.sidebar.hasEnabledModule(sidebarModuleAgents) {
		return 0
	}
	rows := 1
	if c.sidebarAgentsCollapsed {
		return rows
	}
	if c.hierarchyErr != "" || len(c.visibleAgentHierarchyRows()) == 0 {
		return rows + 1
	}
	visible := len(c.visibleAgentHierarchyRows())
	if visible > rowBudget {
		rows += rowBudget
		if c.hierarchySel > 0 {
			rows++
		}
		if c.hierarchySel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (c *agentComponent) registerSidebarAgentHierarchyHit(row int, width int, visibleIndex int) {
	if c.app.interaction.hits == nil {
		return
	}
	zone := c.app.sidebar.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:agents:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:agents:item:" + itoa2(visibleIndex)
	}
	openAgentDetail := func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebar.sectionFocus = sidebarSectionAgents
		app.sidebar.sectionCursor = false
		app.agent.hierarchySel = visibleIndex
		return app.agent.openSelectedAgentHierarchyDetail()
	}
	c.app.sidebar.registerContentHitActions(id, row, width, 1, openAgentDetail, openAgentDetail)
}

// appAgentHierarchyState groups the right-sidebar agent hierarchy tree state.
type appAgentHierarchyState struct {
	hierarchyAgents        []gact.AgentDef
	hierarchyErr           string
	hierarchySel           int
	sidebarAgentsCollapsed bool
}

// agentComponent owns the agents domain: the right-sidebar hierarchy tree
// (embedded appAgentHierarchyState, so callers keep reading c.hierarchy*
// directly), the "next turn agent" selection, and a back-reference to the root
// App for shared services (client, theme, session, catalog, conversation). It
// gathers the former *App agent methods so the agent-hierarchy, blueprint /
// detail actions, agent message-handlers, and catalog-agent openers all hang
// off one component.
type agentComponent struct {
	app *App
	appAgentHierarchyState

	// nextTurnAgent* pin the expert that the next composed message routes to.
	// Set from the catalog ("send to" / detail) and cleared on send. The
	// composer reads these to paint the routing chip.
	nextTurnAgentID    string
	nextTurnAgentTitle string
}

// sidebarCollapsed reports whether the sidebar agent-hierarchy section is
// collapsed. The method seam for cross-domain readers (sidebar layout, key
// navigation, mouse hit-testing) that previously read the field directly.
func (c *agentComponent) sidebarCollapsed() bool {
	return c.sidebarAgentsCollapsed
}

// toggleSidebarCollapsed flips the sidebar agent-hierarchy section's collapsed
// state and returns the new value. The sidebar controller uses the return to
// pick the collapsed/expanded hint, so the field stays owned by agentComponent.
func (c *agentComponent) toggleSidebarCollapsed() bool {
	c.sidebarAgentsCollapsed = !c.sidebarAgentsCollapsed
	return c.sidebarAgentsCollapsed
}

func (c *agentComponent) setNextTurnAgent(agentID, title string) {
	c.nextTurnAgentID = strings.TrimSpace(agentID)
	c.nextTurnAgentTitle = strings.TrimSpace(title)
	label := valuefmt.FirstNonEmpty(c.nextTurnAgentTitle, c.nextTurnAgentID)
	c.app.setHint("next turn agent: " + label)
	c.app.focus = FocusInput
}

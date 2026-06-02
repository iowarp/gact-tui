package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type agentHierarchyLoadedMsg struct {
	agents []gact.AgentDef
	err    string
}

type agentHierarchyRow struct {
	agent gact.AgentDef
	depth int
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

func (a *App) visibleAgentHierarchyRows() []agentHierarchyRow {
	agents := make([]gact.AgentDef, 0, len(a.agentHierarchyAgents))
	for _, agent := range a.agentHierarchyAgents {
		if agent.Source == "skill" {
			continue
		}
		agents = append(agents, agent)
	}
	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range agents {
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
	rows := make([]agentHierarchyRow, 0, len(agents))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int)
	appendAgent = func(agent gact.AgentDef, depth int) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		rows = append(rows, agentHierarchyRow{agent: agent, depth: depth})
		for _, child := range byParent[agent.ID] {
			appendAgent(child, depth+1)
		}
	}
	for _, agent := range topLevel {
		appendAgent(agent, 0)
	}
	for _, agent := range agents {
		appendAgent(agent, 0)
	}
	return rows
}

func (a *App) clampAgentHierarchySelection() {
	rows := a.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		a.agentHierarchySel = 0
		return
	}
	a.agentHierarchySel = clampSelection(a.agentHierarchySel, len(rows))
}

func (a *App) openSelectedAgentHierarchyDetail() tea.Cmd {
	rows := a.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		return nil
	}
	a.agentHierarchySel = clampSelection(a.agentHierarchySel, len(rows))
	agent := rows[a.agentHierarchySel].agent
	a.catalogBrowserOpen = true
	return a.openAgentDetail(agent.ID, firstNonEmpty(agent.Title, agent.ID))
}

func (a *App) renderAgentHierarchyModuleRows(width int, startRow int, rowBudget int) []string {
	t := a.Theme
	rowsData := a.visibleAgentHierarchyRows()
	title := a.sidebarModuleTitle(sidebarModuleAgents)
	disclosure := "▾ "
	if a.sidebarAgentsCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(rowsData))
	}
	prefix := ""
	if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionAgents {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	a.registerSidebarSectionHeaderHit(startRow, width, sidebarSectionAgents)
	if a.sidebarAgentsCollapsed {
		return rows
	}
	if a.agentHierarchyErr != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(truncate("error: "+a.agentHierarchyErr, width-6)))
		return rows
	}
	if len(rowsData) == 0 {
		rows = append(rows, t.HintLabel.Render("(no agents)"))
		return rows
	}
	a.clampAgentHierarchySelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(rowsData), a.agentHierarchySel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		rows = append(rows, a.renderAgentHierarchyRow(rowsData[i], width, i == a.agentHierarchySel))
		a.registerSidebarAgentHierarchyHit(row, width, i)
	}
	if win.end < len(rowsData) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(rowsData)-win.end)))
	}
	return rows
}

func (a *App) renderAgentHierarchyRow(row agentHierarchyRow, width int, selected bool) string {
	t := a.Theme
	agent := row.agent
	current := a.selected >= 0 && a.selected < len(a.sessions) && a.sessions[a.selected].Agent.ID == agent.ID
	marker := " "
	nameStyle := t.HintLabel
	if current {
		marker = ">"
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	if selected && a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionAgents && !a.sidebarSectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", min(row.depth, 4))
	branch := "• "
	if row.depth > 0 {
		branch = "└─ "
	}
	meta := firstNonEmpty(agent.Specialization, agent.Source)
	if agent.Tier > 0 {
		meta = fmt.Sprintf("t%d", agent.Tier)
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	metaStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	metaW := lipgloss.Width(meta)
	title := firstNonEmpty(agent.Title, agent.ID)
	nameBudget := contentW - lipgloss.Width(marker+indent+branch) - metaW - 1
	if nameBudget < 4 {
		nameBudget = 4
	}
	line := marker + indent + branch + nameStyle.Render(truncate(title, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return truncate(line, contentW)
}

func (a *App) sidebarAgentHierarchyRowCount(rowBudget int) int {
	if !a.sidebarHasEnabledModule(sidebarModuleAgents) {
		return 0
	}
	rows := 1
	if a.sidebarAgentsCollapsed {
		return rows
	}
	if a.agentHierarchyErr != "" || len(a.visibleAgentHierarchyRows()) == 0 {
		return rows + 1
	}
	visible := len(a.visibleAgentHierarchyRows())
	if visible > rowBudget {
		rows += rowBudget
		if a.agentHierarchySel > 0 {
			rows++
		}
		if a.agentHierarchySel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (a *App) registerSidebarAgentHierarchyHit(row int, width int, visibleIndex int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:agents:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:agents:item:" + itoa2(visibleIndex)
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionAgents
		app.sidebarSectionCursor = false
		app.agentHierarchySel = visibleIndex
		return app.openSelectedAgentHierarchyDetail()
	})
}

package ui

// agent_hierarchy_render.go renders the agent-hierarchy rows.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *agentComponent) renderAgentHierarchyRow(row agentHierarchyRow, width int, selected bool) string {
	t := c.app.Theme
	agent := row.agent
	runtimeState := c.agentHierarchyRuntimeState(agent.ID)
	marker := " "
	nameStyle := t.HintLabel
	if runtimeState == agentHierarchyStateSession || runtimeState == agentHierarchyStateActive || runtimeState == agentHierarchyStateLive {
		marker = ">"
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	if selected && c.app.focus == c.app.sidebar.hitFocus && c.app.sidebar.sectionFocus == sidebarSectionAgents && !c.app.sidebar.sectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", min(row.depth, 4))
	branch := "• "
	if row.depth > 0 {
		branch = "└─ "
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	title := valuefmt.FirstNonEmpty(agent.Title, agent.ID)
	basePrefixW := lipgloss.Width(marker + indent + branch)
	indexLabel := agentHierarchyIndexLabel(row)
	if indexLabel != "" {
		indexW := lipgloss.Width(indexLabel + " ")
		titleW := lipgloss.Width(title)
		if contentW-basePrefixW-indexW < titleW+1 {
			indexLabel = agentHierarchyTierLabel(row)
			indexW = lipgloss.Width(indexLabel + " ")
			if contentW-basePrefixW-indexW < titleW+1 {
				indexLabel = ""
			}
		}
	}
	indexText := ""
	if indexLabel != "" {
		indexText = lipgloss.NewStyle().Foreground(t.FgMuted).Render(indexLabel + " ")
	}
	meta := agentHierarchyRowMeta(row, runtimeState)
	prefixW := lipgloss.Width(marker + indent + branch + indexLabel + " ")
	if meta != "" {
		titleW := lipgloss.Width(title)
		metaBudget := contentW - prefixW - titleW - 1
		if metaBudget < 8 {
			meta = ""
		} else {
			meta = textutil.Truncate(meta, metaBudget)
		}
	}
	metaStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	metaW := lipgloss.Width(meta)
	nameBudget := contentW - prefixW - metaW - 1
	if nameBudget < 4 {
		nameBudget = 4
	}
	line := marker + indent + branch + indexText + nameStyle.Render(textutil.Truncate(title, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return textutil.Truncate(line, contentW)
}

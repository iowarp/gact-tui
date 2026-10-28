package ui

// session_setup_sections.go renders the agent list of the new-session setup.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *sessionComponent) renderSetupAgents(width int) ([]string, modalListRender) {
	s := c.ensureSetup()
	title := lipgloss.NewStyle().Foreground(c.app.Theme.Secondary).Bold(true).Width(width).Render("Agent")
	indexes := make([]int, 0, len(s.agents)+1)
	for i := 0; i < len(s.agents)+1; i++ {
		indexes = append(indexes, i)
	}
	visible := valuefmt.MinInt(9, maxInt(4, len(indexes)))
	list, _ := c.app.modals.renderWindowedIndexModalList(indexes, s.agentSel, visible, 9, modalListOptions{
		width:     width,
		rowBudget: visible,
	}, func(idx int) modalListItem {
		title := "backend default"
		if idx > 0 {
			agent := s.agents[idx-1]
			title = valuefmt.FirstNonEmpty(agent.Name, agent.ID) + "  " + agent.Ref
			if agent.Kind == "user" {
				title += " (yours)"
			}
		}
		prefix := "○ "
		if idx == s.agentSel {
			prefix = "● "
		}
		choice := idx
		return modalListItem{
			id:       fmt.Sprintf("session-setup:agent:%d", choice),
			title:    prefix + title,
			selected: choice == s.agentSel,
			action: func(app *App) tea.Cmd {
				app.session.ensureSetup().agentSel = choice
				return nil
			},
		}
	})
	return append([]string{title}, list.rows...), list
}

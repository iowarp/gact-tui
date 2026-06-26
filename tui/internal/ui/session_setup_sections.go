package ui

// session_setup_sections.go renders the blueprint/pack selection sections of the new-session setup.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (c *sessionComponent) renderSetupBlueprints(width int) ([]string, modalListRender) {
	s := c.ensureSetup()
	title := c.setupSectionTitle("Workflow blueprint", s.row == 0, width)
	indexes := make([]int, 0, len(s.blueprints)+1)
	for i := 0; i < len(s.blueprints)+1; i++ {
		indexes = append(indexes, i)
	}
	visible := minInt(7, maxInt(4, len(indexes)))
	list, _ := c.app.modals.renderWindowedIndexModalList(indexes, s.blueprintSel, visible, 7, modalListOptions{
		width:     width,
		rowBudget: visible,
	}, func(idx int) modalListItem {
		title := "backend default"
		if idx > 0 {
			bp := s.blueprints[idx-1]
			title = firstNonEmpty(bp.Title, bp.ID)
		}
		prefix := "○ "
		if idx == s.blueprintSel {
			prefix = "● "
		}
		choice := idx
		return modalListItem{
			id:       fmt.Sprintf("session-setup:blueprint:%d", choice),
			title:    prefix + title,
			selected: s.row == 0 && choice == s.blueprintSel,
			action: func(app *App) tea.Cmd {
				state := app.session.ensureSetup()
				state.row = 0
				state.blueprintSel = choice
				return nil
			},
		}
	})
	return append([]string{title}, list.rows...), list
}

func (c *sessionComponent) renderSetupPacks(width int) ([]string, modalListRender) {
	s := c.ensureSetup()
	title := c.setupSectionTitle("Expert pack", s.row == 1, width)
	indexes := make([]int, 0, len(s.packs)+1)
	for i := 0; i < len(s.packs)+1; i++ {
		indexes = append(indexes, i)
	}
	visible := minInt(7, maxInt(4, len(indexes)))
	list, _ := c.app.modals.renderWindowedIndexModalList(indexes, s.packSel, visible, 7, modalListOptions{
		width:     width,
		rowBudget: visible,
	}, func(idx int) modalListItem {
		title := "None"
		if idx > 0 {
			pack := s.packs[idx-1]
			title = firstNonEmpty(pack.Title, pack.ID)
		}
		prefix := "○ "
		if idx == s.packSel {
			prefix = "● "
		}
		choice := idx
		return modalListItem{
			id:       fmt.Sprintf("session-setup:pack:%d", choice),
			title:    prefix + title,
			selected: s.row == 1 && choice == s.packSel,
			action: func(app *App) tea.Cmd {
				state := app.session.ensureSetup()
				state.row = 1
				state.packSel = choice
				return nil
			},
		}
	})
	return append([]string{title}, list.rows...), list
}

func (c *sessionComponent) setupSectionTitle(title string, active bool, width int) string {
	style := lipgloss.NewStyle().Foreground(c.app.Theme.FgMuted).Bold(true).Width(width)
	if active {
		style = style.Foreground(c.app.Theme.Secondary)
	}
	return style.Render(title)
}

func joinSessionSetupSections(leftRows, rightRows []string, width int) (rows []string, leftListStart int, rightListStart int, rightCol int, sectionW int) {
	gap := 4
	if width < 60 {
		gap = 2
	}
	sectionW = (width - gap) / 2
	if sectionW < 20 {
		sectionW = width
		gap = 0
	}
	rightCol = sectionW + gap
	maxRows := maxInt(len(leftRows), len(rightRows))
	rows = make([]string, 0, maxRows)
	leftStyle := lipgloss.NewStyle().Width(sectionW)
	rightStyle := lipgloss.NewStyle().Width(sectionW)
	gapText := strings.Repeat(" ", gap)
	if sectionW == width {
		rows = append(rows, leftRows...)
		rows = append(rows, "")
		rightStart := len(rows)
		rows = append(rows, rightRows...)
		return rows, 1, rightStart + 1, 0, sectionW
	}
	for i := 0; i < maxRows; i++ {
		left := ""
		right := ""
		if i < len(leftRows) {
			left = leftRows[i]
		}
		if i < len(rightRows) {
			right = rightRows[i]
		}
		rows = append(rows, leftStyle.Render(left)+gapText+rightStyle.Render(right))
	}
	return rows, 1, 1, rightCol, sectionW
}

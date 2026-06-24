package ui

// interaction_modal_buttons.go defines menu-button rendering and registers their modal hit regions.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

const modalButtonSpacing = 3

type menuButton struct {
	id       string
	label    string
	disabled bool
	action   uiHitAction
}

// saveCancelButtons builds the standard two-button save/cancel row shared by the
// text-entry modals (rename, context-add, agent-write, agent-edit, prompt-edit).
// onSave/onCancel are the button actions; the labels are fixed to "save"/"cancel".
func saveCancelButtons(saveID, cancelID string, onSave, onCancel func(*App) tea.Cmd) []menuButton {
	return []menuButton{
		{id: saveID, label: "save", action: onSave},
		{id: cancelID, label: "cancel", action: onCancel},
	}
}

func closeMenuButton(id string, close func(*App)) menuButton {
	return menuButton{
		id:    id,
		label: "x",
		action: func(app *App) tea.Cmd {
			close(app)
			return nil
		},
	}
}

func (c *interactionComponent) registerModalButtons(modal string, row int, startCol int, buttons []menuButton) {
	_, hits := c.app.modals.renderModalButtonsWithHits(buttons, -1)
	for i := range hits {
		hits[i].row = row
		hits[i].col += startCol
	}
	c.registerModalCellHits(modal, 0, hits)
}

func (m *modalkit) appendModalActionRow(rows []string, buttons []menuButton, selected int) ([]string, int) {
	actionRow := len(rows)
	return append(rows, m.renderModalButtons(buttons, selected)), actionRow
}

func (c *interactionComponent) registerModalActionRow(modal string, row int, buttons []menuButton) {
	c.registerModalButtons(modal, row, 0, buttons)
}

func (m *modalkit) renderModalButtons(buttons []menuButton, selected int) string {
	row, _ := m.renderModalButtonsWithHits(buttons, selected)
	return row
}

func (m *modalkit) renderCenteredModalButtons(width int, buttons []menuButton, selected int) (string, int) {
	if width < 1 {
		width = 1
	}
	row := m.renderModalButtons(buttons, selected)
	rowW := lipgloss.Width(row)
	startCol := maxInt(0, (width-rowW)/2)
	if rowW >= width {
		startCol = 0
	}
	prefix := lipgloss.NewStyle().
		Background(m.app.Theme.BgSubtle).
		Render(strings.Repeat(" ", startCol))
	rendered := lipgloss.NewStyle().
		Background(m.app.Theme.BgSubtle).
		Width(width).
		Render(prefix + row)
	return rendered, startCol
}

func (m *modalkit) renderModalButtonsWithHits(buttons []menuButton, selected int) (string, []modalCellHit) {
	cells := make([]string, 0, len(buttons))
	hits := make([]modalCellHit, 0, len(buttons))
	col := 0
	spacer := lipgloss.NewStyle().
		Background(m.app.Theme.BgSubtle).
		Render(strings.Repeat(" ", modalButtonSpacing))
	for i, button := range buttons {
		labelW := lipgloss.Width(button.label)
		width := labelW + 4
		leftPad, rightPad := centeredPadding(labelW, width)
		style := lipgloss.NewStyle().
			Foreground(m.app.Theme.Bg).
			Background(m.app.Theme.Primary).
			Bold(true).
			PaddingLeft(leftPad).
			PaddingRight(rightPad)
		if button.disabled {
			style = lipgloss.NewStyle().
				Foreground(m.app.Theme.FgFaint).
				Background(m.app.Theme.BgSubtle).
				PaddingLeft(leftPad).
				PaddingRight(rightPad)
		} else if i == selected {
			style = lipgloss.NewStyle().
				Foreground(m.app.Theme.Bg).
				Background(m.app.Theme.Secondary).
				Bold(true).
				PaddingLeft(leftPad).
				PaddingRight(rightPad)
		}
		cells = append(cells, style.Render(button.label))
		if button.id != "" && button.action != nil && !button.disabled {
			hits = append(hits, modalCellHit{
				id:     "button:" + button.id,
				col:    col,
				width:  width,
				height: 1,
				action: button.action,
			})
		}
		col += width + modalButtonSpacing
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(cells, spacer)), hits
}

func centeredPadding(labelW int, width int) (int, int) {
	if width <= labelW {
		return 0, 0
	}
	left := (width - labelW) / 2
	right := width - labelW - left
	return left, right
}

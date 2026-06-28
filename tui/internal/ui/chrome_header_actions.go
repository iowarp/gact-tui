package ui

// chrome_header_actions.go builds and renders the header action bar and registers its hit regions.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

type headerAction struct {
	id     string
	label  string
	action uiHitAction
}

func (c *chromeComponent) headerActions() []headerAction {
	return []headerAction{
		{
			id:    "help",
			label: "help",
			action: func(app *App) tea.Cmd {
				app.help.openModal()
				return nil
			},
		},
		{
			id:    "settings",
			label: "settings",
			action: func(app *App) tea.Cmd {
				return app.settings.openTab(0)
			},
		},
		{
			id:    "quit",
			label: "x",
			action: func(app *App) tea.Cmd {
				app.quitConfirm.openModal()
				return nil
			},
		},
	}
}

func (c *chromeComponent) renderHeaderActionBar(actions []headerAction) string {
	if len(actions) == 0 {
		return ""
	}
	cells := make([]string, 0, len(actions))
	for _, action := range actions {
		cells = append(cells, c.renderHeaderActionCell(action.label))
	}
	spacer := lipgloss.NewStyle().Background(c.app.Theme.BgSubtle).Render(" ")
	return lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(cells, spacer))
}

func (c *chromeComponent) renderHeaderActionCell(label string) string {
	labelW := lipgloss.Width(label)
	width := lipgloss.Width(label) + 2
	if label == "x" {
		width = 5
	}
	leftPad, rightPad := centeredPadding(labelW, width)
	return lipgloss.NewStyle().
		Foreground(c.app.Theme.Bg).
		Background(c.app.Theme.Primary).
		Bold(true).
		PaddingLeft(leftPad).
		PaddingRight(rightPad).
		Render(label)
}

func (c *chromeComponent) registerHeaderActionHits(startCol int, actions []headerAction, actionBarWidth int) {
	if c.app.height <= 0 || len(actions) == 0 {
		return
	}
	col := startCol
	for i, action := range actions {
		cell := ansi.Strip(c.renderHeaderActionCell(action.label))
		w := lipgloss.Width(cell)
		if i == len(actions)-1 && actionBarWidth > col-startCol {
			w = actionBarWidth - (col - startCol)
		}
		c.app.interaction.registerScreenHit("header:"+action.id, mouseRect{x: col, y: 0, w: w, h: 1}, action.action)
		col += w
		if i < len(actions)-1 {
			col++
		}
	}
}

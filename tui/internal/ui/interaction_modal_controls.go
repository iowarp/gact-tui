package ui

// interaction_modal_controls.go defines modal tabs/steppers/inline options and registers their hit regions.

import (
	"strings"

	"charm.land/lipgloss/v2"
)

type menuTab struct {
	id     string
	label  string
	active bool
	action uiHitAction
}

type modalCellHit struct {
	id     string
	row    int
	col    int
	width  int
	height int
	action uiHitAction
}

type modalInlineOption struct {
	id     string
	label  string
	active bool
	action uiHitAction
}

func splitStepperControlHit(start, end int, increment bool) (int, int) {
	if end <= start {
		return maxInt(0, start), 1
	}
	mid := start + (end-start)/2
	if increment {
		return maxInt(0, mid), maxInt(1, end-mid)
	}
	return maxInt(0, start), maxInt(1, mid-start)
}

func modalStepperControlHits(id string, row int, col int, width int, controlStart int, controlEnd int, selectAction uiHitAction, decrementAction uiHitAction, incrementAction uiHitAction) []modalCellHit {
	hits := make([]modalCellHit, 0, 3)
	if id == "" {
		return hits
	}
	if width < 1 {
		width = 1
	}
	if selectAction != nil {
		hits = append(hits, modalCellHit{
			id:     id,
			row:    row,
			col:    col,
			width:  width,
			height: 1,
			action: selectAction,
		})
	}
	if decrementAction != nil {
		decCol, decWidth := splitStepperControlHit(controlStart, controlEnd, false)
		hits = append(hits, modalCellHit{
			id:     id + ":dec",
			row:    row,
			col:    col + decCol,
			width:  decWidth,
			height: 1,
			action: decrementAction,
		})
	}
	if incrementAction != nil {
		incCol, incWidth := splitStepperControlHit(controlStart, controlEnd, true)
		hits = append(hits, modalCellHit{
			id:     id + ":inc",
			row:    row,
			col:    col + incCol,
			width:  incWidth,
			height: 1,
			action: incrementAction,
		})
	}
	return hits
}

func (c *interactionComponent) registerModalTabsWithLayout(modal string, row int, tabs []menuTab, horizontalPadding, spacing int) {
	_, hits := c.app.modals.renderModalTabsWithHits(tabs, horizontalPadding, spacing)
	for i := range hits {
		hits[i].row = row
	}
	c.registerModalCellHits(modal, 0, hits)
}

func (m *modalkit) renderModalTabsWithLayout(tabs []menuTab, horizontalPadding, spacing int) string {
	row, _ := m.renderModalTabsWithHits(tabs, horizontalPadding, spacing)
	return row
}

func (m *modalkit) renderModalTabsWithHits(tabs []menuTab, horizontalPadding, spacing int) (string, []modalCellHit) {
	cells := make([]string, 0, len(tabs))
	hits := make([]modalCellHit, 0, len(tabs))
	col := 0
	tabBg := m.app.Theme.BgSubtle
	for _, tab := range tabs {
		width := lipgloss.Width(tab.label) + horizontalPadding*2
		style := lipgloss.NewStyle().
			Padding(0, horizontalPadding).
			Foreground(m.app.Theme.FgMuted).
			Background(tabBg)
		if tab.active {
			style = lipgloss.NewStyle().
				Padding(0, horizontalPadding).
				Foreground(m.app.Theme.Bg).
				Background(m.app.Theme.Primary).
				Bold(true)
		}
		cells = append(cells, style.Render(tab.label))
		if tab.id != "" && tab.action != nil {
			hits = append(hits, modalCellHit{
				id:     "tab:" + tab.id,
				col:    col,
				width:  width,
				height: 1,
				action: tab.action,
			})
		}
		col += width + spacing
	}
	spacer := lipgloss.NewStyle().Background(tabBg).Render(strings.Repeat(" ", spacing))
	return lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(cells, spacer)), hits
}

func (c *interactionComponent) registerModalCellHits(modal string, rowOffset int, hits []modalCellHit) {
	c.registerModalCellHitsAt(modal, rowOffset, 0, hits)
}

func (c *interactionComponent) registerModalCellHitsAt(modal string, rowOffset int, colOffset int, hits []modalCellHit) {
	for _, hit := range hits {
		height := hit.height
		if height < 1 {
			height = 1
		}
		c.registerModalContentHit(modal, hit.id, rowOffset+hit.row, colOffset+hit.col, hit.width, height, hit.action)
	}
}

func (m *modalkit) renderModalInlineOptions(prefix string, options []modalInlineOption) (string, []modalCellHit) {
	row := m.app.Theme.HintLabel.Render(prefix)
	col := lipgloss.Width(prefix)
	hits := make([]modalCellHit, 0, len(options))
	for _, opt := range options {
		if opt.label == "" {
			continue
		}
		raw := " " + opt.label + " "
		style := m.app.Theme.HintLabel
		if opt.active {
			style = lipgloss.NewStyle().
				Foreground(m.app.Theme.Bg).
				Background(m.app.Theme.Primary).
				Bold(true)
		}
		row += style.Render(raw)
		width := lipgloss.Width(raw)
		if opt.id != "" && opt.action != nil {
			hits = append(hits, modalCellHit{
				id:     opt.id,
				col:    col,
				width:  width,
				height: 1,
				action: opt.action,
			})
		}
		col += width
	}
	return row, hits
}

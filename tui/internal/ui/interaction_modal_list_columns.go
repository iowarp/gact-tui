package ui

// interaction_modal_list_columns.go renders a modal list in column layout.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (m *modalkit) renderModalListColumns(items []modalListItem, opts modalListOptions) modalListRender {
	width := opts.width
	if width < 1 {
		width = 1
	}
	columns := opts.columns
	if columns < 2 {
		columns = 2
	}
	if columns > len(items) && len(items) > 0 {
		columns = len(items)
	}
	gap := opts.columnGap
	if gap <= 0 {
		gap = 4
	}
	minColumnWidth := opts.minColumnWidth
	if minColumnWidth <= 0 {
		minColumnWidth = 28
	}
	for columns > 1 && (width-gap*(columns-1))/columns < minColumnWidth {
		columns--
	}
	if columns <= 1 {
		fallback := opts
		fallback.columns = 1
		return m.renderModalList(items, fallback)
	}
	columnWidth := (width - gap*(columns-1)) / columns
	if columnWidth < 1 {
		columnWidth = 1
	}
	rowBudget := opts.rowBudget
	if rowBudget < 1 {
		rowBudget = (len(items) + columns - 1) / columns
	}
	rowsNeeded := (len(items) + columns - 1) / columns
	rowsToRender := valuefmt.MinInt(rowBudget, rowsNeeded)
	rows := make([]string, 0, rowsToRender)
	hits := make([]modalListHit, 0, valuefmt.MinInt(len(items), rowsToRender*columns))
	gapText := lipgloss.NewStyle().Background(m.app.Theme.BgSubtle).Render(strings.Repeat(" ", gap))
	cellStyle := lipgloss.NewStyle().Background(m.app.Theme.BgSubtle).Width(columnWidth)
	for row := 0; row < rowsToRender; row++ {
		cells := make([]string, 0, columns)
		for column := 0; column < columns; column++ {
			idx := column*rowsToRender + row
			cell := ""
			if idx < len(items) {
				item := items[idx]
				cell = m.renderModalListItemLine(item, columnWidth)
				if item.action != nil {
					hits = append(hits, modalListHit{
						id:     item.id,
						row:    row,
						col:    column * (columnWidth + gap),
						width:  columnWidth,
						height: 1,
						action: item.action,
					})
				}
			}
			cells = append(cells, cellStyle.Render(cell))
		}
		rows = append(rows, strings.Join(cells, gapText))
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

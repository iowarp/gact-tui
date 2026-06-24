package ui

// sidebar_layout_editor_view.go renders the sidebar layout editor and its module labels.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (c *sidebarComponent) layoutButtons() []menuButton {
	return []menuButton{
		{
			id:       "sidebar-layout:left",
			label:    "<",
			disabled: !c.canTransferLayoutModule(-1),
			action: func(app *App) tea.Cmd {
				app.sidebar.transferLayoutModule(-1)
				return nil
			},
		},
		{
			id:       "sidebar-layout:up",
			label:    "^",
			disabled: !c.canReorderLayoutModule(-1),
			action: func(app *App) tea.Cmd {
				app.sidebar.reorderLayoutModule(-1)
				return nil
			},
		},
		{
			id:       "sidebar-layout:down",
			label:    "v",
			disabled: !c.canReorderLayoutModule(1),
			action: func(app *App) tea.Cmd {
				app.sidebar.reorderLayoutModule(1)
				return nil
			},
		},
		{
			id:       "sidebar-layout:right",
			label:    ">",
			disabled: !c.canTransferLayoutModule(1),
			action: func(app *App) tea.Cmd {
				app.sidebar.transferLayoutModule(1)
				return nil
			},
		},
		{id: "sidebar-layout:reset", label: "reset", action: func(app *App) tea.Cmd {
			app.sidebar.resetLayoutEditor()
			return nil
		}},
		closeMenuButton("sidebar-layout:close", func(app *App) { app.sidebar.closeLayoutEditor() }),
	}
}

func (c *sidebarComponent) viewLayoutEditor() string {
	c.clampLayoutEditorSelection()
	t := c.app.Theme
	w := c.app.modals.modalWidth()
	innerW := modalInnerWidth(w)
	columns := c.layoutColumns()
	gap := 2
	if len(columns) == 1 {
		gap = 0
	}
	colW := (innerW - gap*(len(columns)-1)) / len(columns)
	if colW < 18 {
		colW = 18
	}
	maxRows := 0
	for _, column := range columns {
		if len(column.modules) > maxRows {
			maxRows = len(column.modules)
		}
	}
	if maxRows < 1 {
		maxRows = 1
	}

	bodyRows := make([]string, 0, maxRows+3)
	headerCells := make([]string, 0, len(columns))
	for _, column := range columns {
		titleStyle := lipgloss.NewStyle().Foreground(t.Primary).Bold(true).Width(colW)
		if column.id == c.app.sidebarLayout.col {
			titleStyle = titleStyle.Foreground(t.Secondary)
		}
		headerCells = append(headerCells, titleStyle.Render(column.title))
	}
	bodyRows = append(bodyRows, strings.Join(headerCells, strings.Repeat(" ", gap)))

	hits := []modalCellHit{}
	for row := 0; row < maxRows; row++ {
		cells := make([]string, 0, len(columns))
		for colIdx, column := range columns {
			cell := strings.Repeat(" ", colW)
			if row < len(column.modules) {
				id := column.modules[row]
				item := modalListItem{
					title:    c.layoutModuleLabel(id),
					meta:     c.layoutModuleMeta(id, column.id),
					selected: column.id == c.app.sidebarLayout.col && row == c.app.sidebarLayout.sel[column.id],
				}
				if item.selected && c.layoutGrabbed {
					item.meta = "moving"
				}
				cell = c.app.modals.renderModalListItemLine(item, colW)
				col := colIdx * (colW + gap)
				columnID := column.id
				rowIdx := row
				hits = append(hits, modalCellHit{
					id:     "sidebar-layout:" + sidebarLayoutColumnID(columnID) + ":" + string(id),
					row:    row + 1,
					col:    col,
					width:  colW,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.sidebarLayout.setColumn(columnID)
						app.sidebarLayout.setSel(columnID, rowIdx)
						return nil
					},
				})
			}
			cells = append(cells, lipgloss.NewStyle().Width(colW).Render(cell))
		}
		bodyRows = append(bodyRows, strings.Join(cells, strings.Repeat(" ", gap)))
	}
	bodyRows = append(bodyRows, "")
	bodyRows = append(bodyRows, t.HintLabel.Render("j/k select  Tab column  arrows/buttons move module  Enter grab/drop  r reset  Esc close"))

	buttons := c.layoutButtons()
	rendered := c.app.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:   w,
		title:   "Sidebar layout",
		buttons: buttons,
		body:    lipgloss.JoinVertical(lipgloss.Left, bodyRows...),
	})
	c.app.interaction.registerModalCellHits(rendered.modal, rendered.bodyRow, hits)
	return rendered.modal
}

func sidebarLayoutColumnID(id int) string {
	switch id {
	case sidebarLayoutColumnLeft:
		return "left"
	case sidebarLayoutColumnRight:
		return "right"
	default:
		return "available"
	}
}

func (c *sidebarComponent) layoutModuleLabel(id sidebarModuleID) string {
	if def, ok := sidebarModuleRegistry()[id]; ok && def.Title != "" {
		return c.app.localizer.t(def.Title, nil)
	}
	return string(id)
}

func (c *sidebarComponent) layoutModuleMeta(id sidebarModuleID, column int) string {
	if _, ok := sidebarModuleRegistry()[id]; !ok {
		return "unknown id"
	}
	switch column {
	case sidebarLayoutColumnLeft:
		return "shown on left"
	case sidebarLayoutColumnRight:
		return "shown on right"
	default:
		return "hidden; not shown"
	}
}

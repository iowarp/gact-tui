package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

const (
	sidebarLayoutColumnLeft = iota
	sidebarLayoutColumnAvailable
	sidebarLayoutColumnRight
	sidebarLayoutColumnCount
)

type sidebarLayoutColumnView struct {
	id      int
	title   string
	modules []sidebarModuleID
}

func (a *App) openSidebarLayoutEditor() {
	if !a.sidebarLayoutConfigured && len(a.sidebarModuleIDs) == 0 && len(a.rightSidebarModuleIDs) == 0 {
		a.sidebarModuleIDs = defaultSidebarModuleIDs()
	}
	a.sidebarLayoutOpen = true
	a.sidebarLayoutConfigured = true
	a.clampSidebarLayoutEditorSelection()
}

func (a *App) closeSidebarLayoutEditor() {
	a.sidebarLayoutOpen = false
	a.sidebarLayoutGrabbed = false
}

func (a *App) resetSidebarLayoutEditor() {
	a.sidebarModuleIDs = defaultSidebarModuleIDs()
	a.rightSidebarModuleIDs = nil
	a.sidebarLayoutConfigured = false
	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel = [3]int{}
	a.sidebarLayoutGrabbed = false
	a.persistPrefs()
}

func (a *App) sidebarLayoutColumns() []sidebarLayoutColumnView {
	left, right := a.effectiveSidebarLayoutIDs()
	available := a.availableSidebarModuleIDs(left, right)
	columns := []sidebarLayoutColumnView{}
	if len(left) > 0 || a.sidebarLayoutGrabbed || a.sidebarLayoutCol == sidebarLayoutColumnLeft {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnLeft, title: "Left", modules: left})
	}
	if len(available) > 0 || a.sidebarLayoutGrabbed || a.sidebarLayoutCol == sidebarLayoutColumnAvailable {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnAvailable, title: "Available", modules: available})
	}
	if len(right) > 0 || a.sidebarLayoutGrabbed || a.sidebarLayoutCol == sidebarLayoutColumnRight {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnRight, title: "Right", modules: right})
	}
	if len(columns) == 0 {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnAvailable, title: "Available", modules: defaultSidebarModuleIDs()})
	}
	return columns
}

func (a *App) availableSidebarModuleIDs(left []sidebarModuleID, right []sidebarModuleID) []sidebarModuleID {
	placed := map[sidebarModuleID]bool{}
	for _, id := range left {
		placed[id] = true
	}
	for _, id := range right {
		placed[id] = true
	}
	registry := sidebarModuleRegistry()
	ids := defaultSidebarModuleIDs()
	for id := range registry {
		if !containsSidebarModuleID(ids, id) {
			ids = append(ids, id)
		}
	}
	out := make([]sidebarModuleID, 0, len(ids))
	for _, id := range ids {
		if !placed[id] {
			out = append(out, id)
		}
	}
	return out
}

func containsSidebarModuleID(ids []sidebarModuleID, needle sidebarModuleID) bool {
	for _, id := range ids {
		if id == needle {
			return true
		}
	}
	return false
}

func (a *App) activeSidebarLayoutColumn() sidebarLayoutColumnView {
	columns := a.sidebarLayoutColumns()
	for _, column := range columns {
		if column.id == a.sidebarLayoutCol {
			return column
		}
	}
	a.sidebarLayoutCol = columns[0].id
	return columns[0]
}

func (a *App) clampSidebarLayoutEditorSelection() {
	columns := a.sidebarLayoutColumns()
	found := false
	for _, column := range columns {
		if column.id == a.sidebarLayoutCol {
			found = true
		}
		if len(column.modules) == 0 {
			a.sidebarLayoutSel[column.id] = 0
			continue
		}
		a.sidebarLayoutSel[column.id] = clampSelection(a.sidebarLayoutSel[column.id], len(column.modules))
	}
	if !found {
		a.sidebarLayoutCol = columns[0].id
	}
}

func (a *App) handleSidebarLayoutKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	a.clampSidebarLayoutEditorSelection()
	switch k.String() {
	case "esc", "q", "ctrl+s":
		a.closeSidebarLayoutEditor()
		return a, nil
	case "up", "k":
		if a.sidebarLayoutGrabbed {
			a.reorderSidebarLayoutModule(-1)
			return a, nil
		}
		a.moveSidebarLayoutSelection(-1)
		return a, nil
	case "down", "j":
		if a.sidebarLayoutGrabbed {
			a.reorderSidebarLayoutModule(1)
			return a, nil
		}
		a.moveSidebarLayoutSelection(1)
		return a, nil
	case "left", "h":
		if a.sidebarLayoutGrabbed {
			a.transferSidebarLayoutModule(-1)
		} else {
			a.focusNextSidebarLayoutColumn(-1)
		}
		return a, nil
	case "right", "l":
		if a.sidebarLayoutGrabbed {
			a.transferSidebarLayoutModule(1)
		} else {
			a.focusNextSidebarLayoutColumn(1)
		}
		return a, nil
	case "enter", " ":
		if _, ok := a.selectedSidebarLayoutModule(); ok {
			a.sidebarLayoutGrabbed = !a.sidebarLayoutGrabbed
		}
		return a, nil
	case "r":
		a.resetSidebarLayoutEditor()
		return a, nil
	}
	return a, nil
}

func defaultSidebarLayoutTransfer(column int) int {
	if column == sidebarLayoutColumnRight {
		return -1
	}
	return 1
}

func (a *App) focusNextSidebarLayoutColumn(delta int) {
	columns := a.sidebarLayoutColumns()
	pos := 0
	for i, column := range columns {
		if column.id == a.sidebarLayoutCol {
			pos = i
			break
		}
	}
	pos = (pos + delta) % len(columns)
	if pos < 0 {
		pos += len(columns)
	}
	a.sidebarLayoutCol = columns[pos].id
	a.clampSidebarLayoutEditorSelection()
}

func (a *App) moveSidebarLayoutSelection(delta int) {
	column := a.activeSidebarLayoutColumn()
	if len(column.modules) == 0 {
		return
	}
	a.sidebarLayoutSel[column.id] = moveSelection(a.sidebarLayoutSel[column.id], len(column.modules), delta)
}

func (a *App) selectedSidebarLayoutModule() (sidebarModuleID, bool) {
	column := a.activeSidebarLayoutColumn()
	if len(column.modules) == 0 {
		return "", false
	}
	idx := clampSelection(a.sidebarLayoutSel[column.id], len(column.modules))
	return column.modules[idx], true
}

func (a *App) transferSidebarLayoutModule(delta int) {
	id, ok := a.selectedSidebarLayoutModule()
	if !ok || delta == 0 {
		return
	}
	target := a.sidebarLayoutCol + delta
	if target < sidebarLayoutColumnLeft {
		target = sidebarLayoutColumnLeft
	}
	if target > sidebarLayoutColumnRight {
		target = sidebarLayoutColumnRight
	}
	if target == a.sidebarLayoutCol {
		return
	}
	left, right := a.effectiveSidebarLayoutIDs()
	left = removeSidebarModuleID(left, id)
	right = removeSidebarModuleID(right, id)
	switch target {
	case sidebarLayoutColumnLeft:
		left = append(left, id)
	case sidebarLayoutColumnRight:
		right = append(right, id)
	case sidebarLayoutColumnAvailable:
		// Available means hidden; keep it out of both sidebars.
	}
	a.sidebarModuleIDs = left
	a.rightSidebarModuleIDs = right
	a.sidebarLayoutConfigured = true
	a.sidebarLayoutCol = target
	if idx, ok := a.indexSidebarLayoutModule(target, id); ok {
		a.sidebarLayoutSel[target] = idx
	} else {
		a.sidebarLayoutSel[target] = 0
	}
	a.clampSidebarLayoutEditorSelection()
	a.persistPrefs()
}

func (a *App) indexSidebarLayoutModule(columnID int, id sidebarModuleID) (int, bool) {
	for _, column := range a.sidebarLayoutColumns() {
		if column.id != columnID {
			continue
		}
		for idx, existing := range column.modules {
			if existing == id {
				return idx, true
			}
		}
	}
	return 0, false
}

func (a *App) reorderSidebarLayoutModule(delta int) {
	if delta == 0 || a.sidebarLayoutCol == sidebarLayoutColumnAvailable {
		return
	}
	column := a.activeSidebarLayoutColumn()
	if len(column.modules) < 2 {
		return
	}
	idx := clampSelection(a.sidebarLayoutSel[column.id], len(column.modules))
	next := idx + delta
	if next < 0 || next >= len(column.modules) {
		return
	}
	modules := append([]sidebarModuleID(nil), column.modules...)
	modules[idx], modules[next] = modules[next], modules[idx]
	switch column.id {
	case sidebarLayoutColumnLeft:
		a.sidebarModuleIDs = modules
	case sidebarLayoutColumnRight:
		a.rightSidebarModuleIDs = modules
	}
	a.sidebarLayoutConfigured = true
	a.sidebarLayoutSel[column.id] = next
	a.persistPrefs()
}

func (a *App) viewSidebarLayoutEditor() string {
	a.clampSidebarLayoutEditorSelection()
	t := a.Theme
	w := a.modalWidth()
	innerW := modalInnerWidth(w)
	columns := a.sidebarLayoutColumns()
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
		if column.id == a.sidebarLayoutCol {
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
					title:    a.sidebarLayoutModuleLabel(id),
					meta:     a.sidebarLayoutModuleMeta(id, column.id),
					selected: column.id == a.sidebarLayoutCol && row == a.sidebarLayoutSel[column.id],
				}
				if item.selected && a.sidebarLayoutGrabbed {
					item.meta = "moving"
				}
				cell = a.renderModalListItemLine(item, colW)
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
						app.sidebarLayoutCol = columnID
						app.sidebarLayoutSel[columnID] = rowIdx
						return nil
					},
				})
			}
			cells = append(cells, lipgloss.NewStyle().Width(colW).Render(cell))
		}
		bodyRows = append(bodyRows, strings.Join(cells, strings.Repeat(" ", gap)))
	}
	bodyRows = append(bodyRows, "")
	bodyRows = append(bodyRows, t.HintLabel.Render("↑/↓ select  ←/→ column  Enter grab/drop  arrows move grabbed  r reset  Esc close"))

	buttons := []menuButton{
		{id: "sidebar-layout:reset", label: "reset", action: func(app *App) tea.Cmd {
			app.resetSidebarLayoutEditor()
			return nil
		}},
		closeMenuButton("sidebar-layout:close", func(app *App) { app.closeSidebarLayoutEditor() }),
	}
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width:   w,
		title:   "Sidebar layout",
		buttons: buttons,
		body:    lipgloss.JoinVertical(lipgloss.Left, bodyRows...),
	})
	a.registerModalCellHits(rendered.modal, rendered.bodyRow, hits)
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

func (a *App) sidebarLayoutModuleLabel(id sidebarModuleID) string {
	if def, ok := sidebarModuleRegistry()[id]; ok && def.Title != "" {
		return a.localizer.t(def.Title, nil)
	}
	return string(id)
}

func (a *App) sidebarLayoutModuleMeta(id sidebarModuleID, column int) string {
	if _, ok := sidebarModuleRegistry()[id]; !ok {
		return "unknown module"
	}
	switch column {
	case sidebarLayoutColumnLeft:
		return "left"
	case sidebarLayoutColumnRight:
		return "right"
	default:
		return "hidden"
	}
}

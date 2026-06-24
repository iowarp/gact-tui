package ui

// sidebarLayoutModal: the sidebar module-layout editor overlay.

import (
	tea "charm.land/bubbletea/v2"
)

// sidebarLayoutModal holds only the layout editor's transient cursor: whether
// it is open, the focused column, and the per-column selection. The persisted
// module lists and the grab/configured flags stay on App proper.
type sidebarLayoutModal struct {
	app  *App
	open bool
	col  int
	sel  [3]int
}

// openModal marks the layout editor overlay open. The persisted module lists
// and grab/configured flags stay on sidebarComponent, so the caller is
// responsible for those; this method owns only the modal's transient cursor.
func (m *sidebarLayoutModal) openModal() { m.open = true }

// close marks the layout editor overlay closed.
func (m *sidebarLayoutModal) close() { m.open = false }

// reset returns the modal cursor to its default column and selection.
func (m *sidebarLayoutModal) reset() {
	m.col = sidebarLayoutColumnLeft
	m.sel = [3]int{}
}

// setColumn moves the focused column.
func (m *sidebarLayoutModal) setColumn(col int) { m.col = col }

// setSel sets the per-column selection row for the given column.
func (m *sidebarLayoutModal) setSel(col, row int) { m.sel[col] = row }

func (c *sidebarComponent) openLayoutEditor() {
	if !c.layoutConfigured && len(c.moduleIDs) == 0 && len(c.rightSidebarModuleIDs) == 0 {
		c.moduleIDs = defaultSidebarModuleIDs()
	}
	c.app.sidebarLayout.openModal()
	c.layoutConfigured = true
	c.clampLayoutEditorSelection()
}

func (c *sidebarComponent) closeLayoutEditor() {
	c.app.sidebarLayout.close()
	c.layoutGrabbed = false
}

func (c *sidebarComponent) resetLayoutEditor() {
	c.moduleIDs = defaultSidebarModuleIDs()
	c.rightSidebarModuleIDs = nil
	c.layoutConfigured = false
	c.app.sidebarLayout.reset()
	c.layoutGrabbed = false
	c.app.settings.persistPrefs()
}

func (c *sidebarComponent) handleLayoutKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	c.clampLayoutEditorSelection()
	switch k.String() {
	case "esc", "q", "ctrl+s":
		c.closeLayoutEditor()
		return c.app, nil
	case "tab", "ctrl+i":
		c.focusNextLayoutColumn(1)
		return c.app, nil
	case "shift+tab":
		c.focusNextLayoutColumn(-1)
		return c.app, nil
	case "up", "k":
		if k.String() == "k" && !c.layoutGrabbed {
			c.moveLayoutSelection(-1)
			return c.app, nil
		}
		if c.layoutGrabbed {
			c.reorderLayoutModule(-1)
			return c.app, nil
		}
		c.reorderLayoutModule(-1)
		return c.app, nil
	case "down", "j":
		if k.String() == "j" && !c.layoutGrabbed {
			c.moveLayoutSelection(1)
			return c.app, nil
		}
		if c.layoutGrabbed {
			c.reorderLayoutModule(1)
			return c.app, nil
		}
		c.reorderLayoutModule(1)
		return c.app, nil
	case "left", "h":
		if k.String() == "h" && !c.layoutGrabbed {
			c.focusNextLayoutColumn(-1)
			return c.app, nil
		}
		if c.layoutGrabbed {
			c.transferLayoutModule(-1)
		} else {
			c.transferLayoutModule(-1)
		}
		return c.app, nil
	case "right", "l":
		if k.String() == "l" && !c.layoutGrabbed {
			c.focusNextLayoutColumn(1)
			return c.app, nil
		}
		if c.layoutGrabbed {
			c.transferLayoutModule(1)
		} else {
			c.transferLayoutModule(1)
		}
		return c.app, nil
	case "enter", " ":
		if _, ok := c.selectedLayoutModule(); ok {
			c.layoutGrabbed = !c.layoutGrabbed
		}
		return c.app, nil
	case "r":
		c.resetLayoutEditor()
		return c.app, nil
	}
	return c.app, nil
}

func (c *sidebarComponent) focusNextLayoutColumn(delta int) {
	columns := c.layoutColumns()
	pos := 0
	for i, column := range columns {
		if column.id == c.app.sidebarLayout.col {
			pos = i
			break
		}
	}
	pos = (pos + delta) % len(columns)
	if pos < 0 {
		pos += len(columns)
	}
	c.app.sidebarLayout.col = columns[pos].id
	c.clampLayoutEditorSelection()
}

func (c *sidebarComponent) moveLayoutSelection(delta int) {
	column := c.activeLayoutColumn()
	if len(column.modules) == 0 {
		return
	}
	c.app.sidebarLayout.sel[column.id] = moveSelection(c.app.sidebarLayout.sel[column.id], len(column.modules), delta)
}

func (c *sidebarComponent) selectedLayoutModule() (sidebarModuleID, bool) {
	column := c.activeLayoutColumn()
	if len(column.modules) == 0 {
		return "", false
	}
	idx := clampSelection(c.app.sidebarLayout.sel[column.id], len(column.modules))
	return column.modules[idx], true
}

func (c *sidebarComponent) transferLayoutModule(delta int) {
	id, ok := c.selectedLayoutModule()
	if !ok || delta == 0 {
		return
	}
	target := c.app.sidebarLayout.col + delta
	if target < sidebarLayoutColumnLeft {
		target = sidebarLayoutColumnLeft
	}
	if target > sidebarLayoutColumnRight {
		target = sidebarLayoutColumnRight
	}
	if target == c.app.sidebarLayout.col {
		return
	}
	left, right := c.effectiveLayoutIDs()
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
	c.moduleIDs = left
	c.rightSidebarModuleIDs = right
	c.layoutConfigured = true
	c.app.sidebarLayout.col = target
	if idx, ok := c.indexLayoutModule(target, id); ok {
		c.app.sidebarLayout.sel[target] = idx
	} else {
		c.app.sidebarLayout.sel[target] = 0
	}
	c.clampLayoutEditorSelection()
	c.app.settings.persistPrefs()
}

func (c *sidebarComponent) reorderLayoutModule(delta int) {
	if delta == 0 || c.app.sidebarLayout.col == sidebarLayoutColumnAvailable {
		return
	}
	column := c.activeLayoutColumn()
	if len(column.modules) < 2 {
		return
	}
	idx := clampSelection(c.app.sidebarLayout.sel[column.id], len(column.modules))
	next := idx + delta
	if next < 0 || next >= len(column.modules) {
		return
	}
	modules := append([]sidebarModuleID(nil), column.modules...)
	modules[idx], modules[next] = modules[next], modules[idx]
	switch column.id {
	case sidebarLayoutColumnLeft:
		c.moduleIDs = modules
	case sidebarLayoutColumnRight:
		c.rightSidebarModuleIDs = modules
	}
	c.layoutConfigured = true
	c.app.sidebarLayout.sel[column.id] = next
	c.app.settings.persistPrefs()
}

func (c *sidebarComponent) canTransferLayoutModule(delta int) bool {
	if _, ok := c.selectedLayoutModule(); !ok || delta == 0 {
		return false
	}
	target := c.app.sidebarLayout.col + delta
	return target >= sidebarLayoutColumnLeft && target <= sidebarLayoutColumnRight && target != c.app.sidebarLayout.col
}

func (c *sidebarComponent) canReorderLayoutModule(delta int) bool {
	if delta == 0 || c.app.sidebarLayout.col == sidebarLayoutColumnAvailable {
		return false
	}
	column := c.activeLayoutColumn()
	if len(column.modules) < 2 {
		return false
	}
	idx := clampSelection(c.app.sidebarLayout.sel[column.id], len(column.modules))
	next := idx + delta
	return next >= 0 && next < len(column.modules)
}

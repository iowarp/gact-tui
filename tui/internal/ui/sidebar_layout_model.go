package ui

// sidebar_layout_model.go models the sidebar layout columns and module placement for the editor.

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

func (c *sidebarComponent) layoutColumns() []sidebarLayoutColumnView {
	left, right := c.effectiveLayoutIDs()
	available := c.availableModuleIDs(left, right)
	columns := []sidebarLayoutColumnView{}
	if len(left) > 0 || c.layoutGrabbed || c.app.sidebarLayout.col == sidebarLayoutColumnLeft {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnLeft, title: "Left", modules: left})
	}
	if len(available) > 0 || c.layoutGrabbed || c.app.sidebarLayout.col == sidebarLayoutColumnAvailable {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnAvailable, title: "Available", modules: available})
	}
	if len(right) > 0 || c.layoutGrabbed || c.app.sidebarLayout.col == sidebarLayoutColumnRight {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnRight, title: "Right", modules: right})
	}
	if len(columns) == 0 {
		columns = append(columns, sidebarLayoutColumnView{id: sidebarLayoutColumnAvailable, title: "Available", modules: defaultSidebarModuleIDs()})
	}
	return columns
}

func (c *sidebarComponent) availableModuleIDs(left []sidebarModuleID, right []sidebarModuleID) []sidebarModuleID {
	placed := map[sidebarModuleID]bool{}
	for _, id := range left {
		placed[id] = true
	}
	for _, id := range right {
		placed[id] = true
	}
	ids := defaultSidebarModuleIDs()
	for _, id := range sidebarModuleRegistryOrder() {
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

func (c *sidebarComponent) activeLayoutColumn() sidebarLayoutColumnView {
	columns := c.layoutColumns()
	for _, column := range columns {
		if column.id == c.app.sidebarLayout.col {
			return column
		}
	}
	c.app.sidebarLayout.col = columns[0].id
	return columns[0]
}

func (c *sidebarComponent) clampLayoutEditorSelection() {
	columns := c.layoutColumns()
	found := false
	for _, column := range columns {
		if column.id == c.app.sidebarLayout.col {
			found = true
		}
		if len(column.modules) == 0 {
			c.app.sidebarLayout.sel[column.id] = 0
			continue
		}
		c.app.sidebarLayout.sel[column.id] = clampSelection(c.app.sidebarLayout.sel[column.id], len(column.modules))
	}
	if !found {
		c.app.sidebarLayout.col = columns[0].id
	}
}

func (c *sidebarComponent) indexLayoutModule(columnID int, id sidebarModuleID) (int, bool) {
	for _, column := range c.layoutColumns() {
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

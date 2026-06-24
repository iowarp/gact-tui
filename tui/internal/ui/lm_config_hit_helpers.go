package ui

// lm_config_hit_helpers.go registers LM-config box/list/advanced/save mouse hit regions.

import tea "charm.land/bubbletea/v2"

func (c *lmConfigComponent) registerBoxListRegion(modal string, top int, col int, width int, list modalListRender) {
	c.app.interaction.registerModalListRegion(modal, lmConfigBoxContentTop(top), col, width, list, "", nil)
}

func (c *lmConfigComponent) registerAdvancedHits(modal string, top, col, width int) {
	if !c.open {
		return
	}
	_, hits := c.renderAdvancedRowsAndHits(width)
	c.registerBoxCellHits(modal, top, col, hits)
}

func (c *lmConfigComponent) registerBoxCellHits(modal string, top int, col int, hits []modalCellHit) {
	c.app.interaction.registerModalCellHitsAt(modal, lmConfigBoxContentTop(top), col, hits)
}

func (c *lmConfigComponent) registerBoxWheelRegion(modal string, id string, top int, col int, width int, visibleRows int, action uiWheelAction) {
	if visibleRows <= 0 {
		return
	}
	c.app.interaction.registerModalWheelRegion(modal, id, top, col, width, lmConfigBoxHeight(visibleRows), action)
}

func (c *lmConfigComponent) registerSaveHit(modal string, bodyTop, innerW, bodyRows int, layout lmConfigLayout) {
	if layout.buttonRows <= 0 {
		return
	}
	canSave := false
	if p := c.currentPreset(); p != nil {
		canSave = c.canSave(*p)
	}
	if !canSave {
		return
	}
	row := bodyTop + bodyRows - layout.buttonRows
	if layout.buttonRows >= 3 {
		row++
	}
	buttons := []menuButton{c.saveMenuButton(false)}
	_, startCol := c.app.modals.renderCenteredModalButtons(innerW, buttons, -1)
	c.app.interaction.registerModalButtons(modal, row, startCol, buttons)
}

func (c *lmConfigComponent) saveMenuButton(disabled bool) menuButton {
	return menuButton{
		id:       "lm-config:save",
		label:    "Save and connect",
		disabled: disabled,
		action: func(app *App) tea.Cmd {
			if !app.lmConfig.open {
				return nil
			}
			app.lmConfig.field = lmFieldSave
			return app.lmConfig.dispatch()
		},
	}
}

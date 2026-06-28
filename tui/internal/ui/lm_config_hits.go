package ui

// lm_config_hits.go registers LM-config provider/model rail and wheel hit targets.

import tea "charm.land/bubbletea/v2"

func (c *lmConfigComponent) registerHitTargets(modal string, bodyTop, innerW int, bodyRows int) {
	if !c.open || c.info == nil {
		return
	}
	layout := c.layout(innerW, bodyRows)
	leftW, rightW := lmConfigGridWidths(innerW)
	stacked := leftW < 38 || rightW < 38
	providerTop := bodyTop
	selectedTop := bodyTop
	modelTop := bodyTop
	advancedTop := bodyTop
	modelCol := 0
	selectedCol := 0
	providerW := leftW
	selectedW := rightW
	modelW := leftW
	advancedW := rightW
	advancedCol := leftW + 2
	if stacked {
		providerW = innerW
		selectedW = innerW
		modelW = innerW
		advancedW = innerW
		advancedCol = 0
		selectedTop = providerTop + lmConfigBoxHeight(layout.providerRows) + layout.gridGapRows
		modelTop = selectedTop + lmConfigBoxHeight(layout.selectedRows) + layout.gridGapRows
		advancedTop = modelTop + lmConfigBoxHeight(layout.modelRows) + layout.gridGapRows
	} else {
		selectedCol = leftW + 2
		if layout.compact {
			c.registerProviderWheelHit(modal, providerTop, 0, leftW, layout.providerRows)
			c.registerProviderHeaderHit(modal, providerTop, 0, leftW)
			c.registerProviderHits(modal, providerTop, 0, leftW, layout.providerRows)
			c.registerProviderRailHits(modal, providerTop, 0, leftW, layout.providerRows)
			c.registerProviderActionHits(modal, selectedTop, selectedCol, rightW, layout.selectedRows)
			return
		}
		modelTop = providerTop + lmConfigBoxHeight(layout.providerRows) + layout.gridGapRows
		advancedTop = modelTop
	}
	c.registerProviderWheelHit(modal, providerTop, 0, providerW, layout.providerRows)
	c.registerProviderHeaderHit(modal, providerTop, 0, providerW)
	c.registerProviderHits(modal, providerTop, 0, providerW, layout.providerRows)
	c.registerProviderRailHits(modal, providerTop, 0, providerW, layout.providerRows)
	c.registerProviderActionHits(modal, selectedTop, selectedCol, selectedW, layout.selectedRows)
	c.registerModelWheelHit(modal, modelTop, modelCol, modelW, layout.modelRows)
	c.registerModelHeaderHit(modal, modelTop, modelCol, modelW)
	c.registerModelHits(modal, modelTop, modelCol, modelW, layout.modelRows)
	c.registerModelRailHits(modal, modelTop, modelCol, modelW, layout.modelRows)
	c.registerAdvancedWheelHit(modal, advancedTop, advancedCol, advancedW, layout.configRows)
	c.registerAdvancedHits(modal, advancedTop, advancedCol, advancedW)
	c.registerSaveHit(modal, bodyTop, innerW, bodyRows, layout)
}

func lmConfigBoxHeight(visibleRows int) int {
	return maxInt(1, visibleRows) + 3
}

func (c *lmConfigComponent) registerProviderWheelHit(modal string, top, col, width, visibleRows int) {
	c.registerBoxWheelRegion(modal, "lm-config:provider:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.lmConfig.handleProviderWheel(button)
	})
}

func (c *lmConfigComponent) registerProviderHeaderHit(modal string, top, col, width int) {
	c.app.interaction.registerModalCellHits(modal, 0, []modalCellHit{{
		id:    "lm-config:provider:filter",
		row:   top + 1,
		col:   col,
		width: width,
		action: func(app *App) tea.Cmd {
			if app.lmConfig.open {
				app.lmConfig.field = lmFieldPreset
			}
			return nil
		},
	}})
}

func (c *lmConfigComponent) registerModelWheelHit(modal string, top, col, width, visibleRows int) {
	c.registerBoxWheelRegion(modal, "lm-config:model:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.lmConfig.handleModelWheel(button)
	})
}

func (c *lmConfigComponent) registerProviderRailHits(modal string, top, col, width, visibleRows int) {
	if !c.open || c.info == nil || visibleRows <= 1 {
		return
	}
	indexes := c.providerIndexes()
	railCol := lmConfigBoxRailCol(col, width)
	c.app.interaction.registerModalIndexedListRailHits(modal, "lm-config:provider", lmConfigBoxContentTop(top), railCol, visibleRows, indexes, func(app *App, presetIdx int) tea.Cmd {
		if !app.lmConfig.open || app.lmConfig.info == nil {
			return nil
		}
		if presetIdx < 0 || presetIdx >= len(app.lmConfig.info.Presets) {
			return nil
		}
		app.lmConfig.field = lmFieldPreset
		app.lmConfig.selected = presetIdx
		return app.lmConfig.syncFromPreset()
	})
}

func (c *lmConfigComponent) registerModelRailHits(modal string, top, col, width, visibleRows int) {
	if !c.open || c.info == nil || visibleRows <= 1 {
		return
	}
	modelIndexes := c.modelIndexes()
	railCol := lmConfigBoxRailCol(col, width)
	c.app.interaction.registerModalIndexedListRailHits(modal, "lm-config:model", lmConfigBoxContentTop(top), railCol, visibleRows, modelIndexes, func(app *App, modelIdx int) tea.Cmd {
		if !app.lmConfig.open {
			return nil
		}
		pid := app.lmConfig.currentPresetID()
		catalog := app.lmConfig.modelCatalogs[pid]
		if modelIdx < 0 || modelIdx >= len(catalog) {
			return nil
		}
		app.lmConfig.field = lmFieldModel
		app.lmConfig.modelIndex = modelIdx
		app.lmConfig.model = catalog[modelIdx].ID
		return nil
	})
}

func (c *lmConfigComponent) registerModelHeaderHit(modal string, top, col, width int) {
	if !c.open || !c.lmConfigSelectedModelSelectable() {
		return
	}
	c.app.interaction.registerModalCellHits(modal, 0, []modalCellHit{{
		id:    "lm-config:model:filter",
		row:   top + 1,
		col:   col,
		width: width,
		action: func(app *App) tea.Cmd {
			if app.lmConfig.open {
				app.lmConfig.field = lmFieldModel
			}
			return nil
		},
	}})
}

func (c *lmConfigComponent) registerAdvancedWheelHit(modal string, top, col, width, visibleRows int) {
	c.registerBoxWheelRegion(modal, "lm-config:advanced:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		app.lmConfig.handleAdvancedWheel(button)
		return nil
	})
}

func (c *lmConfigComponent) registerProviderHits(modal string, top, col, width, visibleRows int) {
	if !c.open || c.info == nil {
		return
	}
	list, _ := c.providerModalList(width, visibleRows)
	if len(list.hits) == 0 {
		return
	}
	c.registerBoxListRegion(modal, top, col, width, list)
}

func (c *lmConfigComponent) registerProviderActionHits(modal string, top, col, width, visibleRows int) {
	if !c.open || c.info == nil {
		return
	}
	_, hits := c.renderProviderDetailsRowsAndHits(width, visibleRows)
	c.registerBoxCellHits(modal, top, col, hits)
}

func (c *lmConfigComponent) registerModelHits(modal string, top, col, width, visibleRows int) {
	if !c.open || c.info == nil {
		return
	}
	list, _ := c.modelModalList(width, visibleRows)
	if len(list.hits) == 0 {
		return
	}
	c.registerBoxListRegion(modal, top, col, width, list)
}

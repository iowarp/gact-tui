package ui

// settings_view.go renders the settings modal.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// view renders the Settings modal.
func (c *settingsComponent) view() string {
	a := c.app
	t := a.Theme
	w := a.modals.modalWidth()
	innerW := modalInnerWidth(w)
	var rowHits []modalListHit
	var arrowHits []modalCellHit
	addRowHit := func(id string, row int, action uiHitAction) {
		rowHits = append(rowHits, modalListHit{id: id, row: row, height: 1, action: action})
	}
	addRowHitHeight := func(id string, row int, height int, action uiHitAction) {
		if height < 1 {
			height = 1
		}
		rowHits = append(rowHits, modalListHit{id: id, row: row, height: height, action: action})
	}
	addArrowHit := func(id string, row int, col int, width int, action uiHitAction) {
		arrowHits = append(arrowHits, modalCellHit{id: id, row: row, col: col, width: width, height: 1, action: action})
	}
	addListHits := func(list modalListRender, rowOffset int) {
		rowHits = append(rowHits, offsetModalListHits(list, rowOffset)...)
	}
	tabHits := c.tabHits(c.tab)
	currentModel, currentAgent := c.currentSelectionLabels()

	buttons := []menuButton{closeMenuButton("settings:close", func(app *App) { app.settings.close() })}
	rows := []string{}
	agentRailStart := -1
	agentRailRows := 0
	agentRailWindow := scrollWindow{}
	if c.loadErr != "" {
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Warning).Render(c.loadErr),
			"",
		)
	}
	if purpose := c.tabPurpose(c.tab); purpose != "" {
		rows = append(rows, t.HintLabel.Render(purpose), "")
	}
	rowLine := func(selected bool, primaryText, secondaryText string) string {
		return c.rowLine(selected, primaryText, secondaryText, w, innerW, c.tab)
	}

	switch c.tab {
	case 0:
		rows = c.appendModelTabRows(rows, currentModel, rowLine, addRowHit)
	case 1:
		agentTab := c.appendAgentTabRows(rows, currentAgent, w, innerW, rowLine, addRowHit)
		rows = agentTab.rows
		agentRailStart = agentTab.railStart
		agentRailRows = agentTab.railRows
		agentRailWindow = agentTab.railWindow
	case 2:
		rows = c.appendThemeTabRows(rows, innerW, rowLine, addRowHit, addListHits)
	case 3:
		rows = c.appendTUITabRows(rows, innerW, addRowHitHeight, addArrowHit)
	case 4:
		rows = c.appendLanguageTabRows(rows, innerW, addListHits)
	}

	for i, row := range rows {
		rows[i] = fitANSI(row, innerW)
	}
	body := padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), c.bodyPageSize())
	rendered := a.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:      w,
		title:      a.localizer.t(msgSettingsTitle, nil),
		buttons:    buttons,
		tabs:       tabHits,
		tabPadding: 2,
		tabSpacing: 2,
		body:       body,
		footer:     t.HintLabel.Render(a.localizer.t(msgSettingsFooter, nil)),
	})
	a.interaction.registerModalSurfaceWheel(rendered, "settings")
	bodyList := modalListRender{
		rows: strings.Split(body, "\n"),
		hits: rowHits,
	}
	a.interaction.registerModalListRegion(rendered.modal, rendered.bodyRow, 0, innerW, bodyList, "settings:body:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
		switch button {
		case tea.MouseWheelUp:
			_, cmd := app.settings.handleKey(keyMsg("up"))
			return cmd
		case tea.MouseWheelDown:
			_, cmd := app.settings.handleKey(keyMsg("down"))
			return cmd
		}
		return nil
	})
	if agentRailStart >= 0 && agentRailRows > 0 {
		railFrame := rendered
		railFrame.bodyRow = rendered.bodyRow + agentRailStart
		a.interaction.registerSelectableListRailHits(railFrame, "settings:agent:list", agentRailWindow, agentRailRows, func(app *App, target int) tea.Cmd {
			if len(app.settings.agentList) == 0 {
				return nil
			}
			app.settings.tab = 1
			app.settings.agentSel = clampSelection(target, len(app.settings.agentList))
			app.settings.ensureAgentSelectionVisible()
			return nil
		})
	}
	a.interaction.registerModalCellHits(rendered.modal, rendered.bodyRow, arrowHits)
	return rendered.modal
}

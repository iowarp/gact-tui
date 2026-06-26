package ui

// settings_model_agent_view.go renders the model and agent settings tab rows.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type settingsAgentTabRows struct {
	rows       []string
	railStart  int
	railRows   int
	railWindow scrollWindow
}

func (c *settingsComponent) appendModelTabRows(
	rows []string,
	currentModel string,
	rowLine func(bool, string, string) string,
	addRowHit func(string, int, uiHitAction),
) []string {
	a := c.app
	t := a.Theme

	// Tab 0 (Model) is intentionally a thin shim. The wide lifecycle
	// LM-config modal owns provider/model selection.
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
		map[string]string{"value": orPlaceholder(currentModel, a.localizer.t(msgSettingsUnset, nil))})))
	rows = append(rows, "")
	row := len(rows)
	rows = append(rows, rowLine(true, a.localizer.t(msgSettingsModelChange, nil),
		a.localizer.t(msgSettingsModelChangeDesc, nil)))
	addRowHit("settings:model:change-provider", row, func(app *App) tea.Cmd {
		app.settings.open = false
		app.lmConfig.openModal()
		return lmConfigFetchCmd(app.c)
	})
	rows = append(rows, "")
	rows = append(rows, t.HintLabel.Italic(true).Render(
		a.localizer.t(msgSettingsModelHint, nil)))
	return rows
}

func (c *settingsComponent) appendAgentTabRows(
	rows []string,
	currentAgent string,
	width int,
	innerWidth int,
	rowLine func(bool, string, string) string,
	addRowHit func(string, int, uiHitAction),
) settingsAgentTabRows {
	a := c.app
	t := a.Theme
	result := settingsAgentTabRows{
		rows:      rows,
		railStart: -1,
	}

	result.rows = append(result.rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
		map[string]string{"value": orPlaceholder(currentAgent, a.localizer.t(msgSettingsUnset, nil))})))
	result.rows = append(result.rows, "")
	if len(c.agentList) == 0 && strings.TrimSpace(c.loadErr) == "" {
		result.rows = append(result.rows, t.HintLabel.Render(a.localizer.t(msgSettingsLoading, nil)))
	}
	if c.agentSel >= len(c.agentList) {
		c.agentSel = max(0, len(c.agentList)-1)
	}
	c.ensureAgentSelectionVisible()
	start, end := c.visibleAgentRange()
	result.railStart = len(result.rows)
	result.railWindow = scrollWindow{start: start, end: end, total: len(c.agentList)}
	agentRows := make([]string, 0, maxInt(1, end-start))
	for i, ag := range c.agentList[start:end] {
		absolute := start + i
		row := result.railStart + len(agentRows)
		idx := absolute
		agentRows = append(agentRows, rowLine(absolute == c.agentSel, c.localizedAgentTitle(ag), c.agentListDescription(ag)))
		addRowHit("settings:agent:"+ag.ID, row, func(app *App) tea.Cmd {
			if idx < 0 || idx >= len(app.settings.agentList) {
				return nil
			}
			app.settings.agentSel = idx
			app.settings.openAgentDetail()
			return nil
		})
	}
	if len(agentRows) > 0 {
		result.railRows = len(agentRows)
		agentListBody := a.modals.renderScrollableModalBody(
			lipgloss.JoinVertical(lipgloss.Left, agentRows...),
			result.railRows,
			width,
			result.railWindow,
		)
		result.rows = append(result.rows, strings.Split(agentListBody, "\n")...)
	}
	if len(c.agentList) > 0 {
		result.rows = append(result.rows, "")
		result.rows = append(result.rows, lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("Capability snapshot"))
		detailLines := a.agent.agentDetailLines(c.agentList[c.agentSel], innerWidth)
		maxDetails := max(3, (a.height-4)/4)
		if len(detailLines) > maxDetails {
			detailLines = append(detailLines[:maxDetails], t.HintLabel.Render("  …"))
		}
		result.rows = append(result.rows, detailLines...)
	}
	result.rows = append(result.rows, "")
	result.rows = append(result.rows, lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("New-session defaults"))
	result.rows = append(result.rows, "  "+t.HintKey.Render("blueprint")+"  "+orPlaceholder(a.DefaultAgentBlueprintID, "backend default"))
	result.rows = append(result.rows, "  "+t.HintKey.Render("expert pack")+"  "+orPlaceholder(a.DefaultExpertPackID, "none"))
	defaultsRow := len(result.rows)
	result.rows = append(result.rows, rowLine(false, "Change defaults", "Ctrl+B or b"))
	addRowHit("settings:agent:session-defaults", defaultsRow, func(app *App) tea.Cmd {
		return app.session.openSetup(true)
	})
	return result
}

package ui

// lm_config_provider_list.go renders the LM-config provider list.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// renderProviderList paints the provider section as a windowed list
// around the selected provider.
func (c *lmConfigComponent) renderProviderList(innerW int, visibleRows int) string {
	t := c.app.Theme
	presets := c.info.Presets
	if len(presets) == 0 {
		return "  " + c.app.localizer.t(msgLMConfigNoPresets, nil)
	}
	focused := c.field == lmFieldPreset
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}
	indexes := c.providerIndexes()
	pos := 0
	for i, idx := range indexes {
		if idx == c.selected {
			pos = i + 1
			break
		}
	}
	filterText := c.providerFilter
	if focused {
		filterText += "_"
	}
	filterSuffix := "  " + c.app.localizer.t(msgLMConfigFilter, nil) + " " + filterText
	title := fmt.Sprintf("%s (%d/%d)%s", c.app.localizer.t(msgLMConfigProviderTitle, nil), pos, len(indexes), filterSuffix)
	if focused {
		title = headerStyle.Render(title)
	}
	rows := []string{}
	list, win := c.providerModalList(innerW, visibleRows)
	rows = append(rows, list.rows...)
	if len(indexes) == 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("    "+c.app.localizer.t(msgLMConfigNoProvidersMatch, nil)))
	}
	return c.renderListBox(title, rows, innerW, maxInt(1, visibleRows), win)
}

func (c *lmConfigComponent) providerModalList(innerW int, visibleRows int) (modalListRender, scrollWindow) {
	if !c.open || c.info == nil {
		return modalListRender{}, scrollWindow{}
	}
	indexes := c.providerIndexes()
	selectedPos := 0
	for i, idx := range indexes {
		if idx == c.selected {
			selectedPos = i
			break
		}
	}
	focused := c.field == lmFieldPreset
	return c.app.modals.renderWindowedIndexModalList(indexes, selectedPos, visibleRows, lmConfigVisibleRows, modalListOptions{
		width:            lmConfigBoxBodyWidth(innerW),
		rowBudget:        visibleRows,
		descriptionLines: 0,
	}, func(idx int) modalListItem {
		p := c.info.Presets[idx]
		disabled := c.presetProblem(p) != ""
		status := ""
		if disabled {
			status = "unavailable"
		} else if c.presetPending(p) || c.presetUnchecked(p) {
			status = "checking"
		}
		return modalListItem{
			id:             fmt.Sprintf("lm-config:provider:%d", idx),
			title:          p.Label,
			status:         status,
			selected:       idx == c.selected,
			selectedMarker: lmConfigSelectedMarker(focused),
			disabled:       disabled,
			action: func(app *App) tea.Cmd {
				if !app.lmConfig.open || app.lmConfig.info == nil || idx < 0 || idx >= len(app.lmConfig.info.Presets) {
					return nil
				}
				app.lmConfig.field = lmFieldPreset
				app.lmConfig.selected = idx
				return app.lmConfig.syncFromPreset()
			},
		}
	})
}

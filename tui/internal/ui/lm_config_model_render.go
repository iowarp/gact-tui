package ui

// lm_config_model_render.go renders the LM-config model list.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// renderModelList paints the model picker as a windowed list.
func (c *lmConfigComponent) renderModelList(innerW int, visibleRows int) string {
	t := c.app.Theme
	focused := c.field == lmFieldModel
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}

	pid := c.currentPresetID()
	catalog := c.modelCatalogs[pid]
	warning := c.modelCatalogWarnings[pid]
	if warning != "" {
		catalog = nil
	}

	source := c.modelCatalogSources[pid]
	titleText := c.app.localizer.t(msgLMConfigModelTitle, nil)
	if source == "static_catalog" {
		titleText = c.app.localizer.t(msgLMConfigModelCandidatesTitle, nil)
	}
	modelIndexes := c.modelIndexes()
	filterText := c.modelFilter
	if focused {
		filterText += "_"
	}
	if strings.TrimSpace(filterText) != "" {
		titleText += "  " + c.app.localizer.t(msgLMConfigFilter, nil) + " " + filterText
	}
	title := headerStyle.Render(titleText)
	if len(catalog) == 0 {
		rows := []string{}
		bodyW := lmConfigBoxBodyWidth(innerW)
		if p := c.currentPreset(); p != nil {
			switch {
			case c.presetPending(*p):
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(c.app.localizer.t(msgLMConfigCheckingCatalog, nil)))
			case source == "":
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(c.app.localizer.t(msgLMConfigCheckingCatalog, nil)))
			case source == "live" && p.Provider == "ollama":
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(c.app.localizer.t(msgLMConfigOllamaNoModels, nil)))
			case c.presetProblem(*p) != "":
				for _, line := range textutil.WrapPlainRows(
					c.app.localizer.t(msgLMConfigProviderUnavailable, map[string]string{"reason": c.presetProblem(*p)}),
					bodyW,
					"  ") {
					rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(line))
				}
			default:
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(c.app.localizer.t(msgLMConfigNoSelectableCatalog, nil)))
			}
		}
		if len(rows) == 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(c.app.localizer.t(msgLMConfigNoSelectableCatalog, nil)))
		}
		return c.renderBox(title, rows, innerW, maxInt(1, visibleRows))
	}
	if len(modelIndexes) == 0 {
		rows := []string{
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(c.app.localizer.t(msgLMConfigNoModelsMatch, nil)),
		}
		return c.renderBox(title, rows, innerW, maxInt(1, visibleRows))
	}

	idx := c.modelIndex
	if idx < 0 {
		idx = modelIndexes[0]
	}
	pos := 0
	for i, modelIdx := range modelIndexes {
		if modelIdx == idx {
			pos = i
			break
		}
	}
	title = fmt.Sprintf("%s   (%d/%d)%s",
		headerStyle.Render(titleText),
		pos+1, len(modelIndexes),
		func() string {
			if c.modelIndex < 0 {
				return "  " + lipgloss.NewStyle().Foreground(t.FgFaint).
					Italic(true).Render(c.app.localizer.t(msgLMConfigTypedSnapBack, nil))
			}
			return ""
		}(),
	)
	rows := []string{}
	list, win := c.modelModalList(innerW, visibleRows)
	rows = append(rows, list.rows...)
	return c.renderListBox(title, rows, innerW, maxInt(1, visibleRows), win)
}

func (c *lmConfigComponent) modelModalList(innerW int, visibleRows int) (modalListRender, scrollWindow) {
	if !c.open || c.info == nil {
		return modalListRender{}, scrollWindow{}
	}
	pid := c.currentPresetID()
	if strings.TrimSpace(c.modelCatalogWarnings[pid]) != "" {
		return modalListRender{}, scrollWindow{}
	}
	catalog := c.modelCatalogs[pid]
	if len(catalog) == 0 {
		return modalListRender{}, scrollWindow{}
	}
	modelIndexes := c.modelIndexes()
	if len(modelIndexes) == 0 {
		return modalListRender{}, scrollWindow{}
	}
	idx := c.modelIndex
	if idx < 0 {
		idx = modelIndexes[0]
	}
	pos := 0
	for i, modelIdx := range modelIndexes {
		if modelIdx == idx {
			pos = i
			break
		}
	}
	focused := c.field == lmFieldModel
	return c.app.modals.renderWindowedIndexModalList(modelIndexes, pos, visibleRows, lmConfigVisibleRows, modalListOptions{
		width:            lmConfigBoxBodyWidth(innerW),
		rowBudget:        visibleRows,
		descriptionLines: 0,
	}, func(modelIdx int) modalListItem {
		m := catalog[modelIdx]
		return modalListItem{
			id:             fmt.Sprintf("lm-config:model:%d", modelIdx),
			title:          m.ID,
			selected:       modelIdx == idx && c.modelIndex >= 0,
			selectedMarker: lmConfigSelectedMarker(focused),
			action: func(app *App) tea.Cmd {
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
			},
		}
	})
}

func (c *lmConfigComponent) selectableModelCount() int {
	if !c.open {
		return 0
	}
	pid := c.currentPresetID()
	if strings.TrimSpace(c.modelCatalogWarnings[pid]) != "" {
		return 0
	}
	if strings.TrimSpace(c.modelFilter) != "" {
		return len(c.modelIndexes())
	}
	return len(c.modelCatalogs[pid])
}

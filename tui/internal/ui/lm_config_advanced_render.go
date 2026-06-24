package ui

// lm_config_advanced_render.go renders the LM-config advanced settings rows and model-detail box.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

const lmConfigAdvancedMarkerWidth = 6

type lmConfigAdvancedRow struct {
	field       lmConfigField
	label       string
	value       string
	defaultText string
}

func (r lmConfigAdvancedRow) displayText() string {
	if r.value != "" {
		return r.value
	}
	return r.defaultText
}

func (r lmConfigAdvancedRow) controlBounds() (int, int) {
	start := lmConfigAdvancedMarkerWidth + lipgloss.Width(r.label) + 2
	return start, start + lipgloss.Width("◀ "+r.displayText()+" ▶")
}

func (c *lmConfigComponent) advancedRows() []lmConfigAdvancedRow {
	if !c.open {
		return nil
	}
	rows := []lmConfigAdvancedRow{}
	for _, field := range c.lmConfigAdvancedFields() {
		switch field {
		case lmFieldTemperature:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldTemperature,
				label:       c.app.localizer.t(msgLMConfigTemperature, nil),
				value:       c.temperature,
				defaultText: c.app.localizer.t(msgLMConfigBackendDefault, nil),
			})
		case lmFieldMaxTokens:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldMaxTokens,
				label:       c.app.localizer.t(msgLMConfigMaxOutput, nil),
				value:       c.maxTokens,
				defaultText: c.app.localizer.t(msgLMConfigProviderDefault, nil),
			})
		case lmFieldContextLength:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldContextLength,
				label:       c.app.localizer.t(msgLMConfigLoadContext, nil),
				value:       c.contextLength,
				defaultText: c.app.localizer.t(msgLMConfigLMStudioDefault, nil),
			})
		case lmFieldThinkingBudget:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldThinkingBudget,
				label:       c.app.localizer.t(msgLMConfigThinkingBudget, nil),
				value:       c.thinkingBudget,
				defaultText: c.app.localizer.t(msgLMConfigDefaultDisabled, nil),
			})
		case lmFieldParallel:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldParallel,
				label:       c.app.localizer.t(msgLMConfigParallel, nil),
				value:       c.parallel,
				defaultText: c.app.localizer.t(msgLMConfigBackendDefault, nil),
			})
		}
	}
	return rows
}

// renderAdvanced renders the numeric knobs as visible ←/→
// adjusters. Empty value displays "default" so the user knows blank
// is intentional.
func (c *lmConfigComponent) renderAdvanced(innerW int) []string {
	rows, _ := c.renderAdvancedRowsAndHits(innerW)
	return rows
}

func (c *lmConfigComponent) renderAdvancedRowsAndHits(innerW int) ([]string, []modalCellHit) {
	t := c.app.Theme
	row := func(spec lmConfigAdvancedRow) string {
		marker := strings.Repeat(" ", lmConfigAdvancedMarkerWidth)
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if c.field == spec.field {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("    ▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
		}
		display := spec.value
		if display == "" {
			display = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render(spec.defaultText)
		} else {
			display = lipgloss.NewStyle().Foreground(t.Fg).Bold(true).Render(display)
		}
		hint := ""
		if c.field == spec.field {
			hint = "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render(c.app.localizer.t(msgLMConfigAdjustHint, nil))
		}
		return marker + labelStyle.Render(spec.label) + "  " + t.HintLabel.Render("◀ ") + display + t.HintLabel.Render(" ▶") + hint
	}
	rows := []string{}
	hits := []modalCellHit{}
	for rowIdx, spec := range c.advancedRows() {
		rows = append(rows, row(spec))
		field := spec.field
		id := fmt.Sprintf("lm-config:advanced:%d", field)
		start, end := spec.controlBounds()
		hits = append(hits, modalStepperControlHits(id, rowIdx, 0, innerW, start, end, func(app *App) tea.Cmd {
			if app.lmConfig.open {
				app.lmConfig.field = field
			}
			return nil
		}, func(app *App) tea.Cmd {
			if !app.lmConfig.open {
				return nil
			}
			app.lmConfig.field = field
			_, cmd := app.lmConfig.handleKey(keyMsg("left"))
			return cmd
		}, func(app *App) tea.Cmd {
			if !app.lmConfig.open {
				return nil
			}
			app.lmConfig.field = field
			_, cmd := app.lmConfig.handleKey(keyMsg("right"))
			return cmd
		})...)
	}
	return rows, hits
}

func (c *lmConfigComponent) renderAdvancedBox(innerW int, visibleRows int) string {
	t := c.app.Theme
	fields := c.lmConfigAdvancedFields()
	title := c.app.localizer.t(msgLMConfigAdvancedTitle, nil)
	if c.field == lmFieldTemperature ||
		c.field == lmFieldMaxTokens ||
		c.field == lmFieldContextLength ||
		c.field == lmFieldThinkingBudget ||
		c.field == lmFieldParallel {
		title = lipgloss.NewStyle().Foreground(t.Secondary).Render(title)
	}
	rows := c.renderAdvanced(innerW)
	if len(fields) == 0 {
		rows = []string{
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(c.app.localizer.t(msgLMConfigManagedByProvider, nil)),
		}
	}
	if details := c.renderModelDetails(lmConfigBoxBodyWidth(innerW)); len(details) > 0 {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true).Render(c.app.localizer.t(msgLMConfigModelDetails, nil)))
		rows = append(rows, details...)
	}
	return c.renderBox(title, rows, innerW, visibleRows)
}

func (c *lmConfigComponent) renderModelDetails(bodyW int) []string {
	if !c.open {
		return nil
	}
	pid := c.currentPresetID()
	catalog := c.modelCatalogs[pid]
	if len(catalog) == 0 || c.modelIndex < 0 || c.modelIndex >= len(catalog) {
		return nil
	}
	t := c.app.Theme
	m := catalog[c.modelIndex]
	rows := []string{}
	name := strings.TrimSpace(m.Name)
	if name != "" && name != m.ID {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(c.app.localizer.t(msgLMConfigModelName, map[string]string{"name": name})))
	}
	if m.ContextWindow > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			c.app.localizer.tf(msgLMConfigMaxContext, map[string]any{"tokens": m.ContextWindow}),
		))
		if m.ChosenContext > 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
				c.app.localizer.tf(msgLMConfigChosenContext, map[string]any{"tokens": m.ChosenContext}),
			))
		}
		if strings.TrimSpace(c.contextLength) != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
				c.app.localizer.t(msgLMConfigRequestedContext, map[string]string{"tokens": strings.TrimSpace(c.contextLength)}),
			))
		}
	} else if strings.TrimSpace(c.contextLength) != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			c.app.localizer.t(msgLMConfigRequestedContext, map[string]string{"tokens": strings.TrimSpace(c.contextLength)}),
		))
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(
			c.app.localizer.t(msgLMConfigMaxContextUnknown, nil),
		))
	}
	if m.MaxOutputTokens > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			c.app.localizer.tf(msgLMConfigMaxOutputDetail, map[string]any{"tokens": m.MaxOutputTokens}),
		))
	}
	if m.IsReasoning || m.Supports.Thinking {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(c.app.localizer.t(msgLMConfigReasoningModel, nil)))
	}
	if m.NativeToolCalls {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(c.app.localizer.t(msgLMConfigNativeTools, nil)))
	}
	if desc := strings.TrimSpace(m.Description); desc != "" {
		for _, line := range textutil.WrapPlainRows(desc, bodyW, "  ") {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(line))
		}
	}
	return rows
}

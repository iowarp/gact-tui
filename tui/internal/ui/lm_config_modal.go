package ui

// lm_config_modal.go renders the LM-config modal body.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

// view renders the modal.
func (c *lmConfigComponent) view() string {
	if !c.open {
		return ""
	}
	t := c.app.Theme
	w := c.modalWidth()
	chromeW := modalInnerWidth(w)
	contentW := maxInt(20, modalBodyContentWidth(w))

	buttons := []menuButton{
		{
			id:    "lm-config:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				return app.lmConfig.refresh()
			},
		},
		closeMenuButton("lm-config:close", func(app *App) { app.lmConfig.close() }),
	}
	intro := lipgloss.NewStyle().Foreground(t.FgMuted).
		Background(t.Bg).Width(chromeW).
		Render(c.app.localizer.t(msgLMConfigIntro, nil))

	var body string
	switch {
	case c.loading:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(c.app.localizer.t(msgLMConfigFetching, nil))
	case c.err != nil:
		body = lipgloss.NewStyle().Foreground(t.Danger).
			Render(c.app.localizer.t(msgLMConfigSaveFailed,
				map[string]string{"error": c.err.Error()})) + "\n\n" +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(c.app.localizer.t(msgLMConfigSaveRetry, nil))
	case c.info == nil:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(c.app.localizer.t(msgLMConfigNoEndpoint, nil))
	default:
		body = c.renderBody(contentW, c.bodyRows())
	}

	hint := lipgloss.NewStyle().Background(t.Bg).Width(contentW).
		Render(t.HintLabel.Render(
			c.app.localizer.t(msgLMConfigHint, nil),
		))
	bodyParts := []string{intro, "", body}
	if c.saving {
		savingText := c.app.localizer.t(msgLMConfigSaving, nil)
		if c.info != nil && c.info.State == "configuring" {
			savingText = c.app.localizer.t(msgLMConfigConfiguring, nil)
		}
		bodyParts = append(bodyParts, "",
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(savingText))
	}
	body = lipgloss.JoinVertical(lipgloss.Left, bodyParts...)
	rendered := c.app.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:              w,
		title:              c.app.localizer.t(msgLMConfigTitle, nil),
		background:         t.Bg,
		buttons:            buttons,
		suppressButtonHits: c.saving || c.authenticating,
		body:               body,
		footer:             hint,
	})
	c.app.interaction.registerModalSurfaceWheel(rendered, "lm-config")
	if c.info != nil && !c.loading && c.err == nil && !c.saving && !c.authenticating {
		introRows := maxInt(1, strings.Count(ansi.Strip(intro), "\n")+1)
		c.registerHitTargets(rendered.modal, rendered.bodyRow+introRows+1, contentW, c.bodyRows())
	}
	return rendered.modal
}

func (c *lmConfigComponent) renderBody(innerW int, bodyRows int) string {
	t := c.app.Theme
	if c.info == nil {
		return ""
	}
	layout := c.layout(innerW, bodyRows)

	rows := []string{}

	leftW, rightW := lmConfigGridWidths(innerW)
	if leftW < 38 || rightW < 38 {
		rows = append(rows, c.renderProviderList(innerW, layout.providerRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, c.renderProviderDetails(innerW, layout.selectedRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, c.renderModelList(innerW, layout.modelRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, c.renderAdvancedBox(innerW, layout.configRows))
	} else {
		top := lipgloss.JoinHorizontal(
			lipgloss.Top,
			c.renderProviderList(leftW, layout.providerRows),
			"  ",
			c.renderProviderDetails(rightW, layout.selectedRows),
		)
		if layout.compact {
			rows = append(rows, top)
			return lmConfigFillBlock(strings.Join(rows, "\n"), innerW, bodyRows, t.Bg)
		}
		bottom := lipgloss.JoinHorizontal(
			lipgloss.Top,
			c.renderModelList(leftW, layout.modelRows),
			"  ",
			c.renderAdvancedBox(rightW, layout.configRows),
		)
		rows = append(rows, top)
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, bottom)
	}
	canSave := false
	if p := c.currentPreset(); p != nil {
		canSave = c.canSave(*p)
	}
	if layout.buttonRows > 0 {
		buttons := []menuButton{c.saveMenuButton(!canSave)}
		selected := -1
		if c.field == lmFieldSave && canSave {
			selected = 0
		}
		button, _ := c.app.modals.renderCenteredModalButtons(innerW, buttons, selected)
		spacerRows := bodyRows - renderedLineCount(rows) - layout.buttonRows
		for i := 0; i < spacerRows; i++ {
			rows = append(rows, "")
		}
		if layout.buttonRows >= 3 {
			rows = append(rows, "")
		}
		rows = append(rows, button)
	}

	return lmConfigFillBlock(strings.Join(rows, "\n"), innerW, bodyRows, t.Bg)
}

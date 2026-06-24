package ui

// settings_tui_view.go renders the TUI-preferences settings tab rows.

import (
	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *settingsComponent) appendTUITabRows(
	rows []string,
	innerW int,
	addRowHitHeight func(id string, row int, height int, action uiHitAction),
	addArrowHit func(id string, row int, col int, width int, action uiHitAction),
) []string {
	a := c.app
	t := a.Theme
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsTUIDisplayPrefs, nil)))
	rows = append(rows, "")

	// LLLLL1: shared editable-row renderer for the TUI tab so
	// rows 0..tuiPrefsRowCount-1 share the same selection visual,
	// inline hint density, and left/right control geometry.
	editableRow := func(rowIdx int, label, value, hint string) settingsTUIStepperRow {
		return renderSettingsTUIStepperRow(t, innerW, c.tuiRow == rowIdx, label, value, hint)
	}
	addTUIControlHits := func(id string, rowIdx int, row int, stepper settingsTUIStepperRow) {
		selectRow := func(app *App) {
			app.settings.tuiRow = rowIdx
		}
		controlHits := modalStepperControlHits("settings:tui:"+id, row, 0, innerW, stepper.controlStart, stepper.controlEnd, func(app *App) tea.Cmd {
			selectRow(app)
			return nil
		}, func(app *App) tea.Cmd {
			selectRow(app)
			_, cmd := app.settings.handleKey(keyMsg("left"))
			return cmd
		}, func(app *App) tea.Cmd {
			selectRow(app)
			_, cmd := app.settings.handleKey(keyMsg("right"))
			return cmd
		})
		for _, hit := range controlHits {
			if hit.id == "settings:tui:"+id {
				hit.id += ":line"
			}
			addArrowHit(hit.id, hit.row, hit.col, hit.width, hit.action)
		}
	}
	addTUIRowHit := func(id string, rowIdx int, row int, height int) {
		addRowHitHeight("settings:tui:"+id, row, height, func(app *App) tea.Cmd {
			app.settings.tuiRow = rowIdx
			return nil
		})
	}

	label := a.localizer.t(messageID("settings.tui.collapse_threshold"), nil)
	value := itoa2(a.Theme.CollapseThreshold) + " " + a.localizer.t(messageID("settings.tui.lines"), nil)
	row := len(rows)
	block := editableRow(0,
		label,
		value,
		a.localizer.t(messageID("settings.tui.collapse_threshold_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("collapse-threshold", 0, row, block.height())
	addTUIControlHits("collapse-threshold", 0, row, block)
	label = a.localizer.t(messageID("settings.tui.cost_warn_tokens"), nil)
	value = textutil.HumanTokens(a.Theme.CostWarnTokens)
	row = len(rows)
	block = editableRow(1,
		label,
		value,
		a.localizer.t(messageID("settings.tui.cost_warn_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("cost-warn", 1, row, block.height())
	addTUIControlHits("cost-warn", 1, row, block)
	label = a.localizer.t(messageID("settings.tui.cost_danger_tokens"), nil)
	value = textutil.HumanTokens(a.Theme.CostDangerTokens)
	row = len(rows)
	block = editableRow(2,
		label,
		value,
		a.localizer.t(messageID("settings.tui.cost_danger_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("cost-danger", 2, row, block.height())
	addTUIControlHits("cost-danger", 2, row, block)
	// YYYYY1: paste compression threshold + intro splash toggle.
	pt := a.Theme.PasteCompressThreshold
	if pt <= 0 {
		pt = 3
	}
	label = a.localizer.t(messageID("settings.tui.paste_compress"), nil)
	value = itoa2(pt) + " " + a.localizer.t(messageID("settings.tui.lines"), nil)
	row = len(rows)
	block = editableRow(3,
		label,
		value,
		a.localizer.t(messageID("settings.tui.paste_compress_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("paste-compress", 3, row, block.height())
	addTUIControlHits("paste-compress", 3, row, block)
	introState := a.localizer.t(msgSettingsOff, nil)
	if a.IntroDisabled {
		introState = a.localizer.t(msgSettingsOn, nil) + "  (" + a.localizer.t(messageID("settings.tui.skip_splash"), nil) + ")"
	} else {
		introState = a.localizer.t(msgSettingsOff, nil) + " (" + a.localizer.t(messageID("settings.tui.show_splash"), nil) + ")"
	}
	label = a.localizer.t(messageID("settings.tui.intro_splash_skip"), nil)
	value = introState
	row = len(rows)
	block = editableRow(4,
		label,
		value,
		a.localizer.t(messageID("settings.tui.intro_splash_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("intro", 4, row, block.height())
	addTUIControlHits("intro", 4, row, block)

	label = a.localizer.t(messageID("settings.tui.mouse_controls"), nil)
	value = a.clipboard.mouseSelectionModeLabel()
	row = len(rows)
	block = editableRow(5,
		label,
		value,
		a.localizer.t(messageID("settings.tui.mouse_controls_hint"), nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("mouse", 5, row, block.height())
	addTUIControlHits("mouse", 5, row, block)
	label = a.localizer.t(msgSettingsTUILayoutEditor, nil)
	value = a.localizer.t(msgSettingsTUILayoutOpen, nil)
	row = len(rows)
	block = renderSettingsTUIActionRow(t, innerW, c.tuiRow == 6,
		label,
		value,
		a.localizer.t(msgSettingsTUILayoutEditorHint, nil))
	rows = append(rows, block.rows()...)
	addTUIRowHit("layout-editor", 6, row, block.height())
	addArrowHit("settings:tui:layout-editor:open", row, block.controlStart, maxInt(1, block.controlEnd-block.controlStart), func(app *App) tea.Cmd {
		app.settings.tuiRow = 6
		app.sidebar.openLayoutEditor()
		return nil
	})
	rows = append(rows, "")

	// Read-only runtime state for confirmation.
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsTUIRuntimeState, nil)))
	rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIBackendURL, nil)+"  ")+a.chrome.headerBackendLabel())
	if a.VoiceCommand == "" {
		rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIVoiceCmd, nil)+"    ")+t.HintLabel.Render(a.localizer.t(msgSettingsTUIVoiceUnset, nil)))
	} else {
		rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIVoiceCmd, nil)+"    ")+a.VoiceCommand)
	}
	rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUITheme, nil)+"        ")+c.localizedThemeName(ThemeModeFor(a.Theme)))
	rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIAltScreen, nil)+"    ")+localizedBoolPretty(a.localizer, !a.DisableAltScreen))
	rows = append(rows, "")
	rows = append(rows, t.HintLabel.Italic(true).Render(
		a.localizer.t(msgSettingsTUIAdjustHint, nil)))
	return rows
}

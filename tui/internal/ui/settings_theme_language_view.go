package ui

// settings_theme_language_view.go renders the theme and language settings tab rows.

import tea "charm.land/bubbletea/v2"

func (c *settingsComponent) appendThemeTabRows(
	rows []string,
	innerWidth int,
	rowLine func(bool, string, string) string,
	addRowHit func(string, int, uiHitAction),
	addListHits func(modalListRender, int),
) []string {
	a := c.app
	t := a.Theme
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
		map[string]string{"value": c.localizedThemeName(ThemeModeFor(a.Theme))})))
	rows = append(rows, "")
	listStart := len(rows)
	items := make([]modalListItem, 0, len(AllThemeModes))
	for i, mode := range AllThemeModes {
		idx := i
		items = append(items, modalListItem{
			id:       "settings:theme:" + ThemeModeName(mode),
			title:    c.localizedThemeName(mode),
			meta:     c.localizedThemeDescription(mode),
			selected: i == c.themeSel,
			action: func(app *App) tea.Cmd {
				app.settings.themeSel = idx
				app.settings.previewTheme(idx)
				return nil
			},
		})
	}
	list := a.modals.renderModalList(items, modalListOptions{
		width:            innerWidth,
		rowBudget:        len(items),
		descriptionLines: 0,
	})
	rows = append(rows, list.rows...)
	addListHits(list, listStart)
	rows = append(rows, "")
	exportRow := len(rows)
	rows = append(rows, rowLine(false, "Export custom theme", "~/.config/gact/theme.json"))
	addRowHit("settings:theme:export", exportRow, func(app *App) tea.Cmd {
		app.settings.tab = 2
		return app.settings.exportCurrentTheme()
	})
	importRow := len(rows)
	rows = append(rows, rowLine(false, "Reload custom theme", "~/.config/gact/theme.json"))
	addRowHit("settings:theme:import", importRow, func(app *App) tea.Cmd {
		app.settings.tab = 2
		return app.settings.importCustomTheme()
	})
	rows = append(rows, "")
	rows = append(rows, t.HintLabel.Italic(true).Render(
		a.localizer.t(messageID("settings.theme.hint"), nil)))
	return rows
}

func (c *settingsComponent) appendLanguageTabRows(
	rows []string,
	innerWidth int,
	addListHits func(modalListRender, int),
) []string {
	a := c.app
	t := a.Theme
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgLanguageCurrent, nil)+": "+
		a.localizer.activeLanguageLabel()))
	rows = append(rows, "")
	options := availableLanguageOptions()
	listStart := len(rows)
	items := make([]modalListItem, 0, len(options))
	for i, opt := range options {
		idx := i
		items = append(items, modalListItem{
			id:       "settings:language:" + opt.Locale,
			title:    a.localizer.languageOptionLabel(opt),
			meta:     opt.Locale,
			selected: i == c.languageSel,
			action: func(app *App) tea.Cmd {
				app.settings.languageSel = idx
				app.settings.previewLanguage(idx)
				return nil
			},
		})
	}
	list := a.modals.renderModalList(items, modalListOptions{
		width:            innerWidth,
		rowBudget:        len(items),
		descriptionLines: 0,
	})
	rows = append(rows, list.rows...)
	addListHits(list, listStart)
	rows = append(rows, "")
	rows = append(rows, t.HintLabel.Render(a.localizer.t(msgLanguageDescription, nil)))
	rows = append(rows, "")
	rows = append(rows, t.HintLabel.Italic(true).Render(a.localizer.t(msgLanguageHint, nil)))
	return rows
}

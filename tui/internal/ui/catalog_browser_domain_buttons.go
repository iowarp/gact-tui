package ui

// catalog_browser_domain_buttons.go builds the per-domain catalog detail action buttons.

import (
	tea "charm.land/bubbletea/v2"
)

func (c *catalogComponent) promptDetailActionButtons() []menuButton {
	return []menuButton{
		{
			id:    "prompts:render",
			label: "render default",
			action: func(app *App) tea.Cmd {
				return app.catalog.renderPromptDefaultProfile()
			},
		},
		{
			id:    "prompts:validate",
			label: "validate default",
			action: func(app *App) tea.Cmd {
				return app.catalog.validatePromptDefaultProfile()
			},
		},
		{
			id:    "prompts:reload",
			label: "reload registry",
			action: func(app *App) tea.Cmd {
				return app.catalog.reloadPromptRegistry()
			},
		},
	}
}

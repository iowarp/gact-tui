package ui

// catalog_browser_buttons.go builds the catalog-browser header and inline action buttons.

import tea "charm.land/bubbletea/v2"

func (c *catalogComponent) headerButtons() []menuButton {
	if c.current != nil &&
		catalogBrowserCanPop(c.current.kind) &&
		c.current.parent != nil {
		return []menuButton{{
			id:    "catalog:back",
			label: "back",
			action: func(app *App) tea.Cmd {
				app.catalog.navigateToParent()
				return nil
			},
		}}
	}
	return []menuButton{closeMenuButton("catalog:close", func(app *App) { app.catalog.close() })}
}

type catalogActionButtonSpec struct {
	id            string
	label         string
	disabledLabel string
}

func (c *catalogComponent) actionButtonsFromItems(prefix string, specs []catalogActionButtonSpec) []menuButton {
	cb := c.current
	if cb == nil {
		return nil
	}
	buttons := make([]menuButton, 0, len(specs))
	for _, spec := range specs {
		itemIndex := -1
		disabled := false
		for i, item := range cb.items {
			if item.id == spec.id {
				itemIndex = i
				disabled = item.disabled
				break
			}
		}
		if itemIndex < 0 {
			continue
		}
		idx := itemIndex
		label := spec.label
		if disabled && spec.disabledLabel != "" {
			label = spec.disabledLabel
		}
		buttons = append(buttons, menuButton{
			id:       prefix + ":" + spec.label,
			label:    label,
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				if app.catalog.current == nil || idx < 0 || idx >= len(app.catalog.current.items) {
					return nil
				}
				app.catalog.current.sel = idx
				_, cmd := app.catalog.handleKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	return buttons
}

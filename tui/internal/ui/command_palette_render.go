package ui

// command_palette_render.go renders the command-palette modal.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// view renders the slash-command palette as a centered modal.
func (c *commandPaletteComponent) view() string {
	t := c.app.Theme
	w := c.app.modals.modalWidth()
	listW := modalInsetListWidth(w)

	if c.inSearchMode() {
		return c.viewSearch(w)
	}

	matches := c.visibleMatches()
	buttons := c.closeButtons()
	filterPrefix := c.app.localizer.t(msgPaletteFilter, nil) + " "
	filterCursor := c.cursorValue()
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(filterPrefix + renderPaletteCursorEditor(c.paletteFilter, filterCursor)),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(c.app.localizer.t(msgPaletteSearchHint, nil)),
		"",
	}
	groupOverview := c.showingGroupOverview()
	categoryRow := -1
	categoryTabs := []menuTab(nil)
	if strings.TrimSpace(c.paletteFilter) == "" && !groupOverview {
		categoryTabs = c.groupTabs()
		if len(categoryTabs) > 1 {
			categoryRow = len(rows)
			rows = append(rows, c.app.modals.renderModalTabsWithLayout(categoryTabs, 1, 1), "")
		}
		if strings.TrimSpace(c.paletteGroup) != "" {
			title := c.paletteGroup + " area"
			desc := paletteCommandGroupDescription(c.paletteGroup)
			if desc != "" {
				title += " - " + desc
			}
			rows = append(rows, t.HintLabel.Render(title), "")
		}
	}
	if groupOverview {
		rows = append(rows, t.HintLabel.Render("Choose a command area, or type to search every command."))
	}
	if len(matches) == 0 {
		rows = append(rows, t.HintLabel.Render(c.app.localizer.t(msgPaletteNoMatches, nil)))
	}
	listStartRow := len(rows)
	itemBudget := c.app.modals.modalListItemBudget(6, 1, 16)
	if c.useCommandGrid() {
		itemBudget = minInt(itemBudget, 8)
	}
	itemCount := len(matches)
	if groupOverview {
		groups := c.availableGroups()
		itemCount = len(groups)
		itemBudget *= paletteOverviewColumnCount(listW, len(groups))
	}
	win := selectedItemWindow(itemCount, c.paletteSel, itemBudget)
	list := modalListRender{}
	if groupOverview {
		list = c.renderGroupOverview(win, listW)
	} else if c.useCommandGrid() {
		list = c.renderCommandGrid(matches, win, listW)
	} else {
		list = c.renderCommandList(matches, win, listW)
	}
	if len(list.rows) > 0 {
		rows = append(rows, list.rows...)
	}
	footerText := c.footerHint(matches, groupOverview)
	if groupOverview {
		footerText = c.app.localizer.t(msgPaletteBrowseHint, nil)
	}
	rows = append(rows, "", t.HintLabel.Render(footerText))

	bodyRows := c.app.modals.paletteBodyPageSizeForRows(rows)
	rendered := c.app.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   c.app.localizer.t(msgPaletteCommandsTitle, nil),
			buttons: buttons,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       bodyRows,
		window:         win,
		wheelID:        "palette:list:wheel",
		surfaceWheelID: "palette",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			count := len(app.cmdPalette.visibleMatches())
			if app.cmdPalette.showingGroupOverview() {
				count = len(app.cmdPalette.availableGroups())
			}
			app.cmdPalette.paletteSel = moveSelectionByWheel(app.cmdPalette.paletteSel, count, button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			count := len(app.cmdPalette.visibleMatches())
			if app.cmdPalette.showingGroupOverview() {
				count = len(app.cmdPalette.availableGroups())
			}
			app.cmdPalette.paletteSel = clampSelection(index, count)
			return nil
		},
	})
	if rendered.bodyRow >= 0 {
		c.app.interaction.registerInlineCursorHits(rendered.modal, rendered.bodyRow, "palette-filter", lipgloss.Width(filterPrefix), c.paletteFilter, func(app *App, cursor int) {
			app.cmdPalette.paletteCursor = cursor
			app.cmdPalette.paletteCursorSet = true
		})
		if categoryRow >= 0 {
			c.app.interaction.registerModalTabsWithLayout(rendered.modal, rendered.bodyRow+categoryRow, categoryTabs, 1, 1)
		}
	}
	return rendered.modal
}

package ui

// command_palette_search_render.go renders the palette message-search results view.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// viewSearch renders the palette in message-search mode (filter
// starts with `?`). Three sub-states:
//  1. query empty (just `?`) - prompt for input
//  2. query non-empty + no results yet - show "Enter to search" hint
//  3. results loaded - render each match with msg id + snippet
func (c *commandPaletteComponent) viewSearch(w int) string {
	t := c.app.Theme
	queryRaw := strings.TrimPrefix(c.paletteFilter, "?")
	query := strings.TrimSpace(queryRaw)
	queryCursor := c.cursorValue() - 1
	queryRunes := []rune(queryRaw)
	if queryCursor < 0 {
		queryCursor = 0
	}
	if queryCursor > len(queryRunes) {
		queryCursor = len(queryRunes)
	}
	listStartRow := -1
	var list modalListRender
	win := scrollWindow{total: len(c.searchMatches)}
	listW := modalInsetListWidth(w)
	buttons := c.closeButtons()
	queryPrefix := c.app.localizer.t(msgPaletteQuery, nil) + " "
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(queryPrefix + renderPaletteCursorEditor(queryRaw, queryCursor)),
		"",
	}
	switch {
	case c.searching:
		rows = append(rows, t.HintLabel.Render(c.app.localizer.t(msgPaletteSearching, nil)))
	case query == "":
		rows = append(rows, t.HintLabel.Render(c.app.localizer.t(msgPaletteTypeQuery, nil)))
	case len(c.searchMatches) == 0:
		rows = append(rows, t.HintLabel.Render(c.app.localizer.t(msgPaletteEnterSearch, map[string]string{"query": query})))
	default:
		listStartRow = len(rows)
		itemBudget := c.app.modals.modalListItemBudget(5, 2, 8)
		win = selectedItemWindow(len(c.searchMatches), c.paletteSel, itemBudget)
		listItems := make([]modalListItem, 0, win.end-win.start)
		for i := win.start; i < win.end; i++ {
			m := c.searchMatches[i]
			idx := i
			listItems = append(listItems, modalListItem{
				id:          fmt.Sprintf("palette:search:%d", idx),
				title:       shortID(m.MessageID),
				description: strings.ReplaceAll(strings.TrimSpace(m.Snippet), "\n", " "),
				selected:    i == c.paletteSel,
				action: func(app *App) tea.Cmd {
					if idx < 0 || idx >= len(app.cmdPalette.searchMatches) {
						return nil
					}
					app.cmdPalette.paletteSel = idx
					_, cmd := app.cmdPalette.handleKey(keyMsg("enter"))
					return cmd
				},
			})
		}
		list = c.app.modals.renderModalList(listItems, modalListOptions{
			width:            listW,
			rowBudget:        12,
			descriptionLines: 1,
		})
		rows = append(rows, list.rows...)
	}
	if len(c.searchMatches) > 0 {
		rows = append(rows, "", t.HintLabel.Render(c.app.localizer.t(msgPaletteJumpHint, nil)))
	} else {
		rows = append(rows, "", t.HintLabel.Render(c.app.localizer.t(msgPaletteCloseHint, nil)))
	}

	rendered := c.app.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   c.app.localizer.t(msgPaletteSearchTitle, nil),
			buttons: buttons,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       c.app.modals.paletteBodyPageSize(),
		window:         win,
		wheelID:        "palette:search:list:wheel",
		surfaceWheelID: "palette",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.cmdPalette.paletteSel = moveSelectionByWheel(app.cmdPalette.paletteSel, len(app.cmdPalette.searchMatches), button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.cmdPalette.paletteSel = clampSelection(index, len(app.cmdPalette.searchMatches))
			return nil
		},
	})
	if rendered.bodyRow >= 0 {
		c.app.interaction.registerInlineCursorHits(rendered.modal, rendered.bodyRow, "palette-search-query", lipgloss.Width(queryPrefix), queryRaw, func(app *App, cursor int) {
			if strings.HasPrefix(app.cmdPalette.paletteFilter, "?") {
				app.cmdPalette.paletteCursor = cursor + 1
				app.cmdPalette.paletteCursorSet = true
			}
		})
	}
	return rendered.modal
}

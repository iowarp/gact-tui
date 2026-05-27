package ui

import (
	tea "charm.land/bubbletea/v2"
)

type actionMenuItem struct {
	id          string
	title       string
	description string
	key         string
	action      func(*App) tea.Cmd
}

type actionMenuOptions struct {
	prefix      string
	title       string
	contextLine string
	items       []actionMenuItem
	selected    *int
	rowBudget   int
	close       func(*App)
}

func (a *App) clampActionMenuSelection(selected *int, count int) {
	if selected == nil {
		return
	}
	if *selected < 0 {
		*selected = 0
	}
	if *selected >= count && count > 0 {
		*selected = count - 1
	}
}

func (a *App) applyActionMenuSelection(items []actionMenuItem, selected *int, close func(*App)) tea.Cmd {
	if len(items) == 0 {
		if close != nil {
			close(a)
		}
		return nil
	}
	a.clampActionMenuSelection(selected, len(items))
	idx := 0
	if selected != nil {
		idx = *selected
	}
	return items[idx].action(a)
}

func (a *App) handleActionMenuKey(k tea.KeyPressMsg, items []actionMenuItem, selected *int, close func(*App)) (tea.Cmd, bool) {
	switch k.String() {
	case "esc", "q", "left", "h", "m":
		if close != nil {
			close(a)
		}
		return nil, true
	case "up", "k":
		if selected != nil {
			*selected = moveSelection(*selected, len(items), -1)
		}
		return nil, true
	case "down", "j":
		if selected != nil {
			*selected = moveSelection(*selected, len(items), 1)
		}
		return nil, true
	case "pgup", "ctrl+u", "g", "home":
		if selected != nil {
			*selected = 0
		}
		return nil, true
	case "pgdown", "ctrl+d", "G", "end":
		if selected != nil && len(items) > 0 {
			*selected = len(items) - 1
		}
		return nil, true
	case "enter":
		return a.applyActionMenuSelection(items, selected, close), true
	}
	for i, item := range items {
		if k.String() == item.key {
			if selected != nil {
				*selected = i
			}
			return item.action(a), true
		}
	}
	return nil, false
}

func (a *App) renderActionMenu(opts actionMenuOptions) string {
	w := a.modalWidth()
	innerW := modalInnerWidth(w)
	listW := w - 8
	if listW < 1 {
		listW = innerW
	}
	a.clampActionMenuSelection(opts.selected, len(opts.items))
	selected := 0
	if opts.selected != nil {
		selected = *opts.selected
	}
	rowBudget := opts.rowBudget
	if rowBudget < 1 {
		rowBudget = 14
	}

	rows := []string{a.Theme.HintLabel.Render(opts.contextLine), ""}
	listStartRow := len(rows)
	win := selectedItemWindow(len(opts.items), selected, a.modalListItemBudget(5, 1, rowBudget))
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		item := opts.items[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:       opts.prefix + ":" + item.id,
			title:    item.title,
			meta:     item.description,
			status:   item.key,
			selected: i == selected,
			action: func(app *App) tea.Cmd {
				if opts.selected != nil {
					*opts.selected = idx
				}
				return app.applyActionMenuSelection(opts.items, opts.selected, opts.close)
			},
		})
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        rowBudget,
		descriptionLines: 0,
	})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   opts.title,
			buttons: []menuButton{closeMenuButton(opts.prefix+":close", opts.close)},
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		window:         win,
		wheelID:        opts.prefix + ":list:wheel",
		surfaceWheelID: opts.prefix,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			if opts.selected != nil {
				*opts.selected = moveSelectionByWheel(*opts.selected, len(opts.items), button)
			}
			return nil
		},
	})
	return rendered.modal
}

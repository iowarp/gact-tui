package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type contextAction struct {
	id          string
	title       string
	description string
	key         string
	action      func(*App) tea.Cmd
}

func (a *App) openContextActionsForIndex(index int) tea.Cmd {
	if index < 0 || index >= len(a.contextFiles) {
		return nil
	}
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionContext
	a.sidebarSectionCursor = false
	a.contextFileSel = index
	a.contextActionsOpen = true
	a.contextActionsSel = 0
	return nil
}

func (a *App) closeContextActions() {
	a.contextActionsOpen = false
	a.contextActionsSel = 0
}

func (a *App) selectedContextFile() (gact.ContextFile, bool) {
	if a.contextFileSel < 0 || a.contextFileSel >= len(a.contextFiles) {
		return gact.ContextFile{}, false
	}
	return a.contextFiles[a.contextFileSel], true
}

func (a *App) selectedContextActionItems() []contextAction {
	cf, ok := a.selectedContextFile()
	if !ok {
		return nil
	}
	return []contextAction{
		{
			id:          "detail",
			title:       "Open detail",
			description: "Show path, mode, size, session, and provenance metadata.",
			key:         "Enter",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				app.openContextFileDetail(cf)
				return nil
			},
		},
		{
			id:          "copy-path",
			title:       "Copy path",
			description: "Copy the workspace-relative file path.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				if err := clipboardWrite(cf.Path); err != nil {
					app.transientHint = "copy failed: " + err.Error()
					return nil
				}
				app.transientHint = "copied " + cf.Path + " to clipboard"
				return nil
			},
		},
		{
			id:          "copy-detail",
			title:       "Copy metadata",
			description: "Copy the structured context detail text.",
			key:         "Y",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				text := strings.Join(app.contextFileDetailRows(cf), "\n")
				if err := clipboardWrite(text); err != nil {
					app.transientHint = "copy failed: " + err.Error()
					return nil
				}
				app.transientHint = "copied context metadata to clipboard"
				return nil
			},
		},
		{
			id:          "add",
			title:       "Add another file",
			description: "Open the context file prompt for this session.",
			key:         "o",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				app.contextAddOpen = true
				app.contextAddDraft = ""
				app.contextAddCursor = 0
				return nil
			},
		},
		{
			id:          "remove",
			title:       "Remove from context",
			description: "Detach this file from the selected session.",
			key:         "x",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				sid := app.currentSessionID()
				if sid == "" {
					app.transientHint = "no session selected"
					return nil
				}
				return removeContextFileCmd(app.c, sid, cf.Path)
			},
		},
	}
}

func (a *App) applyContextActionSelection() tea.Cmd {
	items := a.selectedContextActionItems()
	if len(items) == 0 {
		a.closeContextActions()
		return nil
	}
	if a.contextActionsSel < 0 {
		a.contextActionsSel = 0
	}
	if a.contextActionsSel >= len(items) {
		a.contextActionsSel = len(items) - 1
	}
	return items[a.contextActionsSel].action(a)
}

func (a *App) handleContextActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedContextActionItems()
	switch k.String() {
	case "esc", "q", "left", "h", "m":
		a.closeContextActions()
		return a, nil
	case "up", "k":
		a.contextActionsSel = moveSelection(a.contextActionsSel, len(items), -1)
		return a, nil
	case "down", "j":
		a.contextActionsSel = moveSelection(a.contextActionsSel, len(items), 1)
		return a, nil
	case "pgup", "ctrl+u", "g", "home":
		a.contextActionsSel = 0
		return a, nil
	case "pgdown", "ctrl+d", "G", "end":
		if len(items) > 0 {
			a.contextActionsSel = len(items) - 1
		}
		return a, nil
	case "enter":
		return a, a.applyContextActionSelection()
	}
	for i, item := range items {
		if k.String() == item.key {
			a.contextActionsSel = i
			return a, item.action(a)
		}
	}
	return a, nil
}

func (a *App) viewContextActions() string {
	t := a.Theme
	w := a.modalWidth()
	listW := w - 8
	if listW < 1 {
		listW = w - 4
	}
	items := a.selectedContextActionItems()
	if a.contextActionsSel < 0 {
		a.contextActionsSel = 0
	}
	if a.contextActionsSel >= len(items) && len(items) > 0 {
		a.contextActionsSel = len(items) - 1
	}

	title := "Context actions"
	contextLine := t.HintLabel.Render("No context file selected.")
	if cf, ok := a.selectedContextFile(); ok {
		title = truncate(shortContextPath(cf.Path), 44)
		mode := strings.TrimSpace(cf.Mode)
		if mode == "" {
			mode = "unknown"
		}
		meta := mode
		if cf.Size > 0 {
			meta += " · " + humanBytes(cf.Size)
		}
		contextLine = t.HintLabel.Render(fmt.Sprintf("%s · %s", truncate(cf.Path, 52), meta))
	}

	rows := []string{contextLine, ""}
	listStartRow := len(rows)
	win := selectedItemWindow(len(items), a.contextActionsSel, a.modalListItemBudget(5, 2, 8))
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		item := items[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:          "context-actions:" + item.id,
			title:       item.title,
			description: item.description,
			status:      item.key,
			selected:    i == a.contextActionsSel,
			action: func(app *App) tea.Cmd {
				app.contextActionsSel = idx
				return app.applyContextActionSelection()
			},
		})
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        12,
		descriptionLines: 1,
	})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   title,
			buttons: []menuButton{closeMenuButton("context-actions:close", func(app *App) { app.closeContextActions() })},
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		window:         win,
		wheelID:        "context-actions:list:wheel",
		surfaceWheelID: "context-actions",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.contextActionsSel = moveSelectionByWheel(app.contextActionsSel, len(app.selectedContextActionItems()), button)
			return nil
		},
	})
	return rendered.modal
}

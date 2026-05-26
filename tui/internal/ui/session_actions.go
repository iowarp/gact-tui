package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
)

type sessionAction struct {
	id          string
	title       string
	description string
	key         string
	action      func(*App) tea.Cmd
}

func (a *App) openSessionActionsForIndex(index int) tea.Cmd {
	if index < 0 || index >= len(a.sessions) {
		return nil
	}
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	a.sidebarSectionCursor = false
	var cmd tea.Cmd
	if index != a.selected {
		a.selected = index
		cmd = a.selectSession(index)
	}
	a.sessionActionsOpen = true
	a.sessionActionsSel = 0
	return cmd
}

func (a *App) closeSessionActions() {
	a.sessionActionsOpen = false
	a.sessionActionsSel = 0
}

func (a *App) selectedSessionActionItems() []sessionAction {
	if a.selected < 0 || a.selected >= len(a.sessions) {
		return nil
	}
	s := a.sessions[a.selected]
	archiveTitle := "Archive session"
	if a.showArchived {
		archiveTitle = "Unarchive session"
	}
	deleteTitle := "Delete session"
	if a.pendingDeleteSessionID == s.ID {
		deleteTitle = "Confirm delete"
	}
	items := []sessionAction{
		{
			id:          "open",
			title:       "Open conversation",
			description: "Focus the prompt for the selected session.",
			key:         "Enter",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("enter"))
			},
		},
		{
			id:          "rename",
			title:       "Rename session",
			description: "Edit the visible title.",
			key:         "e",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("e"))
			},
		},
		{
			id:          "context",
			title:       "Add context file",
			description: "Attach a path to this session.",
			key:         "o",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("o"))
			},
		},
		{
			id:          "children",
			title:       "Toggle child sessions",
			description: "Show or hide nanoagent children in the sidebar.",
			key:         "c",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("c"))
			},
		},
		{
			id:          "copy-id",
			title:       "Copy session ID",
			description: "Copy the stable sess_ id.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("y"))
			},
		},
		{
			id:          "archive",
			title:       archiveTitle,
			description: "Move the session between active and archived views.",
			key:         "A",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("A"))
			},
		},
		{
			id:          "delete",
			title:       deleteTitle,
			description: "Two-step destructive action.",
			key:         "x",
			action: func(app *App) tea.Cmd {
				app.closeSessionActions()
				return app.routeSidebarFooterKey(keyMsg("x"))
			},
		},
	}
	return items
}

func (a *App) applySessionActionSelection() tea.Cmd {
	items := a.selectedSessionActionItems()
	if len(items) == 0 {
		a.closeSessionActions()
		return nil
	}
	if a.sessionActionsSel < 0 {
		a.sessionActionsSel = 0
	}
	if a.sessionActionsSel >= len(items) {
		a.sessionActionsSel = len(items) - 1
	}
	return items[a.sessionActionsSel].action(a)
}

func (a *App) handleSessionActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedSessionActionItems()
	switch k.String() {
	case "esc", "q", "left", "h", "m":
		a.closeSessionActions()
		return a, nil
	case "up", "k":
		a.sessionActionsSel = moveSelection(a.sessionActionsSel, len(items), -1)
		return a, nil
	case "down", "j":
		a.sessionActionsSel = moveSelection(a.sessionActionsSel, len(items), 1)
		return a, nil
	case "pgup", "ctrl+u", "g", "home":
		a.sessionActionsSel = 0
		return a, nil
	case "pgdown", "ctrl+d", "G", "end":
		if len(items) > 0 {
			a.sessionActionsSel = len(items) - 1
		}
		return a, nil
	case "enter":
		return a, a.applySessionActionSelection()
	}
	for i, item := range items {
		if k.String() == item.key {
			a.sessionActionsSel = i
			return a, item.action(a)
		}
	}
	return a, nil
}

func (a *App) viewSessionActions() string {
	t := a.Theme
	w := a.modalWidth()
	listW := w - 8
	if listW < 1 {
		listW = w - 4
	}
	items := a.selectedSessionActionItems()
	if a.sessionActionsSel < 0 {
		a.sessionActionsSel = 0
	}
	if a.sessionActionsSel >= len(items) && len(items) > 0 {
		a.sessionActionsSel = len(items) - 1
	}

	title := "Session actions"
	contextLine := t.HintLabel.Render("No session selected.")
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		name := strings.TrimSpace(s.Title)
		if name == "" {
			name = a.localizer.t(msgSidebarUntitled, nil)
		}
		title = truncate(name, 44)
		status := strings.TrimSpace(s.Status)
		if status == "" {
			status = "unknown"
		}
		contextLine = t.HintLabel.Render(fmt.Sprintf("%s · %s", shortID(s.ID), status))
	}

	rows := []string{contextLine, ""}
	listStartRow := len(rows)
	win := selectedItemWindow(len(items), a.sessionActionsSel, a.modalListItemBudget(5, 2, 8))
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		item := items[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:          "session-actions:" + item.id,
			title:       item.title,
			description: item.description,
			status:      item.key,
			selected:    i == a.sessionActionsSel,
			action: func(app *App) tea.Cmd {
				app.sessionActionsSel = idx
				return app.applySessionActionSelection()
			},
		})
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        14,
		descriptionLines: 1,
	})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   title,
			buttons: []menuButton{closeMenuButton("session-actions:close", func(app *App) { app.closeSessionActions() })},
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		window:         win,
		wheelID:        "session-actions:list:wheel",
		surfaceWheelID: "session-actions",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.sessionActionsSel = moveSelectionByWheel(app.sessionActionsSel, len(app.selectedSessionActionItems()), button)
			return nil
		},
	})
	return rendered.modal
}

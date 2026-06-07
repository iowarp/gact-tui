package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
)

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

func (a *App) selectedSessionActionItems() []actionMenuItem {
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
	items := []actionMenuItem{
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
			description: "Copy this session's identifier for logs or support.",
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
			description: "Ask for confirmation before deleting this session.",
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
	return a.applyActionMenuSelection(items, &a.sessionActionsSel, func(app *App) { app.closeSessionActions() })
}

func (a *App) handleSessionActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedSessionActionItems()
	if cmd, handled := a.handleActionMenuKey(k, items, &a.sessionActionsSel, func(app *App) { app.closeSessionActions() }); handled {
		return a, cmd
	}
	return a, nil
}

func (a *App) viewSessionActions() string {
	items := a.selectedSessionActionItems()

	title := "Session actions"
	contextLine := "No session selected."
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
		contextLine = fmt.Sprintf("%s · %s", shortID(s.ID), status)
	}

	return a.renderActionMenu(actionMenuOptions{
		prefix:      "session-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &a.sessionActionsSel,
		rowBudget:   14,
		close:       func(app *App) { app.closeSessionActions() },
	})
}

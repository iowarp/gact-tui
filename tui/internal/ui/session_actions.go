package ui

// sessionActionsModal: the per-session action menu overlay.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// sessionActionsModal is the per-session action menu's state: open flag plus
// the selectable-list cursor.
type sessionActionsModal struct {
	open bool
	sel  int
}

func (m *sessionActionsModal) reset() { *m = sessionActionsModal{} }

func (c *sessionComponent) openActionsForIndex(index int) tea.Cmd {
	if index < 0 || index >= len(c.sessions) {
		return nil
	}
	c.app.focus = FocusSidebar
	c.app.sidebar.setFocus(sidebarSectionSessions, false)
	var cmd tea.Cmd
	if index != c.selected {
		c.selected = index
		cmd = c.selectIndex(index)
	}
	c.actions.open = true
	c.actions.sel = 0
	return cmd
}

func (c *sessionComponent) closeActions() { c.actions.reset() }

func (c *sessionComponent) actionItems() []actionMenuItem {
	if c.selected < 0 || c.selected >= len(c.sessions) {
		return nil
	}
	s := c.sessions[c.selected]
	archiveTitle := "Archive session"
	if c.app.sidebar.showArchived {
		archiveTitle = "Unarchive session"
	}
	deleteTitle := "Delete session"
	if c.app.sidebar.pendingDeleteSessionID == s.ID {
		deleteTitle = "Confirm delete"
	}
	items := []actionMenuItem{
		{
			id:          "open",
			title:       "Open conversation",
			description: "Focus the prompt for the selected session.",
			key:         "Enter",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("enter"))
			},
		},
		{
			id:          "rename",
			title:       "Rename session",
			description: "Edit the visible title.",
			key:         "e",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("e"))
			},
		},
		{
			id:          "context",
			title:       "Add context file",
			description: "Attach a path to this session.",
			key:         "o",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("o"))
			},
		},
		{
			id:          "children",
			title:       "Toggle child sessions",
			description: "Show or hide nanoagent children in the sidebar.",
			key:         "c",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("c"))
			},
		},
		{
			id:          "copy-id",
			title:       "Copy session ID",
			description: "Copy this session's identifier for logs or support.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("y"))
			},
		},
		{
			id:          "archive",
			title:       archiveTitle,
			description: "Move the session between active and archived views.",
			key:         "A",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("A"))
			},
		},
		{
			id:          "delete",
			title:       deleteTitle,
			description: "Ask for confirmation before deleting this session.",
			key:         "x",
			action: func(app *App) tea.Cmd {
				app.session.closeActions()
				return app.chrome.routeSidebarFooterKey(keyMsg("x"))
			},
		},
	}
	return items
}

func (c *sessionComponent) handleActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := c.actionItems()
	if cmd, handled := c.app.modals.handleActionMenuKey(k, items, &c.actions.sel, func(app *App) { app.session.closeActions() }); handled {
		return c.app, cmd
	}
	return c.app, nil
}

func (c *sessionComponent) viewActions() string {
	items := c.actionItems()

	title := "Session actions"
	contextLine := "No session selected."
	if c.selected >= 0 && c.selected < len(c.sessions) {
		s := c.sessions[c.selected]
		name := strings.TrimSpace(s.Title)
		if name == "" {
			name = c.app.localizer.t(msgSidebarUntitled, nil)
		}
		title = textutil.Truncate(name, 44)
		status := strings.TrimSpace(s.Status)
		if status == "" {
			status = "unknown"
		}
		contextLine = fmt.Sprintf("%s · %s", shortID(s.ID), status)
	}

	return c.app.modals.renderActionMenu(actionMenuOptions{
		prefix:      "session-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &c.actions.sel,
		rowBudget:   14,
		close:       func(app *App) { app.session.closeActions() },
	})
}

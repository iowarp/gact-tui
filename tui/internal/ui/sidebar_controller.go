package ui

// sidebar_controller.go controls sidebar focus/section activation and routes its keys.

import tea "charm.land/bubbletea/v2"

func (c *sidebarComponent) activateSession(index int) tea.Cmd {
	c.app.focus = FocusSidebar
	c.sectionFocus = sidebarSectionSessions
	if index < 0 || index >= len(c.app.session.sessions) {
		return nil
	}
	if index != c.app.session.selected {
		c.sectionCursor = false
		c.app.session.selectSessionIndex(index)
		return c.app.session.selectIndex(index)
	}
	if c.childSessionCount(c.app.session.sessions[index].ID) > 0 {
		c.sectionCursor = false
		c.toggleChildSessions()
	}
	return nil
}

func (c *sidebarComponent) activateSection(section sidebarSection) {
	if c.app.focus != FocusRightSidebar {
		c.app.focus = FocusSidebar
	}
	c.sectionFocus = section
	c.sectionCursor = true
	switch section {
	case sidebarSectionAgents:
		if c.app.agent.toggleSidebarCollapsed() {
			c.app.setHint("agents section collapsed")
		} else {
			c.app.setHint("agents section expanded")
		}
	case sidebarSectionFiles:
		c.filesCollapsed = !c.filesCollapsed
		if c.filesCollapsed {
			c.app.setHint("files section collapsed (F to expand)")
		} else {
			c.app.setHint("files section expanded")
		}
	case sidebarSectionContext:
		c.contextCollapsed = !c.contextCollapsed
		if c.contextCollapsed {
			c.app.setHint("context section collapsed (C to expand)")
		} else {
			c.app.setHint("context section expanded")
		}
	default:
		c.sessionsCollapsed = !c.sessionsCollapsed
		if c.sessionsCollapsed {
			c.app.setHint("sessions section collapsed (S to expand)")
		} else {
			c.sectionCursor = false
			c.app.setHint("sessions section expanded")
		}
	}
}

// setFocus points the sidebar section focus at section and sets whether the
// per-row cursor is active. It's the method seam for the handful of callers
// outside the sidebar that need to steer section focus without reaching into
// sectionFocus/sectionCursor directly. Unlike activateSection it
// has no collapse/hint side effects, matching the old inline pokes exactly.
func (c *sidebarComponent) setFocus(section sidebarSection, cursor bool) {
	c.sectionFocus = section
	c.sectionCursor = cursor
}

func (c *sidebarComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	// Filter edit mode: keystrokes go into sessionFilter instead of
	// navigating/acting on the list. Enter commits (keeps the filter
	// but exits edit mode), Esc cancels AND clears the filter back to
	// whatever it was when `/` was pressed.
	if c.sessionFilterActive {
		return c.app.session.handleFilterKey(k)
	}

	if c.sessionsCollapsed {
		if c.handleCollapsedKey(k) {
			return c.app, nil
		}
	}

	switch k.String() {
	case "up", "k":
		return c.app, c.moveSelectionUp()
	case "down", "j":
		return c.app, c.moveSelectionDown()
	case "left":
		c.sectionCursor = true
		c.focusPreviousSection()
		return c.app, nil
	case "right":
		c.sectionCursor = true
		c.focusNextSection()
		return c.app, nil
	case "g", "home":
		return c.app, c.jumpToFirstVisible()
	case "G", "end":
		return c.app, c.jumpToLastVisible()
	case "pgup", "pageup", "ctrl+u":
		return c.app, c.pageSelection(-c.pageSize())
	case "pgdown", "pagedown", "ctrl+d":
		return c.app, c.pageSelection(+c.pageSize())
	case "enter":
		return c.app, c.handleEnter()
	case "m":
		return c.app, c.handleMenu()
	case "n":
		return c.app, c.app.session.openSetup(false)
	case "x":
		return c.app, c.handleDelete()
	case "e":
		c.openSessionRename()
		return c.app, nil
	case "/":
		// User feedback: typing /<cmd> from sidebar focus used to
		// enter sidebar filter mode and silently swallow the rest of
		// the slash command (e.g. /clear became filter "clear" with
		// "no matches"). Match the universal TUI convention: '/' opens
		// the global command palette regardless of focus. Sidebar
		// filter is now bound to 'f' (see below).
		c.app.cmdPalette.openModal()
		return c.app, nil
	case "f":
		// Sidebar filter was '/' before. Same semantics: enter
		// inline edit; Enter commits, Esc cancels + restores the
		// previous filter.
		c.app.session.enterFilter(false)
		return c.app, nil
	case "A":
		return c.app, c.handleArchive()
	case "o":
		c.openContextAdd()
		return c.app, nil
	case "h":
		// Toggle archived vs active view. Refetches the session list
		// with the new filter; the result falls into the existing
		// sessionsRefreshedMsg branch which preserves selection where
		// possible.
		return c.app, c.app.session.toggleArchived()
	case "d":
		c.toggleDetachedOnly()
	case "y":
		c.app.clipboard.copySelectedSessionID()
	case "b":
		c.toggleBusyOnly()
	case "c":
		c.toggleChildSessions()
	case "S":
		c.activateSection(sidebarSectionSessions)
	case "C":
		c.activateSection(sidebarSectionContext)
	case "F":
		if !c.hasEnabledModule(sidebarModuleFiles) {
			return c.app, nil
		}
		c.activateSection(sidebarSectionFiles)
	case "r":
		return c.app, c.refreshFocusedSection()
	}
	return c.app, nil
}

func (c *sidebarComponent) toggleChildSessions() {
	c.showChildSessions = !c.showChildSessions
	if c.showChildSessions {
		c.app.setHint("showing child sessions (c to collapse)")
	} else {
		c.app.setHint("child sessions collapsed (c to show)")
	}
	c.app.session.ensureSelectedVisible()
}

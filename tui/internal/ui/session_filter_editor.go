package ui

// session_filter_editor.go drives the sidebar session filter input editor.

import tea "charm.land/bubbletea/v2"

func (c *sessionComponent) enterFilter(clear bool) {
	c.app.focus = FocusSidebar
	c.app.sidebar.setFocus(sidebarSectionSessions, true)
	c.app.sidebar.beginFilterEdit(clear)
}

func (c *sessionComponent) toggleArchived() tea.Cmd {
	showArchived := c.app.sidebar.toggleShowArchived()
	c.app.setHint(archivedViewHint(showArchived))
	if c.wsID != "" {
		return reloadSessionsForView(c.app.c, c.wsID, showArchived)
	}
	return nil
}

// handleFilterKey drives the inline filter editor that opens on `/`
// in sidebar focus. It is intentionally a narrow, single-line editor.
func (c *sessionComponent) handleFilterKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		c.cancelFilter()
		return c.app, nil
	case "enter":
		c.commitFilter()
		return c.app, nil
	case "backspace":
		if r := []rune(c.app.sidebar.sessionFilter); len(r) > 0 {
			c.app.sidebar.setFilter(string(r[:len(r)-1]))
		}
		return c.app, nil
	}
	if k.Text != "" {
		c.app.sidebar.setFilter(c.app.sidebar.sessionFilter + k.Text)
	}
	return c.app, nil
}

func (c *sessionComponent) commitFilter() {
	c.app.sidebar.commitFilterEdit()
	c.ensureSelectedVisible()
}

func (c *sessionComponent) cancelFilter() {
	c.app.sidebar.cancelFilterEdit()
	c.ensureSelectedVisible()
}

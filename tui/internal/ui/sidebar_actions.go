package ui

// sidebar_actions.go handles sidebar item actions (enter/menu/delete/rename/archive/context/filters).

import tea "charm.land/bubbletea/v2"

func (c *sidebarComponent) handleEnter() tea.Cmd {
	if c.sectionCursor {
		c.toggleFocusedSection()
		return nil
	}
	if c.sectionFocus == sidebarSectionContext {
		c.clampContextFileSelection()
		if c.app.session.contextFileSel >= 0 && c.app.session.contextFileSel < len(c.app.session.contextFiles) {
			return c.app.contextFiles.openDetail(c.app.session.contextFiles[c.app.session.contextFileSel])
		}
		return nil
	}
	if c.sectionFocus == sidebarSectionFiles {
		c.app.fileViewer.activateSelection()
		return nil
	}
	if c.sectionFocus == sidebarSectionAgents {
		return c.app.agent.openSelectedAgentHierarchyDetail()
	}
	c.app.focus = FocusInput
	return nil
}

func (c *sidebarComponent) handleMenu() tea.Cmd {
	if c.sectionFocus == sidebarSectionContext && !c.sectionCursor {
		return c.app.contextActions.openModal(c.app.session.contextFileSel)
	}
	return c.app.session.openActionsForIndex(c.app.session.selected)
}

func (c *sidebarComponent) handleDelete() tea.Cmd {
	sid := c.app.session.currentID()
	if sid == "" {
		return nil
	}
	if c.pendingDeleteSessionID == sid {
		c.pendingDeleteSessionID = ""
		c.app.setHint("")
		delete(c.app.previouslyDetached, sid)
		if c.app.PruneDetachedRegistry != nil {
			c.app.PruneDetachedRegistry(sid)
		}
		return deleteSessionCmd(c.app.c, c.app.session.wsID, sid)
	}
	c.pendingDeleteSessionID = sid
	c.app.setHint("press x again to confirm delete (any other key cancels)")
	return nil
}

func (c *sidebarComponent) openSessionRename() {
	if c.app.session.selected < 0 || c.app.session.selected >= len(c.app.session.sessions) {
		return
	}
	c.app.rename.openModal(c.app.session.sessions[c.app.session.selected].Title)
	c.app.rename.input.SetCursor(len(c.app.rename.input.Value()))
}

func (c *sidebarComponent) handleArchive() tea.Cmd {
	if sid := c.app.session.currentID(); sid != "" {
		return archiveSessionCmd(c.app.c, sid, !c.showArchived)
	}
	return nil
}

func (c *sidebarComponent) openContextAdd() {
	if c.app.session.currentID() == "" {
		return
	}
	c.app.contextAdd.openModal()
}

func (c *sidebarComponent) toggleDetachedOnly() {
	c.showDetachedOnly = !c.showDetachedOnly
	c.app.setHint(detachedOnlyHint(c.showDetachedOnly, len(c.app.previouslyDetached)))
	c.app.session.ensureSelectedVisible()
}

func (c *clipboardComponent) copySelectedSessionID() {
	sid := c.app.session.currentID()
	if sid == "" {
		c.app.setHint("no session selected to copy")
		return
	}
	c.app.setHint(copyTextToClipboard(sid, sid))
}

func (c *sidebarComponent) toggleBusyOnly() {
	c.showBusyOnly = !c.showBusyOnly
	c.app.setHint(busyOnlyHint(c.showBusyOnly, busyOnlySessionCount(c.app.session.sessions)))
	c.app.session.ensureSelectedVisible()
}

func (c *sidebarComponent) refreshFocusedSection() tea.Cmd {
	if c.sectionFocus == sidebarSectionFiles {
		c.app.fileViewer.reload()
		c.app.setHint("files refreshed")
		return nil
	}
	if c.sectionFocus == sidebarSectionAgents {
		return loadAgentHierarchyCmd(c.app.c, c.app.session.runtimeScope())
	}
	return nil
}

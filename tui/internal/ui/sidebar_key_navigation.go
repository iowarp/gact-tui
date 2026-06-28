package ui

// sidebar_key_navigation.go handles sidebar selection navigation (up/down/page/first/last).

import tea "charm.land/bubbletea/v2"

func (c *sidebarComponent) handleCollapsedKey(k tea.KeyPressMsg) bool {
	c.sectionCursor = true
	switch k.String() {
	case "up", "k", "left", "pgup", "ctrl+u", "g", "home":
		c.focusPreviousSection()
		return true
	case "down", "j", "right", "pgdown", "ctrl+d", "G", "end":
		c.focusNextSection()
		return true
	case "enter":
		c.toggleFocusedSection()
		return true
	}
	return false
}

func (c *sidebarComponent) moveSelectionUp() tea.Cmd {
	if c.sectionCursor {
		c.focusPreviousSection()
		return nil
	}
	if c.sectionFocus == sidebarSectionContext {
		if c.app.session.contextFileSel <= 0 {
			c.app.session.selectContextFile(0)
			c.sectionCursor = true
			return nil
		}
		c.app.session.selectContextFile(c.app.session.contextFileSel - 1)
		return nil
	}
	if c.sectionFocus == sidebarSectionFiles {
		if c.app.fileViewer.fileTreeSel <= 0 {
			c.app.fileViewer.setTreeSel(0)
			c.sectionCursor = true
			return nil
		}
		c.app.fileViewer.setTreeSel(c.app.fileViewer.fileTreeSel - 1)
		return nil
	}
	if c.sectionFocus == sidebarSectionAgents {
		if c.app.agent.hierarchySel <= 0 {
			c.app.agent.setHierarchySel(0)
			c.sectionCursor = true
			return nil
		}
		c.app.agent.setHierarchySel(c.app.agent.hierarchySel - 1)
		return nil
	}
	if c.app.session.selected == c.firstVisibleSessionIndex() {
		c.sectionCursor = true
		c.sectionFocus = sidebarSectionSessions
		return nil
	}
	if c.app.session.stepSelectionVisible(-1) {
		c.sectionCursor = false
		return c.app.session.selectIndex(c.app.session.selected)
	}
	return nil
}

func (c *sidebarComponent) moveSelectionDown() tea.Cmd {
	if c.sectionCursor {
		if c.sectionFocus == sidebarSectionSessions {
			c.sectionCursor = false
		} else if c.sectionFocus == sidebarSectionFiles && !c.filesCollapsed && len(c.app.fileViewer.visibleEntries()) > 0 {
			c.sectionCursor = false
			c.app.fileViewer.clampSelection()
		} else if c.sectionFocus == sidebarSectionAgents && !c.app.agent.sidebarCollapsed() && len(c.app.agent.visibleAgentHierarchyRows()) > 0 {
			c.sectionCursor = false
			c.app.agent.clampAgentHierarchySelection()
		} else if c.sectionFocus == sidebarSectionContext && !c.contextCollapsed && len(c.app.session.contextFiles) > 0 {
			c.sectionCursor = false
			c.clampContextFileSelection()
		} else {
			c.focusNextSection()
		}
		return nil
	}
	if c.sectionFocus == sidebarSectionContext {
		if c.app.session.contextFileSel < len(c.app.session.contextFiles)-1 {
			c.app.session.selectContextFile(c.app.session.contextFileSel + 1)
		}
		return nil
	}
	if c.sectionFocus == sidebarSectionFiles {
		visible := c.app.fileViewer.visibleEntries()
		if c.app.fileViewer.fileTreeSel < len(visible)-1 {
			c.app.fileViewer.setTreeSel(c.app.fileViewer.fileTreeSel + 1)
		}
		return nil
	}
	if c.sectionFocus == sidebarSectionAgents {
		visible := c.app.agent.visibleAgentHierarchyRows()
		if c.app.agent.hierarchySel < len(visible)-1 {
			c.app.agent.setHierarchySel(c.app.agent.hierarchySel + 1)
		}
		return nil
	}
	if c.app.session.stepSelectionVisible(+1) {
		c.sectionCursor = false
		return c.app.session.selectIndex(c.app.session.selected)
	}
	return nil
}

func (c *sidebarComponent) jumpToFirstVisible() tea.Cmd {
	vis := c.app.session.visibleIndexes()
	if len(vis) > 0 && c.app.session.selected != vis[0] {
		c.sectionCursor = false
		c.app.session.selectSessionIndex(vis[0])
		return c.app.session.selectIndex(c.app.session.selected)
	}
	return nil
}

func (c *sidebarComponent) jumpToLastVisible() tea.Cmd {
	vis := c.app.session.visibleIndexes()
	if len(vis) > 0 && c.app.session.selected != vis[len(vis)-1] {
		c.sectionCursor = false
		c.app.session.selectSessionIndex(vis[len(vis)-1])
		return c.app.session.selectIndex(c.app.session.selected)
	}
	return nil
}

func (c *sidebarComponent) pageSelection(delta int) tea.Cmd {
	if c.app.session.stepSelectionVisible(delta) {
		c.sectionCursor = false
		return c.app.session.selectIndex(c.app.session.selected)
	}
	return nil
}

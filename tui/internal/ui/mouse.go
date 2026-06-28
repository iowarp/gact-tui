package ui

// mouse.go routes mouse wheel/click/motion/release events to the appropriate component.

import tea "charm.land/bubbletea/v2"

type mouseRect struct {
	x int
	y int
	w int
	h int
}

func (r mouseRect) contains(x, y int) bool {
	return x >= r.x && x < r.x+r.w && y >= r.y && y < r.y+r.h
}

func (c *interactionComponent) handleMouseWheel(m tea.MouseWheelMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if c.mouseOverlayOpen() {
		if cmd, handled := c.activateOverlayWheelHitAt(mouse.X, mouse.Y, mouse.Button); handled {
			return a, cmd
		}
		if cmd, handled := c.handleOverlayMouseWheel(m); handled {
			return a, cmd
		}
		return a, nil
	}
	if cmd, handled := c.activateWheelHitAt(mouse.X, mouse.Y, mouse.Button); handled {
		return a, cmd
	}
	return a, nil
}

func (c *interactionComponent) handleConversationWheel(button tea.MouseButton) tea.Cmd {
	a := c.app
	if len(a.conversation.messages) == 0 {
		return nil
	}
	switch button {
	case tea.MouseWheelUp:
		a.conversation.scrollLines(-3)
		if a.focus == FocusBody {
			a.conversation.stepPartCursorSelection(-1)
		}
	case tea.MouseWheelDown:
		a.conversation.scrollLines(3)
		if a.focus == FocusBody {
			a.conversation.stepPartCursorSelection(+1)
		}
	}
	return nil
}

func (c *interactionComponent) handleSidebarWheel(zone FocusZone, button tea.MouseButton) tea.Cmd {
	a := c.app
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	delta := 0
	switch button {
	case tea.MouseWheelUp:
		delta = -1
	case tea.MouseWheelDown:
		delta = 1
	default:
		return nil
	}

	a.focus = zone
	switch a.sidebar.sectionFocus {
	case sidebarSectionContext:
		if !a.sidebar.contextCollapsed && len(a.session.contextFiles) > 0 {
			a.sidebar.sectionCursor = false
			a.session.selectContextFile(moveSelection(a.session.contextFileSel, len(a.session.contextFiles), delta))
			return nil
		}
	case sidebarSectionFiles:
		visible := a.fileViewer.visibleEntries()
		if !a.sidebar.filesCollapsed && len(visible) > 0 {
			a.sidebar.sectionCursor = false
			a.fileViewer.fileTreeSel = moveSelection(a.fileViewer.fileTreeSel, len(visible), delta)
			return nil
		}
	case sidebarSectionAgents:
		visible := a.agent.visibleAgentHierarchyRows()
		if !a.agent.sidebarCollapsed() && len(visible) > 0 {
			a.sidebar.sectionCursor = false
			a.agent.hierarchySel = moveSelection(a.agent.hierarchySel, len(visible), delta)
			return nil
		}
	}

	if len(a.session.sessions) == 0 || a.sidebar.sessionsCollapsed {
		a.sidebar.sectionCursor = true
		a.sidebar.sectionFocus = sidebarSectionSessions
		return nil
	}
	a.sidebar.sectionFocus = sidebarSectionSessions
	a.sidebar.sectionCursor = false
	if a.session.stepSelectionVisible(delta) {
		return a.session.selectIndex(a.session.selected)
	}
	return nil
}

func (c *conversationComponent) scrollLines(delta int) {
	if delta == 0 {
		return
	}
	c.pendingPartScroll = false
	if delta < 0 {
		c.scrollOffset += -delta
		c.stickyToBottom = false
		return
	}
	if c.scrollOffset <= delta {
		c.scrollOffset = 0
		c.stickyToBottom = true
		return
	}
	c.scrollOffset -= delta
	c.stickyToBottom = false
}

func (c *interactionComponent) handleMouseClick(m tea.MouseClickMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if mouse.Mod&tea.ModAlt != 0 {
		return a, nil
	}
	if c.mouseOverlayOpen() {
		if mouse.Button == tea.MouseLeft && a.clipboard.beginDetailDrag(mouse.X, mouse.Y) {
			return a, nil
		}
		if mouse.Button == tea.MouseLeft && c.mouseClickInsideTopOverlay(mouse) {
			if cmd, handled := c.activateOverlayHitAt(mouse.X, mouse.Y, mouse.Button); handled {
				return a, cmd
			}
		}
		if cmd, handled := c.handleOverlayMouseClick(m); handled {
			return a, cmd
		}
		return a, nil
	}
	if mouse.Button == tea.MouseLeft {
		if a.clipboard.beginConversationDrag(mouse.X, mouse.Y) {
			return a, nil
		}
	}
	if cmd, handled := c.activateHitAt(mouse.X, mouse.Y, mouse.Button); handled {
		return a, cmd
	}
	return a, nil
}

func (c *interactionComponent) handleMouseMotion(m tea.MouseMotionMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if mouse.Mod&tea.ModAlt != 0 {
		return a, nil
	}
	if a.clipboard.detailCopyDrag.active {
		a.clipboard.updateDetailDrag(mouse.X, mouse.Y)
		return a, nil
	}
	if a.clipboard.copyDrag.active {
		a.clipboard.updateConversationDrag(mouse.X, mouse.Y)
	}
	return a, nil
}

func (c *interactionComponent) handleMouseRelease(m tea.MouseReleaseMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if mouse.Mod&tea.ModAlt != 0 {
		a.clipboard.detailCopyDrag = conversationCopyDrag{}
		a.clipboard.copyDrag = conversationCopyDrag{}
		return a, nil
	}
	if a.clipboard.finishDetailDrag(mouse.X, mouse.Y) {
		return a, scheduleHintExpire(a.transientHint)
	}
	if a.clipboard.copyDrag.active && !a.clipboard.copyDrag.moved {
		a.clipboard.copyDrag = conversationCopyDrag{}
		if cmd, handled := c.activateHitAt(mouse.X, mouse.Y, tea.MouseLeft); handled {
			return a, cmd
		}
		return a, nil
	}
	if a.clipboard.finishConversationDrag(mouse.X, mouse.Y) {
		return a, scheduleHintExpire(a.transientHint)
	}
	return a, nil
}

package ui

// workspace_switch_events.go handles workspace switched/created/deleted and session refreshed/deleted messages.

import tea "charm.land/bubbletea/v2"

func (w *workspaceModal) resetScopedUIState() {
	a := w.app
	a.session.setSessions(nil)
	a.session.selectSessionIndex(-1)
	a.session.selectContextFile(0)
	a.session.clearScopedState()
	a.conversation.resetScopedView()
	if a.detail.visible && a.detail.ref != nil {
		switch a.detail.ref.messageID {
		case "context", "files":
			a.detail.close()
		}
	}
	a.fileViewer.syncRootToWorkspace()
}

// handleRefreshed keeps the current session selected when it survives
// a sidebar refresh, and otherwise keeps the cursor near the previous row.
//
// m.sessions is a FILTERED view, not the set of live sessions: every list is
// workspace-scoped, and reloadSessionsForView additionally applies the
// Archived filter. Nothing here may treat absence from m.sessions as
// deletion — in particular, execution ledgers are pruned only on an explicit
// deletion signal (sessionDeletedMsg) or session.cleared (#231).
func (c *sessionComponent) handleRefreshed(m sessionsRefreshedMsg) (tea.Model, tea.Cmd) {
	prevID := c.currentID()
	c.sessions = m.sessions
	c.sortByActivity()
	if len(c.sessions) == 0 {
		c.selected = -1
		c.app.conversation.clearMessages()
		c.currentStatus = ""
		return c.app, nil
	}

	newIdx := -1
	for i, s := range c.sessions {
		if s.ID == prevID {
			newIdx = i
			break
		}
	}
	if newIdx >= 0 {
		c.selected = newIdx
		c.currentStatus = c.sessions[newIdx].Status
		return c.app, nil
	}

	newIdx = c.selected
	if newIdx < 0 {
		newIdx = 0
	}
	if newIdx >= len(c.sessions) {
		newIdx = len(c.sessions) - 1
	}
	c.selected = newIdx
	return c.app, c.selectIndex(newIdx)
}

// handleSessionDeleted reacts to a backend-confirmed session deletion: it
// drops the deleted session's execution ledger — confirmed deletion is the
// only list-independent proof a session is gone (#231) — then re-lists the
// current workspace so the sidebar drops the row. If the re-list fails it
// surfaces as errMsg{stage: "list-sessions"} through the normal error path;
// the ledger drop has already happened by then.
func (c *sessionComponent) handleSessionDeleted(m sessionDeletedMsg) (tea.Model, tea.Cmd) {
	c.app.execution.dropDeletedSessionLedger(m.sessionID)
	return c.app, reloadSessionsCmd(c.app.c, c.wsID)
}

// handleSwitched applies a workspace switch response and ignores
// stale responses from earlier workspace selections.
func (w *workspaceModal) handleSwitched(m workspaceSwitchedMsg) (tea.Model, tea.Cmd) {
	a := w.app
	if m.wsID != a.session.wsID {
		return a, nil
	}
	a.session.setSessions(m.sessions)
	a.fileViewer.syncRootToWorkspace()
	a.session.sortByActivity()
	if len(a.session.sessions) == 0 {
		a.session.selectSessionIndex(-1)
		a.conversation.clearMessages()
		return a, loadAgentHierarchyCmd(a.c, a.session.runtimeScope())
	}
	a.session.selectSessionIndex(0)
	return a, tea.Batch(a.session.selectIndex(0), loadAgentHierarchyCmd(a.c, a.session.runtimeScope()))
}

func (w *workspaceModal) handleCreated(m workspaceCreatedMsg) (tea.Model, tea.Cmd) {
	a := w.app
	w.create.saving = false
	if m.err != nil {
		w.create.error = operatorErrorMessage(m.err)
		w.create.open = true
		w.switchOpen = true
		return a, nil
	}
	created := m.workspace
	found := false
	for i := range a.session.workspaces {
		if a.session.workspaces[i].ID == created.ID {
			a.session.workspaces[i] = created
			found = true
			break
		}
	}
	if !found {
		a.session.workspaces = append(a.session.workspaces, created)
	}
	w.close()
	if a.connection.sseCancel != nil {
		a.connection.sseCancel()
		a.connection.sseCancel = nil
	}
	a.session.setWorkspaceID(created.ID)
	w.resetScopedUIState()
	a.setHint("created workspace " + workspaceLabel(created))
	return a, listSessionsCmd(a.c, created.ID)
}

func (w *workspaceModal) handleDeleted(m workspaceDeletedMsg) (tea.Model, tea.Cmd) {
	a := w.app
	w.deleteSaving = false
	if m.err != nil {
		w.deleteError = operatorErrorMessage(m.err)
		w.switchOpen = true
		return a, nil
	}
	removedLabel := m.workspaceID
	next := a.session.workspaces[:0]
	for _, ws := range a.session.workspaces {
		if ws.ID == m.workspaceID {
			removedLabel = workspaceLabelPlain(ws)
			continue
		}
		next = append(next, ws)
	}
	a.session.workspaces = next
	w.deleteID = ""
	w.deleteError = ""
	w.switchSel = clampSelection(w.switchSel, len(a.session.workspaces))
	a.setHint("removed workspace " + removedLabel)
	return a, scheduleHintExpire(a.transientHint)
}

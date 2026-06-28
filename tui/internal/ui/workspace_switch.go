package ui

// workspaceModal: the workspace switcher and create/delete-workspace overlay.

import (
	tea "charm.land/bubbletea/v2"
)

// workspaceModal is the workspace switcher overlay's state. The switcher picks
// from the loaded workspace list; the create sub-form and the delete-confirm
// fields nest under it so all workspace-management state lives in one place.
type workspaceModal struct {
	app        *App
	switchOpen bool
	switchSel  int
	create     workspaceCreateState

	deleteID     string
	deleteSaving bool
	deleteError  string
}

// workspaceCreateState is the new-workspace form: a folder/git mode toggle and
// three editable fields (name, root, git URL) each with their own rune cursor,
// plus the focused field index and inline saving/error status.
type workspaceCreateState struct {
	open    bool
	mode    string
	name    string
	nameCur int
	root    string
	rootCur int
	gitURL  string
	gitCur  int
	field   int
	saving  bool
	error   string
}

// handleKey routes keys while the workspace switcher
// modal is open. Esc/Ctrl+C cancels; ↑/↓ (or j/k) navigates; Enter
// switches and closes. Any other key is swallowed so the textarea
// below the modal doesn't accidentally capture typing.
func (w *workspaceModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if w.create.open {
		return w.handleCreateKey(k)
	}
	switch k.String() {
	case "esc", "ctrl+c":
		w.close()
		return w.app, nil
	case "n":
		w.openCreateMode("folder")
		return w.app, nil
	case "g":
		w.openCreateMode("git")
		return w.app, nil
	case "d":
		return w.handleDeleteKey()
	case "y":
		return w.confirmDelete()
	case "u":
		if w.deleteID != "" {
			w.deleteID = ""
			w.deleteError = ""
		}
		return w.app, nil
	case "up", "k":
		w.switchSel = moveSelection(w.switchSel, len(w.app.session.workspaces), -1)
		return w.app, nil
	case "down", "j":
		w.switchSel = moveSelection(w.switchSel, len(w.app.session.workspaces), 1)
		return w.app, nil
	case "enter":
		if w.switchSel < 0 || w.switchSel >= len(w.app.session.workspaces) {
			w.close()
			return w.app, nil
		}
		next := w.app.session.workspaces[w.switchSel]
		w.close()
		if next.ID == w.app.session.wsID {
			// No-op pick — user hit Enter on the current workspace.
			w.app.setHint("already on " + workspaceLabel(next))
			return w.app, nil
		}
		// Switching invalidates everything session-scoped. Tear down the
		// SSE stream, clear sessions/messages/context, then kick a fresh
		// listSessions for the new workspace.
		if w.app.connection.sseCancel != nil {
			w.app.connection.sseCancel()
			w.app.connection.sseCancel = nil
		}
		w.app.session.setWorkspaceID(next.ID)
		w.resetScopedUIState()
		w.app.setHint("switched to " + workspaceLabel(next))
		return w.app, listSessionsCmd(w.app.c, next.ID)
	}
	return w.app, nil
}

func (w *workspaceModal) close() {
	w.switchOpen = false
	w.closeCreate()
	w.deleteID = ""
	w.deleteSaving = false
	w.deleteError = ""
}

func (w *workspaceModal) handleDeleteKey() (tea.Model, tea.Cmd) {
	if w.deleteSaving {
		return w.app, nil
	}
	if w.switchSel < 0 || w.switchSel >= len(w.app.session.workspaces) {
		return w.app, nil
	}
	ws := w.app.session.workspaces[w.switchSel]
	if ws.ID == "" {
		return w.app, nil
	}
	if ws.ID == w.app.session.wsID {
		w.deleteError = "switch to another workspace before removing this one"
		w.deleteID = ws.ID
		return w.app, nil
	}
	if w.deleteID == ws.ID {
		return w.confirmDelete()
	}
	w.deleteID = ws.ID
	w.deleteError = ""
	return w.app, nil
}

func (w *workspaceModal) confirmDelete() (tea.Model, tea.Cmd) {
	if w.deleteSaving || w.deleteID == "" {
		return w.app, nil
	}
	workspaceID := w.deleteID
	if workspaceID == w.app.session.wsID {
		w.deleteError = "switch to another workspace before removing this one"
		return w.app, nil
	}
	w.deleteSaving = true
	w.deleteError = ""
	return w.app, deleteWorkspaceCmd(w.app.c, workspaceID)
}

package ui

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// handleWorkspaceSwitchKey routes keys while the workspace switcher
// modal is open. Esc/Ctrl+C cancels; ↑/↓ (or j/k) navigates; Enter
// switches and closes. Any other key is swallowed so the textarea
// below the modal doesn't accidentally capture typing.
func (a *App) handleWorkspaceSwitchKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeWorkspaceSwitchModal()
		return a, nil
	case "up", "k":
		if a.workspaceSwitchSel > 0 {
			a.workspaceSwitchSel--
		}
		return a, nil
	case "down", "j":
		if a.workspaceSwitchSel < len(a.workspaces)-1 {
			a.workspaceSwitchSel++
		}
		return a, nil
	case "enter":
		if a.workspaceSwitchSel < 0 || a.workspaceSwitchSel >= len(a.workspaces) {
			a.closeWorkspaceSwitchModal()
			return a, nil
		}
		next := a.workspaces[a.workspaceSwitchSel]
		a.closeWorkspaceSwitchModal()
		if next.ID == a.wsID {
			// No-op pick — user hit Enter on the current workspace.
			a.transientHint = "already on " + workspaceLabel(next)
			return a, nil
		}
		// Switching invalidates everything session-scoped. Tear down the
		// SSE stream, clear sessions/messages/context, then kick a fresh
		// listSessions for the new workspace.
		if a.sseCancel != nil {
			a.sseCancel()
			a.sseCancel = nil
		}
		a.wsID = next.ID
		a.sessions = nil
		a.selected = -1
		a.messages = nil
		a.contextFiles = nil
		a.pendingPermissions = nil
		a.transientHint = "switched to " + workspaceLabel(next)
		return a, listSessionsCmd(a.c, next.ID)
	}
	return a, nil
}

// listSessionsCmd fetches sessions for the given workspace. Separate
// from the existing reloadSessionsCmd because we want a distinct result
// message — workspaceSessionsMsg vs sessionsRefreshedMsg — so the
// Update dispatcher can tell "switched workspace, pick index 0" apart
// from "subagent spawned, preserve current selection".
func listSessionsCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return workspaceSwitchedMsg{wsID: wsID, sessions: sessions}
	}
}

// workspaceSwitchedMsg is dispatched after listSessionsCmd returns.
// The Update handler picks session #0 (if any) and starts its SSE
// stream, completing the context switch.
type workspaceSwitchedMsg struct {
	wsID     string
	sessions []gact.Session
}

func (a *App) closeWorkspaceSwitchModal() {
	a.workspaceSwitchOpen = false
}

const workspaceSwitchMaxItems = 8

// viewWorkspaceSwitch renders the modal. Matches the settings/metrics
// overlay style so the user's muscle memory carries over.
func (a *App) viewWorkspaceSwitch() string {
	t := a.Theme
	w := a.modalWidth()
	buttons := []menuButton{closeMenuButton("workspace-switch:close", func(app *App) { app.closeWorkspaceSwitchModal() })}
	rows := []string{}
	if len(a.workspaces) == 0 {
		rows = append(rows, t.HintLabel.Render("(no workspaces — backend returned an empty list)"))
	}
	innerW := modalInnerWidth(w)
	listW := innerW - 4
	if listW < 1 {
		listW = innerW
	}
	itemBudget := a.modalListItemBudget(4, 1, workspaceSwitchMaxItems)
	win := selectedItemWindow(len(a.workspaces), a.workspaceSwitchSel, itemBudget)
	listStartRow := len(rows)
	items := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		ws := a.workspaces[i]
		status := ""
		if ws.ID == a.wsID {
			status = "current"
		}
		idx := i
		items = append(items, modalListItem{
			id:       "workspace-switch:item:" + ws.ID,
			title:    workspaceLabelPlain(ws),
			status:   status,
			selected: i == a.workspaceSwitchSel,
			action: func(app *App) tea.Cmd {
				app.workspaceSwitchSel = idx
				_, cmd := app.handleWorkspaceSwitchKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	list := a.renderModalList(items, modalListOptions{width: listW, rowBudget: itemBudget})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Switch workspace",
			buttons: buttons,
			footer:  t.HintLabel.Render(modalKeyHint("↑/↓ select", "Enter switch", "Esc cancel")),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       itemBudget,
		window:         win,
		wheelID:        "workspace-switch:list:wheel",
		surfaceWheelID: "workspace-switch",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			if len(app.workspaces) == 0 {
				return nil
			}
			app.workspaceSwitchSel = moveSelectionByWheel(app.workspaceSwitchSel, len(app.workspaces), button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.workspaceSwitchSel = clampSelection(index, len(app.workspaces))
			return nil
		},
	})
	return rendered.modal
}

// workspaceLabel renders a workspace as "name id" with the ID
// dimmed. Used by toasts where styling at the call site is fine.
func workspaceLabel(ws gact.Workspace) string {
	if ws.Name == "" {
		return ws.ID
	}
	return ws.Name + "  " +
		lipgloss.NewStyle().Faint(true).Render(ws.ID)
}

// workspaceLabelPlain returns the unstyled label so the modal can
// truncate without slicing through ANSI escape sequences (which would
// produce visible garbage). Style is reapplied after truncation by
// the caller.
func workspaceLabelPlain(ws gact.Workspace) string {
	if ws.Name == "" {
		return ws.ID
	}
	return ws.Name + "  " + ws.ID
}

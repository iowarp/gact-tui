package ui

import (
	"context"
	"os"
	"strings"
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
	if a.workspaceCreateOpen {
		return a.handleWorkspaceCreateKey(k)
	}
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeWorkspaceSwitchModal()
		return a, nil
	case "n":
		a.openWorkspaceCreate()
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

type workspaceCreatedMsg struct {
	workspace gact.Workspace
	err       error
}

func (a *App) closeWorkspaceSwitchModal() {
	a.workspaceSwitchOpen = false
	a.closeWorkspaceCreate()
}

func (a *App) closeWorkspaceCreate() {
	a.workspaceCreateOpen = false
	a.workspaceCreateName = ""
	a.workspaceCreateNameCur = 0
	a.workspaceCreateRoot = ""
	a.workspaceCreateRootCur = 0
	a.workspaceCreateField = 0
	a.workspaceCreateSaving = false
	a.workspaceCreateError = ""
}

func (a *App) openWorkspaceCreate() {
	a.workspaceSwitchOpen = true
	a.workspaceCreateOpen = true
	a.workspaceCreateSaving = false
	a.workspaceCreateError = ""
	a.workspaceCreateField = 0
	if a.workspaceCreateRoot == "" {
		a.workspaceCreateRoot = a.defaultWorkspaceCreateRoot()
		a.workspaceCreateRootCur = len([]rune(a.workspaceCreateRoot))
	}
	if a.workspaceCreateNameCur > len([]rune(a.workspaceCreateName)) {
		a.workspaceCreateNameCur = len([]rune(a.workspaceCreateName))
	}
}

func (a *App) defaultWorkspaceCreateRoot() string {
	if root := strings.TrimSpace(a.currentWorkspaceRootPath()); root != "" {
		return root
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		return wd
	}
	return ""
}

func (a *App) handleWorkspaceCreateKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc":
		a.closeWorkspaceCreate()
		return a, nil
	case "ctrl+c":
		a.closeWorkspaceSwitchModal()
		return a, nil
	case "tab", "shift+tab":
		if a.workspaceCreateField == 0 {
			a.workspaceCreateField = 1
		} else {
			a.workspaceCreateField = 0
		}
		return a, nil
	case "enter":
		return a.commitWorkspaceCreate()
	case "backspace":
		a.editWorkspaceCreateField(func(value string, cursor int) (string, int) {
			if cursor == 0 {
				return value, cursor
			}
			runes := []rune(value)
			runes = append(runes[:cursor-1], runes[cursor:]...)
			return string(runes), cursor - 1
		})
		return a, nil
	case "delete":
		a.editWorkspaceCreateField(func(value string, cursor int) (string, int) {
			runes := []rune(value)
			if cursor >= len(runes) {
				return value, cursor
			}
			runes = append(runes[:cursor], runes[cursor+1:]...)
			return string(runes), cursor
		})
		return a, nil
	case "left":
		a.moveWorkspaceCreateCursor(-1)
		return a, nil
	case "right":
		a.moveWorkspaceCreateCursor(1)
		return a, nil
	case "home", "ctrl+a":
		a.setWorkspaceCreateCursor(0)
		return a, nil
	case "end", "ctrl+e":
		if a.workspaceCreateField == 0 {
			a.workspaceCreateNameCur = len([]rune(a.workspaceCreateName))
		} else {
			a.workspaceCreateRootCur = len([]rune(a.workspaceCreateRoot))
		}
		return a, nil
	}
	if k.Text != "" {
		text := k.Text
		a.editWorkspaceCreateField(func(value string, cursor int) (string, int) {
			runes := []rune(value)
			insert := []rune(text)
			out := make([]rune, 0, len(runes)+len(insert))
			out = append(out, runes[:cursor]...)
			out = append(out, insert...)
			out = append(out, runes[cursor:]...)
			return string(out), cursor + len(insert)
		})
	}
	return a, nil
}

func (a *App) editWorkspaceCreateField(edit func(value string, cursor int) (string, int)) {
	if a.workspaceCreateField == 0 {
		value, cursor := edit(a.workspaceCreateName, a.workspaceCreateNameCur)
		a.workspaceCreateName = value
		a.workspaceCreateNameCur = clampInt(cursor, 0, len([]rune(value)))
		return
	}
	value, cursor := edit(a.workspaceCreateRoot, a.workspaceCreateRootCur)
	a.workspaceCreateRoot = value
	a.workspaceCreateRootCur = clampInt(cursor, 0, len([]rune(value)))
}

func (a *App) moveWorkspaceCreateCursor(delta int) {
	if a.workspaceCreateField == 0 {
		a.workspaceCreateNameCur = clampInt(a.workspaceCreateNameCur+delta, 0, len([]rune(a.workspaceCreateName)))
		return
	}
	a.workspaceCreateRootCur = clampInt(a.workspaceCreateRootCur+delta, 0, len([]rune(a.workspaceCreateRoot)))
}

func (a *App) setWorkspaceCreateCursor(cursor int) {
	if a.workspaceCreateField == 0 {
		a.workspaceCreateNameCur = clampInt(cursor, 0, len([]rune(a.workspaceCreateName)))
		return
	}
	a.workspaceCreateRootCur = clampInt(cursor, 0, len([]rune(a.workspaceCreateRoot)))
}

func (a *App) commitWorkspaceCreate() (tea.Model, tea.Cmd) {
	if a.workspaceCreateSaving {
		return a, nil
	}
	root := strings.TrimSpace(a.workspaceCreateRoot)
	if root == "" {
		a.workspaceCreateError = "root path is required"
		a.workspaceCreateField = 1
		return a, nil
	}
	a.workspaceCreateSaving = true
	a.workspaceCreateError = ""
	return a, createWorkspaceCmd(a.c, strings.TrimSpace(a.workspaceCreateName), root)
}

func createWorkspaceCmd(c *client.Client, name, rootPath string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		ws, err := c.CreateWorkspace(ctx, client.CreateWorkspaceRequest{Name: name, RootPath: rootPath})
		return workspaceCreatedMsg{workspace: ws, err: err}
	}
}

const workspaceSwitchMaxItems = 8

// viewWorkspaceSwitch renders the modal. Matches the settings/metrics
// overlay style so the user's muscle memory carries over.
func (a *App) viewWorkspaceSwitch() string {
	if a.workspaceCreateOpen {
		return a.viewWorkspaceCreate()
	}
	t := a.Theme
	w := a.modalWidth()
	buttons := []menuButton{
		{
			id:    "workspace-switch:new",
			label: "new",
			action: func(app *App) tea.Cmd {
				app.openWorkspaceCreate()
				return nil
			},
		},
		closeMenuButton("workspace-switch:close", func(app *App) { app.closeWorkspaceSwitchModal() }),
	}
	rows := []string{}
	if len(a.workspaces) == 0 {
		rows = append(rows, t.HintLabel.Render("(no workspaces yet — create one with n/new)"))
	}
	listW := modalInsetListWidth(w)
	itemBudget := a.modalListItemBudget(4, 2, workspaceSwitchMaxItems)
	rowBudget := itemBudget * 2
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
			id:          "workspace-switch:item:" + ws.ID,
			title:       workspaceLabelPlain(ws),
			description: workspaceRootPlain(ws),
			status:      status,
			selected:    i == a.workspaceSwitchSel,
			action: func(app *App) tea.Cmd {
				app.workspaceSwitchSel = idx
				_, cmd := app.handleWorkspaceSwitchKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	list := a.renderModalList(items, modalListOptions{width: listW, rowBudget: rowBudget, descriptionLines: 1})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Switch workspace",
			buttons: buttons,
			footer:  t.HintLabel.Render(modalKeyHint("↑/↓ select", "Enter switch", "n new", "Esc cancel")),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       rowBudget,
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

func (a *App) viewWorkspaceCreate() string {
	t := a.Theme
	w := a.modalWidth()
	buttons := []menuButton{
		{
			id:       "workspace-create:save",
			label:    "create",
			disabled: a.workspaceCreateSaving,
			action: func(app *App) tea.Cmd {
				_, cmd := app.commitWorkspaceCreate()
				return cmd
			},
		},
		{
			id:    "workspace-create:back",
			label: "back",
			action: func(app *App) tea.Cmd {
				app.closeWorkspaceCreate()
				return nil
			},
		},
		closeMenuButton("workspace-create:close", func(app *App) { app.closeWorkspaceSwitchModal() }),
	}

	activeLabel := "Name"
	editorValue := a.workspaceCreateName
	editorCursor := a.workspaceCreateNameCur
	editorID := "workspace-create-name"
	if a.workspaceCreateField == 1 {
		activeLabel = "Root path"
		editorValue = a.workspaceCreateRoot
		editorCursor = a.workspaceCreateRootCur
		editorID = "workspace-create-root"
	}

	nameMarker := "  "
	rootMarker := "  "
	if a.workspaceCreateField == 0 {
		nameMarker = "▌ "
	} else {
		rootMarker = "▌ "
	}
	status := []string{
		nameMarker + "name: " + emptyPlaceholder(a.workspaceCreateName, "(optional, backend derives from root)"),
		rootMarker + "root: " + emptyPlaceholder(a.workspaceCreateRoot, "(required)"),
	}
	if a.workspaceCreateError != "" {
		status = append(status, lipgloss.NewStyle().Foreground(t.Danger).Render("error: "+a.workspaceCreateError))
	}
	if a.workspaceCreateSaving {
		status = append(status, t.HintLabel.Render("creating workspace..."))
	}
	statusHits := []modalCellHit{
		{
			id:     "workspace-create:field:name",
			row:    0,
			col:    0,
			width:  modalInnerWidth(w),
			height: 1,
			action: func(app *App) tea.Cmd {
				app.workspaceCreateField = 0
				return nil
			},
		},
		{
			id:     "workspace-create:field:root",
			row:    1,
			col:    0,
			width:  modalInnerWidth(w),
			height: 1,
			action: func(app *App) tea.Cmd {
				app.workspaceCreateField = 1
				return nil
			},
		},
	}

	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       "Create workspace · " + activeLabel,
		buttons:     buttons,
		surfaceID:   "workspace-create",
		intro:       []string{"Create a workspace with an explicit root folder."},
		editor:      activeLabel + ": " + a.renderCursorEditor(editorValue, editorCursor),
		editorID:    editorID,
		editorValue: editorValue,
		cursorAction: func(app *App, cursor int) {
			if app.workspaceCreateField == 0 {
				app.workspaceCreateNameCur = cursor
			} else {
				app.workspaceCreateRootCur = cursor
			}
		},
		status:     status,
		statusHits: statusHits,
		footer:     t.HintLabel.Render(modalKeyHint("Tab field", "Enter create", "Esc back", "Ctrl+C close")),
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

func workspaceRootPlain(ws gact.Workspace) string {
	root := strings.TrimSpace(ws.RootPath)
	if root == "" {
		return "root: (not provided)"
	}
	return "root: " + root
}

func emptyPlaceholder(value, placeholder string) string {
	if strings.TrimSpace(value) == "" {
		return placeholder
	}
	return value
}

package ui

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
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
		a.openWorkspaceCreateMode("folder")
		return a, nil
	case "g":
		a.openWorkspaceCreateMode("git")
		return a, nil
	case "d":
		return a.handleWorkspaceDeleteKey()
	case "y":
		return a.confirmWorkspaceDelete()
	case "u":
		if a.workspaceDeleteID != "" {
			a.workspaceDeleteID = ""
			a.workspaceDeleteError = ""
		}
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
		a.resetWorkspaceScopedUIState()
		a.transientHint = "switched to " + workspaceLabel(next)
		return a, listSessionsCmd(a.c, next.ID)
	}
	return a, nil
}

func (a *App) resetWorkspaceScopedUIState() {
	a.sessions = nil
	a.selected = -1
	a.messages = nil
	a.contextFiles = nil
	a.contextFileSel = 0
	a.pendingPermissions = nil
	a.currentStatus = ""
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.bodySelMsgIdx = -1
	a.bodySelPartIdx = -1
	if a.detailViewOpen && a.detailView != nil {
		switch a.detailView.messageID {
		case "context", "files":
			a.closeDetailView()
		}
	}
	a.syncFileViewerRootToWorkspace()
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

type workspaceCloneError struct {
	message string
}

func (e workspaceCloneError) Error() string {
	if strings.TrimSpace(e.message) == "" {
		return "Git clone failed"
	}
	return "Git clone failed: " + e.message
}

type workspaceDeletedMsg struct {
	workspaceID string
	err         error
}

func (a *App) closeWorkspaceSwitchModal() {
	a.workspaceSwitchOpen = false
	a.closeWorkspaceCreate()
	a.workspaceDeleteID = ""
	a.workspaceDeleteSaving = false
	a.workspaceDeleteError = ""
}

func (a *App) closeWorkspaceCreate() {
	a.workspaceCreateOpen = false
	a.workspaceCreateMode = ""
	a.workspaceCreateName = ""
	a.workspaceCreateNameCur = 0
	a.workspaceCreateRoot = ""
	a.workspaceCreateRootCur = 0
	a.workspaceCreateGitURL = ""
	a.workspaceCreateGitCur = 0
	a.workspaceCreateField = 0
	a.workspaceCreateSaving = false
	a.workspaceCreateError = ""
}

func (a *App) openWorkspaceCreate() {
	a.openWorkspaceCreateMode("folder")
}

func (a *App) openWorkspaceCreateMode(mode string) {
	if mode != "git" {
		mode = "folder"
	}
	a.workspaceSwitchOpen = true
	a.workspaceCreateOpen = true
	a.workspaceCreateMode = mode
	a.workspaceCreateSaving = false
	a.workspaceCreateError = ""
	a.workspaceCreateField = 0
	if mode == "git" && a.workspaceCreateGitURL == "" {
		a.workspaceCreateField = 1
	}
	if a.workspaceCreateRoot == "" {
		a.workspaceCreateRoot = a.defaultWorkspaceCreateRoot()
		a.workspaceCreateRootCur = len([]rune(a.workspaceCreateRoot))
	}
	if mode == "git" && strings.TrimSpace(a.workspaceCreateGitURL) == "" && strings.TrimSpace(a.workspaceCreateRoot) == strings.TrimSpace(a.defaultWorkspaceCreateRoot()) {
		a.workspaceCreateRoot = ""
		a.workspaceCreateRootCur = 0
	}
	if a.workspaceCreateNameCur > len([]rune(a.workspaceCreateName)) {
		a.workspaceCreateNameCur = len([]rune(a.workspaceCreateName))
	}
	if a.workspaceCreateGitCur > len([]rune(a.workspaceCreateGitURL)) {
		a.workspaceCreateGitCur = len([]rune(a.workspaceCreateGitURL))
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
	case "tab":
		a.workspaceCreateField = (a.workspaceCreateField + 1) % a.workspaceCreateFieldCount()
		return a, nil
	case "shift+tab":
		a.workspaceCreateField = (a.workspaceCreateField - 1 + a.workspaceCreateFieldCount()) % a.workspaceCreateFieldCount()
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
		switch a.workspaceCreateField {
		case 0:
			a.workspaceCreateNameCur = len([]rune(a.workspaceCreateName))
		case 1:
			if a.workspaceCreateMode == "git" {
				a.workspaceCreateGitCur = len([]rune(a.workspaceCreateGitURL))
			} else {
				a.workspaceCreateRootCur = len([]rune(a.workspaceCreateRoot))
			}
		default:
			a.workspaceCreateRootCur = len([]rune(a.workspaceCreateRoot))
		}
		return a, nil
	}
	if k.Text != "" {
		a.insertWorkspaceCreateText(k.Text)
	}
	return a, nil
}

func (a *App) insertWorkspaceCreateText(text string) {
	a.editWorkspaceCreateField(func(value string, cursor int) (string, int) {
		return insertTextAtCursor(value, cursor, text)
	})
}

func (a *App) editWorkspaceCreateField(edit func(value string, cursor int) (string, int)) {
	switch a.workspaceCreateField {
	case 0:
		value, cursor := edit(a.workspaceCreateName, a.workspaceCreateNameCur)
		a.workspaceCreateName = value
		a.workspaceCreateNameCur = clampInt(cursor, 0, len([]rune(value)))
		return
	case 1:
		if a.workspaceCreateMode == "git" {
			oldName, oldRoot := a.currentDerivedGitWorkspaceFields()
			value, cursor := edit(a.workspaceCreateGitURL, a.workspaceCreateGitCur)
			a.workspaceCreateGitURL = value
			a.workspaceCreateGitCur = clampInt(cursor, 0, len([]rune(value)))
			a.maybeDeriveGitWorkspaceFields(oldName, oldRoot)
			return
		}
	}
	value, cursor := edit(a.workspaceCreateRoot, a.workspaceCreateRootCur)
	a.workspaceCreateRoot = value
	a.workspaceCreateRootCur = clampInt(cursor, 0, len([]rune(value)))
}

func (a *App) moveWorkspaceCreateCursor(delta int) {
	switch a.workspaceCreateField {
	case 0:
		a.workspaceCreateNameCur = clampInt(a.workspaceCreateNameCur+delta, 0, len([]rune(a.workspaceCreateName)))
		return
	case 1:
		if a.workspaceCreateMode == "git" {
			a.workspaceCreateGitCur = clampInt(a.workspaceCreateGitCur+delta, 0, len([]rune(a.workspaceCreateGitURL)))
			return
		}
	}
	a.workspaceCreateRootCur = clampInt(a.workspaceCreateRootCur+delta, 0, len([]rune(a.workspaceCreateRoot)))
}

func (a *App) setWorkspaceCreateCursor(cursor int) {
	switch a.workspaceCreateField {
	case 0:
		a.workspaceCreateNameCur = clampInt(cursor, 0, len([]rune(a.workspaceCreateName)))
		return
	case 1:
		if a.workspaceCreateMode == "git" {
			a.workspaceCreateGitCur = clampInt(cursor, 0, len([]rune(a.workspaceCreateGitURL)))
			return
		}
	}
	a.workspaceCreateRootCur = clampInt(cursor, 0, len([]rune(a.workspaceCreateRoot)))
}

func (a *App) workspaceCreateFieldCount() int {
	if a.workspaceCreateMode == "git" {
		return 3
	}
	return 2
}

func (a *App) commitWorkspaceCreate() (tea.Model, tea.Cmd) {
	if a.workspaceCreateSaving {
		return a, nil
	}
	root := strings.TrimSpace(a.workspaceCreateRoot)
	gitURL := strings.TrimSpace(a.workspaceCreateGitURL)
	if a.workspaceCreateMode == "git" && gitURL == "" {
		a.workspaceCreateError = "git repository URL is required"
		a.workspaceCreateField = 1
		return a, nil
	}
	if root == "" {
		a.workspaceCreateError = "root path is required"
		if a.workspaceCreateMode == "git" {
			a.workspaceCreateField = 2
		} else {
			a.workspaceCreateField = 1
		}
		return a, nil
	}
	a.workspaceCreateSaving = true
	a.workspaceCreateError = ""
	if a.workspaceCreateMode == "git" {
		return a, cloneAndCreateWorkspaceCmd(a.c, strings.TrimSpace(a.workspaceCreateName), root, gitURL)
	}
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

func (a *App) handleWorkspaceDeleteKey() (tea.Model, tea.Cmd) {
	if a.workspaceDeleteSaving {
		return a, nil
	}
	if a.workspaceSwitchSel < 0 || a.workspaceSwitchSel >= len(a.workspaces) {
		return a, nil
	}
	ws := a.workspaces[a.workspaceSwitchSel]
	if ws.ID == "" {
		return a, nil
	}
	if ws.ID == a.wsID {
		a.workspaceDeleteError = "switch to another workspace before removing this one"
		a.workspaceDeleteID = ws.ID
		return a, nil
	}
	if a.workspaceDeleteID == ws.ID {
		return a.confirmWorkspaceDelete()
	}
	a.workspaceDeleteID = ws.ID
	a.workspaceDeleteError = ""
	return a, nil
}

func (a *App) confirmWorkspaceDelete() (tea.Model, tea.Cmd) {
	if a.workspaceDeleteSaving || a.workspaceDeleteID == "" {
		return a, nil
	}
	workspaceID := a.workspaceDeleteID
	if workspaceID == a.wsID {
		a.workspaceDeleteError = "switch to another workspace before removing this one"
		return a, nil
	}
	a.workspaceDeleteSaving = true
	a.workspaceDeleteError = ""
	return a, deleteWorkspaceCmd(a.c, workspaceID)
}

func deleteWorkspaceCmd(c *client.Client, workspaceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return workspaceDeletedMsg{workspaceID: workspaceID, err: c.DeleteWorkspace(ctx, workspaceID)}
	}
}

func cloneAndCreateWorkspaceCmd(c *client.Client, name, rootPath, gitURL string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "git", "clone", gitURL, rootPath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return workspaceCreatedMsg{err: workspaceCloneError{message: gitCloneFailureMessage(err, string(out))}}
		}
		ws, err := c.CreateWorkspace(ctx, client.CreateWorkspaceRequest{
			Name:     name,
			RootPath: rootPath,
			Metadata: map[string]any{
				"source":  "git",
				"git_url": gitURL,
			},
		})
		return workspaceCreatedMsg{workspace: ws, err: err}
	}
}

func gitCloneFailureMessage(err error, output string) string {
	lines := strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n")
	interesting := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(strings.ToLower(line), "cloning into ") {
			continue
		}
		interesting = append(interesting, line)
	}
	msg := strings.Join(interesting, " ")
	if msg == "" && err != nil {
		msg = err.Error()
	}
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return "git exited without diagnostic output"
	}
	return msg
}

func (a *App) maybeDeriveGitWorkspaceRoot() {
	a.maybeDeriveGitWorkspaceFields("", "")
}

func (a *App) maybeDeriveGitWorkspaceFields(previousName, previousRoot string) {
	if a.workspaceCreateMode != "git" {
		return
	}
	repo := gitRepoFolderName(a.workspaceCreateGitURL)
	if repo == "" {
		return
	}
	base := a.defaultWorkspaceGitCloneBase()
	if base == "" {
		base = "."
	}
	root := filepath.Join(base, repo)
	currentRoot := strings.TrimSpace(a.workspaceCreateRoot)
	defaultRoot := strings.TrimSpace(a.defaultWorkspaceCreateRoot())
	previousRoot = strings.TrimSpace(previousRoot)
	if currentRoot == "" || currentRoot == defaultRoot || (previousRoot != "" && currentRoot == previousRoot) {
		a.workspaceCreateRoot = root
		a.workspaceCreateRootCur = len([]rune(root))
	}
	currentName := strings.TrimSpace(a.workspaceCreateName)
	previousName = strings.TrimSpace(previousName)
	if currentName == "" || (previousName != "" && currentName == previousName) {
		a.workspaceCreateName = repo
		a.workspaceCreateNameCur = len([]rune(repo))
	}
}

func (a *App) currentDerivedGitWorkspaceFields() (string, string) {
	repo := gitRepoFolderName(a.workspaceCreateGitURL)
	if repo == "" {
		return "", ""
	}
	base := a.defaultWorkspaceGitCloneBase()
	if base == "" {
		base = "."
	}
	return repo, filepath.Join(base, repo)
}

func (a *App) defaultWorkspaceGitCloneBase() string {
	if root := strings.TrimSpace(a.currentWorkspaceRootPath()); root != "" {
		if parent := filepath.Dir(root); parent != "." && parent != root {
			return parent
		}
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		return wd
	}
	return ""
}

func gitRepoFolderName(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	rawURL = strings.TrimSuffix(rawURL, "/")
	rawURL = strings.TrimSuffix(rawURL, ".git")
	if rawURL == "" {
		return ""
	}
	parts := strings.FieldsFunc(rawURL, func(r rune) bool {
		return r == '/' || r == ':'
	})
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[len(parts)-1])
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
			id:    "workspace-switch:new-folder",
			label: "open folder",
			action: func(app *App) tea.Cmd {
				app.openWorkspaceCreateMode("folder")
				return nil
			},
		},
		{
			id:    "workspace-switch:new-git",
			label: "clone git",
			action: func(app *App) tea.Cmd {
				app.openWorkspaceCreateMode("git")
				return nil
			},
		},
		{
			id:       "workspace-switch:remove",
			label:    "remove",
			disabled: len(a.workspaces) == 0 || a.workspaceDeleteSaving,
			action: func(app *App) tea.Cmd {
				_, cmd := app.handleWorkspaceDeleteKey()
				return cmd
			},
		},
		closeMenuButton("workspace-switch:close", func(app *App) { app.closeWorkspaceSwitchModal() }),
	}
	rows := []string{}
	current := strings.TrimSpace(a.currentWorkspaceRootPath())
	rows = append(rows, t.HintLabel.Render("Workspace manager"))
	if current != "" {
		rows = append(rows, "Current workspace: "+current)
	}
	rows = append(rows, t.HintLabel.Render("Add workspace"))
	rows = append(rows, "  open folder: register an existing local folder")
	rows = append(rows, "  clone Git: clone a repository into a local folder, then switch into it")
	rows = append(rows, t.HintLabel.Render("Existing workspaces"))
	rows = append(rows, t.HintLabel.Render("Remove unregisters inactive entries only. Local files stay on disk; switch away before removing the current workspace."))
	if len(a.workspaces) == 0 {
		rows = append(rows, t.HintLabel.Render("(no workspaces yet - open a folder or clone a Git repo)"))
	}
	if a.workspaceDeleteID != "" {
		label := a.workspaceDeleteID
		for _, ws := range a.workspaces {
			if ws.ID == a.workspaceDeleteID {
				label = workspaceLabelPlain(ws)
				break
			}
		}
		msg := "remove " + label + "? press d again or y to confirm, u to undo"
		if a.workspaceDeleteError != "" {
			msg = a.workspaceDeleteError
		}
		if a.workspaceDeleteSaving {
			msg = "removing " + label + "..."
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(msg))
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
		title := workspaceLabelPlain(ws)
		source := workspaceSourcePlain(ws)
		if source != "" {
			title = source + "  " + title
		}
		description := workspaceRootPlain(ws)
		if ws.ID == a.wsID {
			description = strings.TrimSpace(description + " · current workspace")
		}
		idx := i
		items = append(items, modalListItem{
			id:          "workspace-switch:item:" + ws.ID,
			title:       title,
			description: description,
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
			footer:  t.HintLabel.Render(modalKeyHint("↑/↓ select", "Enter switch", "n open folder", "g clone git", "d remove", "Esc cancel")),
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
	saveLabel := "open"
	saveVerb := "open"
	titleAction := "Open"
	if a.workspaceCreateMode == "git" {
		saveLabel = "clone/open"
		saveVerb = "clone/open"
		titleAction = "Clone"
	}
	buttons := []menuButton{
		{
			id:       "workspace-create:save",
			label:    saveLabel,
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

	activeLabel := "Workspace name"
	editorValue := a.workspaceCreateName
	editorCursor := a.workspaceCreateNameCur
	editorID := "workspace-create-name"
	switch a.workspaceCreateField {
	case 1:
		if a.workspaceCreateMode == "git" {
			activeLabel = "Repository URL"
			editorValue = a.workspaceCreateGitURL
			editorCursor = a.workspaceCreateGitCur
			editorID = "workspace-create-git"
		} else {
			activeLabel = "Folder path"
			editorValue = a.workspaceCreateRoot
			editorCursor = a.workspaceCreateRootCur
			editorID = "workspace-create-root"
		}
	case 2:
		activeLabel = "Local clone folder"
		editorValue = a.workspaceCreateRoot
		editorCursor = a.workspaceCreateRootCur
		editorID = "workspace-create-root"
	}

	nameMarker := "  "
	gitMarker := "  "
	rootMarker := "  "
	switch a.workspaceCreateField {
	case 0:
		nameMarker = "▌ "
	case 1:
		if a.workspaceCreateMode == "git" {
			gitMarker = "▌ "
		} else {
			rootMarker = "▌ "
		}
	default:
		rootMarker = "▌ "
	}
	status := []string{}
	statusHits := []modalCellHit{}
	addStatus := func(field int, id string, line string) {
		row := len(status)
		status = append(status, line)
		statusHits = append(statusHits, modalCellHit{
			id:     id,
			row:    row,
			col:    0,
			width:  modalInnerWidth(w),
			height: 1,
			action: func(app *App) tea.Cmd {
				app.workspaceCreateField = field
				return nil
			},
		})
	}
	if a.workspaceCreateField != 0 {
		addStatus(0, "workspace-create:field:name", nameMarker+"Workspace name: "+emptyPlaceholder(a.workspaceCreateName, "(optional; derived from folder when blank)"))
	}
	if a.workspaceCreateMode == "git" {
		if a.workspaceCreateField != 1 {
			addStatus(1, "workspace-create:field:git", gitMarker+"Repository URL: "+emptyPlaceholder(a.workspaceCreateGitURL, "(required, e.g. git@github.com:org/repo.git)"))
		}
		if a.workspaceCreateField != 2 {
			addStatus(2, "workspace-create:field:root", rootMarker+"Local clone folder: "+emptyPlaceholder(a.workspaceCreateRoot, "(required local target folder)"))
		}
	} else {
		if a.workspaceCreateField != 1 {
			addStatus(1, "workspace-create:field:root", rootMarker+"Folder path: "+emptyPlaceholder(a.workspaceCreateRoot, "(required local folder path)"))
		}
	}
	if a.workspaceCreateError != "" {
		status = append(status, lipgloss.NewStyle().Foreground(t.Danger).Render("error: "+a.workspaceCreateError))
	}
	if a.workspaceCreateSaving {
		status = append(status, t.HintLabel.Render(saveVerb+" workspace..."))
	}
	titleMode := "Folder"
	intro := []string{
		"Open an existing local folder as a "+brandName()+" workspace.",
		"Use an absolute folder root when possible; "+brandName()+" stores this path on the workspace record.",
	}
	if a.workspaceCreateMode == "git" {
		titleMode = "Git"
		intro = []string{
			"Clone a Git repository into the target folder, then open it as a workspace.",
			"The local clone folder is auto-filled from the repository name and can be edited before create.",
		}
	}

	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       titleAction + " workspace from " + titleMode + " · " + activeLabel,
		buttons:     buttons,
		surfaceID:   "workspace-create",
		intro:       intro,
		editor:      activeLabel + ": " + a.renderCursorEditor(editorValue, editorCursor),
		editorID:    editorID,
		editorValue: editorValue,
		cursorAction: func(app *App, cursor int) {
			switch app.workspaceCreateField {
			case 0:
				app.workspaceCreateNameCur = cursor
			case 1:
				if app.workspaceCreateMode == "git" {
					app.workspaceCreateGitCur = cursor
				} else {
					app.workspaceCreateRootCur = cursor
				}
			default:
				app.workspaceCreateRootCur = cursor
			}
		},
		status:     status,
		statusHits: statusHits,
		footer:     t.HintLabel.Render(modalKeyHint("Tab field", "Enter "+saveVerb, "Esc back", "Ctrl+C close")),
	})
	return rendered.modal
}

// workspaceLabel renders the operator-facing workspace name. Backend IDs are
// intentionally kept out of primary list labels unless no name is available.
func workspaceLabel(ws gact.Workspace) string {
	if label := strings.TrimSpace(ws.Name); label != "" {
		return label
	}
	return strings.TrimSpace(ws.ID)
}

// workspaceLabelPlain returns the unstyled operator label so the modal can
// truncate without slicing through ANSI escape sequences.
func workspaceLabelPlain(ws gact.Workspace) string {
	if label := strings.TrimSpace(ws.Name); label != "" {
		return label
	}
	return strings.TrimSpace(ws.ID)
}

func workspaceHeaderLabelPlain(ws gact.Workspace) string {
	label := strings.TrimSpace(ws.Name)
	if label == "" {
		label = strings.TrimSpace(ws.ID)
	}
	if label == "" {
		return ""
	}
	root := workspaceHeaderRootPlain(ws.RootPath)
	if root == "" {
		return label
	}
	return label + " @ " + root
}

func workspaceHeaderRootPlain(root string) string {
	root = strings.TrimSpace(strings.ReplaceAll(root, "\\", "/"))
	if root == "" {
		return ""
	}
	if strings.HasPrefix(root, "~") {
		return root
	}
	trimmed := strings.Trim(root, "/")
	parts := strings.Split(trimmed, "/")
	if trimmed == "" || len(parts) <= 3 {
		return root
	}
	prefix := ""
	if strings.HasPrefix(root, "/") {
		prefix = "/"
	}
	return prefix + ".../" + strings.Join(parts[len(parts)-2:], "/")
}

func workspaceRootPlain(ws gact.Workspace) string {
	root := strings.TrimSpace(ws.RootPath)
	if root == "" {
		return "root: (not provided)"
	}
	return "root: " + root
}

func workspaceSourcePlain(ws gact.Workspace) string {
	source, _ := ws.Metadata["source"].(string)
	source = strings.ToLower(strings.TrimSpace(source))
	switch source {
	case "git":
		return "Git"
	case "folder", "local":
		return "Folder"
	default:
		return ""
	}
}

func emptyPlaceholder(value, placeholder string) string {
	if strings.TrimSpace(value) == "" {
		return placeholder
	}
	return value
}

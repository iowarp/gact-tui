package ui

// workspace_switch_view.go renders the workspace switcher modal and workspace labels.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const workspaceSwitchMaxItems = 8

// view renders the modal. Matches the settings/metrics
// overlay style so the user's muscle memory carries over.
func (m *workspaceModal) view() string {
	if m.create.open {
		return m.viewCreate()
	}
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	buttons := []menuButton{
		{
			id:    "workspace-switch:new-folder",
			label: "open folder",
			action: func(app *App) tea.Cmd {
				app.workspace.openCreateMode("folder")
				return nil
			},
		},
		{
			id:    "workspace-switch:new-git",
			label: "clone git",
			action: func(app *App) tea.Cmd {
				app.workspace.openCreateMode("git")
				return nil
			},
		},
		{
			id:       "workspace-switch:remove",
			label:    "remove",
			disabled: len(a.session.workspaces) == 0 || m.deleteSaving,
			action: func(app *App) tea.Cmd {
				_, cmd := app.workspace.handleDeleteKey()
				return cmd
			},
		},
		closeMenuButton("workspace-switch:close", func(app *App) { app.workspace.close() }),
	}
	rows := []string{}
	current := strings.TrimSpace(a.fileViewer.workspaceRootPath())
	rows = append(rows, t.HintLabel.Render("Workspace manager"))
	if current != "" {
		rows = append(rows, "Current workspace: "+current)
	}
	rows = append(rows, t.HintLabel.Render("Add workspace"))
	rows = append(rows, "  open folder: register an existing local folder")
	rows = append(rows, "  clone Git: clone a repository into a local folder, then switch into it")
	rows = append(rows, t.HintLabel.Render("Existing workspaces"))
	rows = append(rows, t.HintLabel.Render("Remove unregisters inactive entries only. Local files stay on disk; switch away before removing the current workspace."))
	if len(a.session.workspaces) == 0 {
		rows = append(rows, t.HintLabel.Render("(no workspaces yet - open a folder or clone a Git repo)"))
	}
	if m.deleteID != "" {
		label := m.deleteID
		for _, ws := range a.session.workspaces {
			if ws.ID == m.deleteID {
				label = workspaceLabelPlain(ws)
				break
			}
		}
		msg := "remove " + label + "? press d again or y to confirm, u to undo"
		if m.deleteError != "" {
			msg = m.deleteError
		}
		if m.deleteSaving {
			msg = "removing " + label + "..."
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(msg))
	}
	listW := modalInsetListWidth(w)
	itemBudget := a.modals.modalListItemBudget(4, 2, workspaceSwitchMaxItems)
	rowBudget := itemBudget * 2
	win := selectedItemWindow(len(a.session.workspaces), m.switchSel, itemBudget)
	listStartRow := len(rows)
	items := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		ws := a.session.workspaces[i]
		status := ""
		if ws.ID == a.session.wsID {
			status = "current"
		}
		title := workspaceLabelPlain(ws)
		source := workspaceSourcePlain(ws)
		if source != "" {
			title = source + "  " + title
		}
		description := workspaceRootPlain(ws)
		if ws.ID == a.session.wsID {
			description = strings.TrimSpace(description + " · current workspace")
		}
		idx := i
		items = append(items, modalListItem{
			id:          "workspace-switch:item:" + ws.ID,
			title:       title,
			description: description,
			status:      status,
			selected:    i == m.switchSel,
			action: func(app *App) tea.Cmd {
				app.workspace.switchSel = idx
				_, cmd := app.workspace.handleKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	list := a.modals.renderModalList(items, modalListOptions{width: listW, rowBudget: rowBudget, descriptionLines: 1})
	rows = append(rows, list.rows...)

	rendered := a.modals.renderSelectableListModal(selectableListModalOptions{
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
			if len(app.session.workspaces) == 0 {
				return nil
			}
			app.workspace.switchSel = moveSelectionByWheel(app.workspace.switchSel, len(app.session.workspaces), button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.workspace.switchSel = clampSelection(index, len(app.session.workspaces))
			return nil
		},
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

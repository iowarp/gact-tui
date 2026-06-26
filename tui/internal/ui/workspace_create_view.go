package ui

// workspace_create_view.go renders the workspace create modal view.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (m *workspaceModal) viewCreate() string {
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	saveLabel := "open"
	saveVerb := "open"
	titleAction := "Open"
	if m.create.mode == "git" {
		saveLabel = "clone/open"
		saveVerb = "clone/open"
		titleAction = "Clone"
	}
	buttons := []menuButton{
		{
			id:       "workspace-create:save",
			label:    saveLabel,
			disabled: m.create.saving,
			action: func(app *App) tea.Cmd {
				_, cmd := app.workspace.commitCreate()
				return cmd
			},
		},
		{
			id:    "workspace-create:back",
			label: "back",
			action: func(app *App) tea.Cmd {
				app.workspace.closeCreate()
				return nil
			},
		},
		closeMenuButton("workspace-create:close", func(app *App) { app.workspace.close() }),
	}

	activeLabel, editorValue, editorCursor, editorID := m.createEditorState()
	nameMarker, gitMarker, rootMarker := m.createFieldMarkers()
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
				app.workspace.create.field = field
				return nil
			},
		})
	}
	if m.create.field != 0 {
		addStatus(0, "workspace-create:field:name", nameMarker+"Workspace name: "+emptyPlaceholder(m.create.name, "(optional; derived from folder when blank)"))
	}
	if m.create.mode == "git" {
		if m.create.field != 1 {
			addStatus(1, "workspace-create:field:git", gitMarker+"Repository URL: "+emptyPlaceholder(m.create.gitURL, "(required, e.g. git@github.com:org/repo.git)"))
		}
		if m.create.field != 2 {
			addStatus(2, "workspace-create:field:root", rootMarker+"Local clone folder: "+emptyPlaceholder(m.create.root, "(required local target folder)"))
		}
	} else if m.create.field != 1 {
		addStatus(1, "workspace-create:field:root", rootMarker+"Folder path: "+emptyPlaceholder(m.create.root, "(required local folder path)"))
	}
	if m.create.error != "" {
		status = append(status, lipgloss.NewStyle().Foreground(t.Danger).Render("error: "+m.create.error))
	}
	if m.create.saving {
		status = append(status, t.HintLabel.Render(saveVerb+" workspace..."))
	}
	titleMode, intro := m.createIntro()

	rendered := a.modals.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       titleAction + " workspace from " + titleMode + " · " + activeLabel,
		buttons:     buttons,
		surfaceID:   "workspace-create",
		intro:       intro,
		editor:      activeLabel + ": " + a.modals.renderCursorEditor(editorValue, editorCursor),
		editorID:    editorID,
		editorValue: editorValue,
		cursorAction: func(app *App, cursor int) {
			app.workspace.setCreateCursor(cursor)
		},
		status:     status,
		statusHits: statusHits,
		footer:     t.HintLabel.Render(modalKeyHint("Tab field", "Enter "+saveVerb, "Esc back", "Ctrl+C close")),
	})
	return rendered.modal
}

func (m *workspaceModal) createEditorState() (label string, value string, cursor int, id string) {
	label = "Workspace name"
	value = m.create.name
	cursor = m.create.nameCur
	id = "workspace-create-name"
	switch m.create.field {
	case 1:
		if m.create.mode == "git" {
			return "Repository URL", m.create.gitURL, m.create.gitCur, "workspace-create-git"
		}
		return "Folder path", m.create.root, m.create.rootCur, "workspace-create-root"
	case 2:
		return "Local clone folder", m.create.root, m.create.rootCur, "workspace-create-root"
	default:
		return label, value, cursor, id
	}
}

func (m *workspaceModal) createFieldMarkers() (name string, git string, root string) {
	name = "  "
	git = "  "
	root = "  "
	switch m.create.field {
	case 0:
		name = "▌ "
	case 1:
		if m.create.mode == "git" {
			git = "▌ "
		} else {
			root = "▌ "
		}
	default:
		root = "▌ "
	}
	return name, git, root
}

func (m *workspaceModal) createIntro() (titleMode string, intro []string) {
	if m.create.mode == "git" {
		return "Git", []string{
			"Clone a Git repository into the target folder, then open it as a workspace.",
			"The local clone folder is auto-filled from the repository name and can be edited before create.",
		}
	}
	return "Folder", []string{
		"Open an existing local folder as a " + brandName() + " workspace.",
		"Use an absolute folder root when possible; " + brandName() + " stores this path on the workspace record.",
	}
}

func emptyPlaceholder(value, placeholder string) string {
	if strings.TrimSpace(value) == "" {
		return placeholder
	}
	return value
}

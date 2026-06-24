package ui

// workspace_create.go drives the workspace create modal state, key handling, and field editing.

import (
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (m *workspaceCreateState) reset() { *m = workspaceCreateState{} }

func (w *workspaceModal) closeCreate() { w.create.reset() }

func (w *workspaceModal) openCreate() {
	w.openCreateMode("folder")
}

func (w *workspaceModal) openCreateMode(mode string) {
	if mode != "git" {
		mode = "folder"
	}
	w.switchOpen = true
	w.create.open = true
	w.create.mode = mode
	w.create.saving = false
	w.create.error = ""
	w.create.field = 0
	if mode == "git" && w.create.gitURL == "" {
		w.create.field = 1
	}
	if w.create.root == "" {
		w.create.root = w.defaultCreateRoot()
		w.create.rootCur = len([]rune(w.create.root))
	}
	if mode == "git" && strings.TrimSpace(w.create.gitURL) == "" && strings.TrimSpace(w.create.root) == strings.TrimSpace(w.defaultCreateRoot()) {
		w.create.root = ""
		w.create.rootCur = 0
	}
	if w.create.nameCur > len([]rune(w.create.name)) {
		w.create.nameCur = len([]rune(w.create.name))
	}
	if w.create.gitCur > len([]rune(w.create.gitURL)) {
		w.create.gitCur = len([]rune(w.create.gitURL))
	}
}

func (w *workspaceModal) defaultCreateRoot() string {
	if root := strings.TrimSpace(w.app.fileViewer.workspaceRootPath()); root != "" {
		return root
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		return wd
	}
	return ""
}

func (w *workspaceModal) handleCreateKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc":
		w.closeCreate()
		return w.app, nil
	case "ctrl+c":
		w.close()
		return w.app, nil
	case "tab":
		w.create.field = (w.create.field + 1) % w.createFieldCount()
		return w.app, nil
	case "shift+tab":
		w.create.field = (w.create.field - 1 + w.createFieldCount()) % w.createFieldCount()
		return w.app, nil
	case "enter":
		return w.commitCreate()
	case "backspace":
		w.editCreateField(func(value string, cursor int) (string, int) {
			if cursor == 0 {
				return value, cursor
			}
			runes := []rune(value)
			runes = append(runes[:cursor-1], runes[cursor:]...)
			return string(runes), cursor - 1
		})
		return w.app, nil
	case "delete":
		w.editCreateField(func(value string, cursor int) (string, int) {
			runes := []rune(value)
			if cursor >= len(runes) {
				return value, cursor
			}
			runes = append(runes[:cursor], runes[cursor+1:]...)
			return string(runes), cursor
		})
		return w.app, nil
	case "left":
		w.moveCreateCursor(-1)
		return w.app, nil
	case "right":
		w.moveCreateCursor(1)
		return w.app, nil
	case "home", "ctrl+a":
		w.setCreateCursor(0)
		return w.app, nil
	case "end", "ctrl+e":
		switch w.create.field {
		case 0:
			w.create.nameCur = len([]rune(w.create.name))
		case 1:
			if w.create.mode == "git" {
				w.create.gitCur = len([]rune(w.create.gitURL))
			} else {
				w.create.rootCur = len([]rune(w.create.root))
			}
		default:
			w.create.rootCur = len([]rune(w.create.root))
		}
		return w.app, nil
	}
	if k.Text != "" {
		w.insertCreateText(k.Text)
	}
	return w.app, nil
}

func (w *workspaceModal) insertCreateText(text string) {
	w.editCreateField(func(value string, cursor int) (string, int) {
		return insertTextAtCursor(value, cursor, text)
	})
}

func (w *workspaceModal) editCreateField(edit func(value string, cursor int) (string, int)) {
	switch w.create.field {
	case 0:
		value, cursor := edit(w.create.name, w.create.nameCur)
		w.create.name = value
		w.create.nameCur = clampInt(cursor, 0, len([]rune(value)))
		return
	case 1:
		if w.create.mode == "git" {
			oldName, oldRoot := w.currentDerivedGitFields()
			value, cursor := edit(w.create.gitURL, w.create.gitCur)
			w.create.gitURL = value
			w.create.gitCur = clampInt(cursor, 0, len([]rune(value)))
			w.maybeDeriveGitFields(oldName, oldRoot)
			return
		}
	}
	value, cursor := edit(w.create.root, w.create.rootCur)
	w.create.root = value
	w.create.rootCur = clampInt(cursor, 0, len([]rune(value)))
}

func (w *workspaceModal) moveCreateCursor(delta int) {
	switch w.create.field {
	case 0:
		w.create.nameCur = clampInt(w.create.nameCur+delta, 0, len([]rune(w.create.name)))
		return
	case 1:
		if w.create.mode == "git" {
			w.create.gitCur = clampInt(w.create.gitCur+delta, 0, len([]rune(w.create.gitURL)))
			return
		}
	}
	w.create.rootCur = clampInt(w.create.rootCur+delta, 0, len([]rune(w.create.root)))
}

func (w *workspaceModal) setCreateCursor(cursor int) {
	switch w.create.field {
	case 0:
		w.create.nameCur = clampInt(cursor, 0, len([]rune(w.create.name)))
		return
	case 1:
		if w.create.mode == "git" {
			w.create.gitCur = clampInt(cursor, 0, len([]rune(w.create.gitURL)))
			return
		}
	}
	w.create.rootCur = clampInt(cursor, 0, len([]rune(w.create.root)))
}

func (w *workspaceModal) createFieldCount() int {
	if w.create.mode == "git" {
		return 3
	}
	return 2
}

func (w *workspaceModal) commitCreate() (tea.Model, tea.Cmd) {
	if w.create.saving {
		return w.app, nil
	}
	root := strings.TrimSpace(w.create.root)
	gitURL := strings.TrimSpace(w.create.gitURL)
	if w.create.mode == "git" && gitURL == "" {
		w.create.error = "git repository URL is required"
		w.create.field = 1
		return w.app, nil
	}
	if root == "" {
		w.create.error = "root path is required"
		if w.create.mode == "git" {
			w.create.field = 2
		} else {
			w.create.field = 1
		}
		return w.app, nil
	}
	w.create.saving = true
	w.create.error = ""
	if w.create.mode == "git" {
		return w.app, cloneAndCreateWorkspaceCmd(w.app.c, strings.TrimSpace(w.create.name), root, gitURL)
	}
	return w.app, createWorkspaceCmd(w.app.c, strings.TrimSpace(w.create.name), root)
}

package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (a *App) closeRenameModal() {
	a.renameOpen = false
	a.renameDraft = ""
	a.renameCursor = 0
}

// handleRenameKey drives the rename-session overlay. Minimal line
// editor — backspace/delete, home/end, arrow keys, printable chars,
// Enter to commit, Esc to cancel. Deliberately narrower than a full
// textarea: single line, no multi-line paste, no rich bindings.
func (a *App) handleRenameKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeRenameModal()
		return a, nil
	case "enter":
		return a.commitRename()
	case "backspace":
		if a.renameCursor == 0 {
			return a, nil
		}
		runes := []rune(a.renameDraft)
		runes = append(runes[:a.renameCursor-1], runes[a.renameCursor:]...)
		a.renameDraft = string(runes)
		a.renameCursor--
		return a, nil
	case "delete":
		runes := []rune(a.renameDraft)
		if a.renameCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.renameCursor], runes[a.renameCursor+1:]...)
		a.renameDraft = string(runes)
		return a, nil
	case "left":
		if a.renameCursor > 0 {
			a.renameCursor--
		}
		return a, nil
	case "right":
		if a.renameCursor < len([]rune(a.renameDraft)) {
			a.renameCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.renameCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.renameCursor = len([]rune(a.renameDraft))
		return a, nil
	}
	// Printable chars (including space). We forward anything with a
	// non-empty Text field — lipgloss/bubbles events already filter
	// out control bytes for us.
	if k.Text != "" {
		runes := []rune(a.renameDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.renameCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.renameCursor:]...)
		a.renameDraft = string(out)
		a.renameCursor += len(insert)
	}
	return a, nil
}

// commitRename dispatches the PATCH /v1/sessions/{id} and closes the
// overlay. Empty input (after trimming) is treated as "cancel" — we
// don't want to clobber a session title with "" by accident.
func (a *App) commitRename() (tea.Model, tea.Cmd) {
	title := strings.TrimSpace(a.renameDraft)
	a.closeRenameModal()
	if title == "" {
		a.transientHint = "rename cancelled (empty title)"
		return a, nil
	}
	sid := a.currentSessionID()
	if sid == "" {
		return a, nil
	}
	// Optimistically update the sidebar so the user sees the change
	// immediately; patchSessionTitleCmd will overwrite with the
	// server's authoritative value (or silently fail, leaving our
	// optimistic value). This mirrors J6's msg-based update path —
	// both terminate with sessionTitleRenamedMsg.
	for i := range a.sessions {
		if a.sessions[i].ID == sid {
			a.sessions[i].Title = title
			break
		}
	}
	return a, patchSessionTitleCmd(a.c, sid, title)
}

// viewRename renders the inline rename prompt. Matches the workspace-
// switcher / settings overlay shape.
func (a *App) viewRename() string {
	w := a.modalWidth()
	buttons := []menuButton{
		{
			id:    "rename:save",
			label: "save",
			action: func(app *App) tea.Cmd {
				_, cmd := app.commitRename()
				return cmd
			},
		},
		{
			id:    "rename:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.closeRenameModal()
				return nil
			},
		},
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       "Rename session",
		buttons:     buttons,
		editor:      a.renderCursorEditor(a.renameDraft, a.renameCursor),
		editorID:    "rename",
		editorValue: a.renameDraft,
		cursorAction: func(app *App, cursor int) {
			app.renameCursor = cursor
		},
		footer: a.Theme.HintLabel.Render("Enter save  Esc cancel  Left/Right move  Home/End jump"),
	})
	return rendered.modal
}

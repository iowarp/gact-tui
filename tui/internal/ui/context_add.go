package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

var contextAddModes = []string{"read", "edit", "pin"}

func (a *App) closeContextAddModal() {
	a.contextAddOpen = false
	a.contextAddDraft = ""
	a.contextAddCursor = 0
	a.contextAddMode = ""
}

func (a *App) contextAddModeValue() string {
	mode := strings.TrimSpace(a.contextAddMode)
	for _, candidate := range contextAddModes {
		if mode == candidate {
			return mode
		}
	}
	return "read"
}

func (a *App) setContextAddMode(mode string) {
	for _, candidate := range contextAddModes {
		if mode == candidate {
			a.contextAddMode = mode
			return
		}
	}
	a.contextAddMode = "read"
}

func (a *App) cycleContextAddMode(delta int) {
	active := a.contextAddModeValue()
	idx := 0
	for i, candidate := range contextAddModes {
		if candidate == active {
			idx = i
			break
		}
	}
	next := (idx + delta) % len(contextAddModes)
	if next < 0 {
		next += len(contextAddModes)
	}
	a.contextAddMode = contextAddModes[next]
}

// handleContextAddKey drives the inline "add to context" prompt —
// a narrower sibling of handleRenameKey. Same editor primitives
// (rune-indexed cursor, arrow/home/end/backspace/delete) so muscle
// memory carries over. Enter POSTs; Esc cancels.
func (a *App) handleContextAddKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeContextAddModal()
		return a, nil
	case "enter":
		return a.commitContextAdd()
	case "tab":
		a.cycleContextAddMode(1)
		return a, nil
	case "shift+tab":
		a.cycleContextAddMode(-1)
		return a, nil
	case "backspace":
		if a.contextAddCursor == 0 {
			return a, nil
		}
		runes := []rune(a.contextAddDraft)
		runes = append(runes[:a.contextAddCursor-1], runes[a.contextAddCursor:]...)
		a.contextAddDraft = string(runes)
		a.contextAddCursor--
		return a, nil
	case "delete":
		runes := []rune(a.contextAddDraft)
		if a.contextAddCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.contextAddCursor], runes[a.contextAddCursor+1:]...)
		a.contextAddDraft = string(runes)
		return a, nil
	case "left":
		if a.contextAddCursor > 0 {
			a.contextAddCursor--
		}
		return a, nil
	case "right":
		if a.contextAddCursor < len([]rune(a.contextAddDraft)) {
			a.contextAddCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.contextAddCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.contextAddCursor = len([]rune(a.contextAddDraft))
		return a, nil
	}
	if k.Text != "" {
		runes := []rune(a.contextAddDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.contextAddCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.contextAddCursor:]...)
		a.contextAddDraft = string(out)
		a.contextAddCursor += len(insert)
	}
	return a, nil
}

// commitContextAdd closes the modal and dispatches the add Cmd.
// Whitespace-only input is treated as "cancel" — matching K2 rename's
// "don't commit an empty title" philosophy; an empty path on the wire
// would 400 the backend anyway.
func (a *App) commitContextAdd() (tea.Model, tea.Cmd) {
	path := strings.TrimSpace(a.contextAddDraft)
	mode := a.contextAddModeValue()
	a.closeContextAddModal()
	if path == "" {
		a.transientHint = "add cancelled (empty path)"
		return a, nil
	}
	sid := a.currentSessionID()
	if sid == "" {
		return a, nil
	}
	return a, addContextFileCmd(a.c, sid, path, mode)
}

// addContextFileCmd POSTs the file to /v1/sessions/{id}/context/files.
// Returns contextFileAddedMsg; on success the handler folds the new
// entry into a.contextFiles so the sidebar updates without a list
// refetch.
func addContextFileCmd(c *client.Client, sessionID, path, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cf, err := c.AddContextFile(ctx, sessionID, path, mode)
		return contextFileAddedMsg{sessionID: sessionID, file: cf, err: err}
	}
}

func removeContextFileCmd(c *client.Client, sessionID, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := c.RemoveContextFile(ctx, sessionID, path)
		return contextFileRemovedMsg{sessionID: sessionID, path: path, err: err}
	}
}

type contextFileAddedMsg struct {
	sessionID string
	file      gact.ContextFile
	err       error
}

type contextFileRemovedMsg struct {
	sessionID string
	path      string
	err       error
}

// viewContextAdd renders the prompt. Matches the rename/workspace
// modal chrome so muscle memory carries over.
func (a *App) viewContextAdd() string {
	w := a.modalWidth()
	modeRow, modeHits := a.renderContextAddModeRow()
	buttons := []menuButton{
		{
			id:    "context-add:save",
			label: "save",
			action: func(app *App) tea.Cmd {
				_, cmd := app.commitContextAdd()
				return cmd
			},
		},
		{
			id:    "context-add:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.closeContextAddModal()
				return nil
			},
		},
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       "Add file to context",
		buttons:     buttons,
		surfaceID:   "context-add",
		editor:      a.renderCursorEditor(a.contextAddDraft, a.contextAddCursor),
		editorID:    "context-add",
		editorValue: a.contextAddDraft,
		cursorAction: func(app *App, cursor int) {
			app.contextAddCursor = cursor
		},
		status:     []string{modeRow},
		statusHits: modeHits,
		footer:     a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Tab mode", "Esc cancel", "/drop remove")),
	})
	return rendered.modal
}

func (a *App) renderContextAddModeRow() (string, []modalCellHit) {
	active := a.contextAddModeValue()
	options := make([]modalInlineOption, 0, len(contextAddModes))
	for _, mode := range contextAddModes {
		mode := mode
		options = append(options, modalInlineOption{
			id:     "context-add:mode:" + mode,
			label:  mode,
			active: mode == active,
			action: func(app *App) tea.Cmd {
				app.setContextAddMode(mode)
				return nil
			},
		})
	}
	return a.renderModalInlineOptions("mode: ", options)
}

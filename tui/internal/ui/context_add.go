package ui

// contextAddModal: the add-context-file path/mode prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

var contextAddModes = []string{"read", "edit", "pin"}

// contextAddModal is the add-context-file prompt's state: a single-line path
// draft plus the attach mode ("read"/"edit"/"pin"). It owns its behaviour and
// holds a back-reference to App for shared services.
type contextAddModal struct {
	app   *App
	open  bool
	input widget.TextInput
	mode  string
}

func (m *contextAddModal) reset() { *m = contextAddModal{app: m.app} }

func (m *contextAddModal) close() { m.reset() }

// openModal shows the add-context-file prompt with an empty path draft and the
// default "read" attach mode.
func (m *contextAddModal) openModal() {
	m.open = true
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.mode = "read"
}

func (m *contextAddModal) modeValue() string {
	mode := strings.TrimSpace(m.mode)
	for _, candidate := range contextAddModes {
		if mode == candidate {
			return mode
		}
	}
	return "read"
}

func (m *contextAddModal) setMode(mode string) {
	for _, candidate := range contextAddModes {
		if mode == candidate {
			m.mode = mode
			return
		}
	}
	m.mode = "read"
}

func (m *contextAddModal) cycleMode(delta int) {
	active := m.modeValue()
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
	m.mode = contextAddModes[next]
}

// handleKey drives the inline "add to context" prompt —
// a narrower sibling of rename's handleKey. Same editor primitives
// (rune-indexed cursor, arrow/home/end/backspace/delete) so muscle
// memory carries over. Enter POSTs; Esc cancels.
func (m *contextAddModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "enter":
		return m.commit()
	case "tab":
		m.cycleMode(1)
		return m.app, nil
	case "shift+tab":
		m.cycleMode(-1)
		return m.app, nil
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *contextAddModal) insert(text string) {
	m.input.Insert(text)
}

// commit closes the modal and dispatches the add Cmd.
// Whitespace-only input is treated as "cancel" — matching K2 rename's
// "don't commit an empty title" philosophy; an empty path on the wire
// would 400 the backend anyway.
func (m *contextAddModal) commit() (tea.Model, tea.Cmd) {
	path := strings.TrimSpace(m.input.Value())
	mode := m.modeValue()
	m.close()
	if path == "" {
		m.app.setHint("add cancelled (empty path)")
		return m.app, nil
	}
	sid := m.app.session.currentID()
	if sid == "" {
		return m.app, nil
	}
	return m.app, addContextFileCmd(m.app.c, sid, path, mode)
}

// view renders the prompt. Matches the rename/workspace
// modal chrome so muscle memory carries over.
func (m *contextAddModal) view() string {
	a := m.app
	w := a.modals.modalWidth()
	modeRow, modeHits := m.renderModeRow()
	buttons := saveCancelButtons("context-add:save", "context-add:cancel",
		func(app *App) tea.Cmd {
			_, cmd := app.contextAdd.commit()
			return cmd
		},
		func(app *App) tea.Cmd {
			app.contextAdd.close()
			return nil
		})
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:      w,
		title:      "Add file to context",
		buttons:    buttons,
		surfaceID:  "context-add",
		status:     []string{modeRow},
		statusHits: modeHits,
		footer:     a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Tab mode", "Esc cancel", "/drop remove")),
	}, "context-add", &m.input))
	return rendered.modal
}

func (m *contextAddModal) renderModeRow() (string, []modalCellHit) {
	active := m.modeValue()
	options := make([]modalInlineOption, 0, len(contextAddModes))
	for _, mode := range contextAddModes {
		mode := mode
		options = append(options, modalInlineOption{
			id:     "context-add:mode:" + mode,
			label:  mode,
			active: mode == active,
			action: func(app *App) tea.Cmd {
				app.contextAdd.setMode(mode)
				return nil
			},
		})
	}
	return m.app.modals.renderModalInlineOptions("mode: ", options)
}

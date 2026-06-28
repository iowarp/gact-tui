package ui

// renameModal: the session-rename prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

// renameModal is the inline session-title editor's state: a single-line input
// widget the overlay owns directly, rather than scattering draft/cursor
// primitives across the root model. It owns its behaviour too (handleKey/view/
// commit/insert) and holds a back-reference to App for shared services.
type renameModal struct {
	app   *App
	open  bool
	input widget.TextInput
}

func (m *renameModal) reset() { *m = renameModal{app: m.app} }

func (m *renameModal) close() { m.reset() }

// openModal shows the session-rename prompt seeded with the current title. The
// caret stays where SetValue lands it; callers that want it parked at the end
// of the line follow up with SetCursor.
func (m *renameModal) openModal(title string) {
	m.open = true
	m.input.SetValue(title)
}

// handleKey drives the rename-session overlay. Minimal line
// editor — backspace/delete, home/end, arrow keys, printable chars,
// Enter to commit, Esc to cancel. Deliberately narrower than a full
// textarea: single line, no multi-line paste, no rich bindings.
func (m *renameModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "enter":
		return m.commit()
	}
	// Cursor motion, deletion, and printable insertion are handled by the
	// shared single-line editor; paste flows through insert.
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *renameModal) insert(text string) {
	m.input.Insert(text)
}

// commit dispatches the PATCH /v1/sessions/{id} and closes the
// overlay. Empty input (after trimming) is treated as "cancel" — we
// don't want to clobber a session title with "" by accident.
func (m *renameModal) commit() (tea.Model, tea.Cmd) {
	title := strings.TrimSpace(m.input.Value())
	m.close()
	if title == "" {
		m.app.setHint("rename cancelled (empty title)")
		return m.app, nil
	}
	sid := m.app.session.currentID()
	if sid == "" {
		return m.app, nil
	}
	// Optimistically update the sidebar so the user sees the change
	// immediately; patchSessionTitleCmd will overwrite with the
	// server's authoritative value (or silently fail, leaving our
	// optimistic value). This mirrors J6's msg-based update path —
	// both terminate with sessionTitleRenamedMsg.
	previousTitle := ""
	for i := range m.app.session.sessions {
		if m.app.session.sessions[i].ID == sid {
			previousTitle = m.app.session.sessions[i].Title
			m.app.session.sessions[i].Title = title
			break
		}
	}
	return m.app, patchManualSessionTitleCmd(m.app.c, sid, title, previousTitle)
}

// view renders the inline rename prompt. Matches the workspace-
// switcher / settings overlay shape.
func (m *renameModal) view() string {
	a := m.app
	w := a.modals.modalWidth()
	buttons := saveCancelButtons("rename:save", "rename:cancel",
		func(app *App) tea.Cmd {
			_, cmd := app.rename.commit()
			return cmd
		},
		func(app *App) tea.Cmd {
			app.rename.close()
			return nil
		})
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     w,
		title:     "Rename session",
		buttons:   buttons,
		surfaceID: "rename",
		footer:    a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Esc cancel", "Left/Right move", "Home/End jump")),
	}, "rename", &m.input))
	return rendered.modal
}

package ui

// retryNotesModal: the retry-with-notes prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

func (m *retryNotesModal) openModal(messageID string) {
	m.open = true
	m.messageID = messageID
	m.input.SetValue("")
	m.input.SetCursor(0)
}

// retryNotesModal is the retry-with-notes prompt's state: the target message id
// plus a free-text notes draft. It owns its behaviour (open/close/key/insert/
// commit/view) and a back-reference to the root App for shared services.
type retryNotesModal struct {
	app       *App
	open      bool
	messageID string
	input     widget.TextInput
}

func (m *retryNotesModal) reset() { *m = retryNotesModal{app: m.app} }

func (m *retryNotesModal) close() { m.reset() }

func (m *retryNotesModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "enter":
		return m.commit()
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *retryNotesModal) insert(text string) {
	m.input.Insert(text)
}

func (m *retryNotesModal) commit() (tea.Model, tea.Cmd) {
	a := m.app
	sid := a.session.currentID()
	msgID := strings.TrimSpace(m.messageID)
	notes := strings.TrimSpace(m.input.Value())
	m.close()
	if sid == "" || msgID == "" {
		return a, nil
	}
	return a, retryTurnCmd(a.c, sid, msgID, gact.RetryTurnRequest{
		Notes:   notes,
		Execute: true,
		Metadata: map[string]any{
			"requested_from": "tui",
		},
	})
}

func (m *retryNotesModal) view() string {
	a := m.app
	w := a.modals.modalWidth()
	intro := []string{
		a.Theme.HintLabel.Render(textutil.Wrap("Create a linked retry attempt for the selected turn.", modalBodyContentWidth(w))),
		a.Theme.HintLabel.Render(textutil.Wrap("Changing model or provider can lose KV-cache reuse and increase time-to-first-token, latency, and cost.", modalBodyContentWidth(w))),
	}
	buttons := []menuButton{
		{id: "retry-notes:retry", label: "retry", action: func(app *App) tea.Cmd {
			_, cmd := app.retryNotes.commit()
			return cmd
		}},
		{id: "retry-notes:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.retryNotes.close()
			return nil
		}},
	}
	return a.modals.renderTextEntryModal(textEntryModalOptions{
		width:        w,
		title:        "Retry with notes",
		buttons:      buttons,
		surfaceID:    "retry-notes",
		intro:        intro,
		editor:       a.modals.renderCursorEditor(m.input.Value(), m.input.Cursor()),
		editorID:     "retry-notes",
		editorValue:  m.input.Value(),
		cursorAction: func(app *App, cursor int) { app.retryNotes.input.SetCursor(cursor) },
		footer:       a.Theme.HintLabel.Render(modalKeyHint("Enter retry", "Esc cancel")),
	}).modal
}

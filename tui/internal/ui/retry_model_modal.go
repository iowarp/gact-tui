package ui

// retryModelModal: the retry-with-different-model prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

func (m *retryModelModal) openModal(messageID string) {
	m.open = true
	m.msgID = messageID
	m.input.SetValue("")
	m.input.SetCursor(0)
}

// retryModelModal is the retry-with-different-model prompt's state: the target
// message id plus a model-name draft. It owns its behaviour (open/close/key/
// insert/commit/view) and a back-reference to the root App for shared services.
type retryModelModal struct {
	app   *App
	open  bool
	msgID string
	input widget.TextInput
}

func (m *retryModelModal) reset() { *m = retryModelModal{app: m.app} }

func (m *retryModelModal) close() { m.reset() }

func (m *retryModelModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
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

func (m *retryModelModal) insert(text string) {
	m.input.Insert(text)
}

func (m *retryModelModal) commit() (tea.Model, tea.Cmd) {
	a := m.app
	sid := a.session.currentID()
	msgID := strings.TrimSpace(m.msgID)
	ref, ok := parseRetryModelRef(m.input.Value())
	m.close()
	if sid == "" || msgID == "" {
		return a, nil
	}
	if !ok {
		a.setHint("retry model must be provider/model")
		return a, nil
	}
	return a, retryTurnCmd(a.c, sid, msgID, gact.RetryTurnRequest{
		Execute:    true,
		ProviderID: ref.ProviderID,
		ModelID:    ref.ModelID,
		Model:      &ref,
		Metadata: map[string]any{
			"requested_from": "tui",
			"retry_mode":     "model",
			"warning_ack":    true,
		},
	})
}

func (m *retryModelModal) view() string {
	a := m.app
	w := a.modals.modalWidth()
	intro := []string{
		a.Theme.HintLabel.Render(textutil.Wrap("Create a linked retry attempt with a provider/model override.", modalBodyContentWidth(w))),
		a.Theme.HintLabel.Render(textutil.Wrap("This can recompute provider-side KV cache, increase time-to-first-token, latency, and cost, and may produce different reasoning or tool choices.", modalBodyContentWidth(w))),
	}
	buttons := []menuButton{
		{id: "retry-model:retry", label: "retry", action: func(app *App) tea.Cmd {
			_, cmd := app.retryModel.commit()
			return cmd
		}},
		{id: "retry-model:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.retryModel.close()
			return nil
		}},
	}
	return a.modals.renderTextEntryModal(textEntryModalOptions{
		width:        w,
		title:        "Retry with model",
		buttons:      buttons,
		surfaceID:    "retry-model",
		intro:        intro,
		editor:       a.modals.renderCursorEditor(m.input.Value(), m.input.Cursor()),
		editorID:     "retry-model",
		editorValue:  m.input.Value(),
		cursorAction: func(app *App, cursor int) { app.retryModel.input.SetCursor(cursor) },
		footer:       a.Theme.HintLabel.Render(modalKeyHint("Enter retry", "provider/model", "Esc cancel")),
	}).modal
}

func parseRetryModelRef(raw string) (gact.ModelRef, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return gact.ModelRef{}, false
	}
	provider, model, ok := strings.Cut(raw, "/")
	if !ok {
		return gact.ModelRef{}, false
	}
	provider = strings.TrimSpace(provider)
	model = strings.TrimSpace(model)
	if provider == "" || model == "" {
		return gact.ModelRef{}, false
	}
	return gact.ModelRef{ProviderID: provider, ModelID: model}, true
}

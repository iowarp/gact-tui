package ui

// agent_edit_view.go renders the agent edit modal and resolves its per-field display values.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (m *agentEditModal) view() string {
	a := m.app
	t := a.Theme
	w := a.modals.detailModalWidth()
	innerW := modalInnerWidth(w)
	buttons := saveCancelButtons("agent-edit:save", "agent-edit:cancel",
		func(app *App) tea.Cmd {
			_, cmd := app.agentEdit.commit()
			return cmd
		},
		func(app *App) tea.Cmd {
			app.agentEdit.close()
			return nil
		})
	rows := []string{
		"Agent id: " + m.original + "  source: user",
	}
	for i, name := range agentEditFieldNames {
		prefix := "  "
		value := m.valueForRow(i)
		if i == m.field {
			prefix = "▌ "
			if i != 5 {
				value = a.modals.renderCursorEditor(value, m.cursor)
			}
		}
		rows = append(rows, t.HintLabel.Render(prefix+name+": ")+value)
	}
	rows = append(rows, a.modals.modalStatusRows(m.err, m.saving, "saving…")...)
	body := lipgloss.NewStyle().Width(innerW).Render(strings.Join(rows, "\n"))
	return a.modals.renderModalFrame(modalFrameOptions{
		width:   w,
		title:   "Edit expert",
		buttons: buttons,
		body:    body,
		footer:  t.HintLabel.Render(modalKeyHint("Ctrl+S/Enter save", "Esc cancel", "Tab field", "Left/Right cursor/toggle")),
	})
}

func (m *agentEditModal) valueForRow(field int) string {
	old := m.field
	m.field = field
	value := m.fieldValue()
	m.field = old
	return value
}

package ui

// agent_write_view.go renders the agent create/clone/extract write modal.

import tea "charm.land/bubbletea/v2"

func (m *agentWriteModal) view() string {
	a := m.app
	w := a.modals.detailModalWidth()
	title := "Create expert"
	intro := []string{"Creates a minimal enabled expert. You can refine prompt, tools, and routing from the agent registry files."}
	switch m.mode {
	case agentWriteModeClone:
		title = "Clone expert"
		intro = []string{"Creates an editable copy of " + m.sourceID + " so the built-in/source definition is not overwritten."}
	case agentWriteModeExtract:
		title = "Extract expert from session"
		intro = []string{"Creates an editable expert from the current session's observed prompts and tool usage."}
	}
	buttons := saveCancelButtons("agent-write:save", "agent-write:cancel",
		func(app *App) tea.Cmd {
			_, cmd := app.agentWrite.commit()
			return cmd
		},
		func(app *App) tea.Cmd {
			app.agentWrite.close()
			return nil
		})
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     w,
		title:     title,
		buttons:   buttons,
		surfaceID: "agent-write",
		intro:     intro,
		footer:    a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Esc cancel", "Left/Right move")),
	}, "agent-write", &m.input))
	return rendered.modal
}

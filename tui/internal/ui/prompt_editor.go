package ui

// promptEditModal: the system-prompt/profile editor overlay.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

func (m *promptEditModal) openModal(promptID, profile, title, text string) {
	m.open = true
	m.id = promptID
	m.profile = profile
	m.title = title
	m.input.SetValue(strings.Join(strings.Fields(text), " "))
	m.input.SetCursor(len([]rune(m.input.Value())))
}

// promptEditModal is the system-prompt editor's state: the draft body plus the
// identity of what is being edited (id/profile/title). It owns its behaviour
// (open/close/key/insert/commit/view) and a back-reference to the root App for
// shared services (client, theme, modal chrome).
type promptEditModal struct {
	app     *App
	open    bool
	id      string
	profile string
	input   widget.TextInput
	title   string
}

func (m *promptEditModal) reset() { *m = promptEditModal{app: m.app} }

func (m *promptEditModal) close() { m.reset() }

func (m *promptEditModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
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

func (m *promptEditModal) insert(text string) {
	m.input.Insert(text)
}

func (m *promptEditModal) commit() (tea.Model, tea.Cmd) {
	promptID := m.id
	profile := m.profile
	title := m.title
	text := strings.TrimSpace(m.input.Value())
	m.close()
	if promptID == "" || text == "" {
		m.app.setHint("prompt edit cancelled")
		return m.app, scheduleHintExpire(m.app.transientHint)
	}
	return m.app, savePromptOverrideCmd(m.app.c, m.app.session.runtimeScope(), promptID, profile, title, text)
}

func savePromptOverrideCmd(c *client.Client, scope client.RuntimeScope, promptID, sourceProfile, title, text string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		target := "codex"
		_, err := c.SavePromptScoped(ctx, promptID, gact.PromptSaveRequest{
			Profile: target,
			Title:   title,
			Text:    text,
			Metadata: map[string]any{
				"edited_from_profile": sourceProfile,
				"saved_by":            "gact-tui",
			},
		}, scope)
		return promptSavedMsg{promptID: promptID, profile: target, err: err}
	}
}

type promptEditLoadedMsg struct {
	prompt gact.ResolvedPrompt
	err    error
}

func (m *promptEditModal) handleLoaded(msg promptEditLoadedMsg) (tea.Model, tea.Cmd) {
	if msg.err != nil {
		m.app.setHint("prompt edit failed: " + msg.err.Error())
		return m.app, scheduleHintExpire(m.app.transientHint)
	}
	m.openModal(msg.prompt.ID, msg.prompt.Profile, msg.prompt.Title, msg.prompt.Text)
	return m.app, nil
}

func loadPromptEditCmd(c *client.Client, scope client.RuntimeScope, promptID, profile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompt, err := c.GetPromptScoped(ctx, promptID, profile, scope)
		return promptEditLoadedMsg{prompt: prompt, err: err}
	}
}

func (m *promptEditModal) view() string {
	a := m.app
	w := a.modals.detailModalWidth()
	buttons := saveCancelButtons("prompt-edit:save", "prompt-edit:cancel",
		func(app *App) tea.Cmd {
			_, cmd := app.promptEdit.commit()
			return cmd
		},
		func(app *App) tea.Cmd {
			app.promptEdit.close()
			return nil
		})
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     w,
		title:     "Edit prompt override · " + m.id,
		buttons:   buttons,
		surfaceID: "prompt-edit",
		intro:     []string{"Edits save to profile codex so built-in prompt text is not overwritten."},
		footer:    a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Esc cancel", "Left/Right move")),
	}, "prompt-edit", &m.input))
	return rendered.modal
}

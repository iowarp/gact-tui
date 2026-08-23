package ui

// askUserModal: the agent ask-user question/answer prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

// askUserModal is the agent-question prompt's state: the pending question, a
// free-text answer draft, and the highlighted choice index. It owns its
// behaviour (open/close/key/insert/commit/cancel/view) and holds an app
// back-ref for shared services, wired centrally in wireComponents().
type askUserModal struct {
	app      *App
	open     bool
	question gact.AgentQuestion
	input    widget.TextInput
	choice   int
}

func (m *askUserModal) reset() { *m = askUserModal{app: m.app} }

func (m *askUserModal) openModal(q gact.AgentQuestion) {
	m.open = true
	m.question = q
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.choice = 0
}

func (m *askUserModal) close() { m.reset() }

func (m *askUserModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	choices := questionOptions(m.question)
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "ctrl+x":
		return m.app, m.cancel()
	case "enter":
		return m.commit()
	case "tab", "down":
		m.choice = moveSelection(m.choice, len(choices), 1)
		return m.app, nil
	case "shift+tab", "up":
		m.choice = moveSelection(m.choice, len(choices), -1)
		return m.app, nil
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *askUserModal) insert(text string) {
	m.input.Insert(text)
}

func (m *askUserModal) commit() (tea.Model, tea.Cmd) {
	sid := m.app.session.currentID()
	q := m.question
	if sid == "" || strings.TrimSpace(q.ID) == "" {
		m.close()
		return m.app, nil
	}
	choices := questionOptions(q)
	answer := strings.TrimSpace(m.input.Value())
	selected := make([]string, 0, 1)
	if len(choices) > 0 && answer == "" {
		m.choice = clampSelection(m.choice, len(choices))
		selected = append(selected, questionOptionValue(choices[m.choice]))
	}
	m.close()
	if answer == "" && len(selected) == 0 {
		m.app.setHint("answer cancelled (empty reply)")
		return m.app, nil
	}
	return m.app, answerUserQuestionCmd(m.app.c, sid, q.ID, gact.AnswerUserQuestionRequest{
		Answer:          answer,
		SelectedOptions: selected,
		ChoiceID:        firstString(selected),
		Metadata:        map[string]any{"requested_from": "tui"},
	})
}

func (m *askUserModal) view() string {
	a := m.app
	q := m.question
	w := a.modals.modalWidth()
	prompt := strings.TrimSpace(q.Prompt)
	if prompt == "" {
		prompt = "Agent needs user input before continuing."
	}
	source := valuefmt.FirstNonEmpty(q.Source, q.AgentID, q.Category)
	intro := []string{a.Theme.HintLabel.Render(textutil.Wrap(prompt, modalBodyContentWidth(w)))}
	if source != "" {
		intro = append(intro, a.Theme.HintLabel.Render("Asked by "+source))
	}
	choiceRow, choiceHits := m.renderChoiceRow()
	status := []string{}
	if choiceRow != "" {
		status = append(status, choiceRow)
	}
	buttons := []menuButton{
		{id: "ask-user:answer", label: "answer", action: func(app *App) tea.Cmd {
			_, cmd := app.askUser.commit()
			return cmd
		}},
		{id: "ask-user:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			return app.askUser.cancel()
		}},
	}
	return a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:      w,
		title:      "Answer agent question",
		buttons:    buttons,
		surfaceID:  "ask-user",
		intro:      intro,
		status:     status,
		statusHits: choiceHits,
		footer:     a.Theme.HintLabel.Render(modalKeyHint("Enter answer", "Tab option", "Ctrl+X cancel", "Esc close")),
	}, "ask-user", &m.input)).modal
}

func (m *askUserModal) cancel() tea.Cmd {
	sid := m.app.session.currentID()
	qid := strings.TrimSpace(m.question.ID)
	m.close()
	if sid == "" || qid == "" {
		return nil
	}
	return cancelUserQuestionCmd(m.app.c, sid, qid)
}

func (m *askUserModal) renderChoiceRow() (string, []modalCellHit) {
	choices := questionOptions(m.question)
	if len(choices) == 0 {
		return "", nil
	}
	m.choice = clampSelection(m.choice, len(choices))
	options := make([]modalInlineOption, 0, len(choices))
	for i, choice := range choices {
		i := i
		label := valuefmt.FirstNonEmpty(choice.Label, choice.Value, choice.ID)
		options = append(options, modalInlineOption{
			id:     "ask-user:choice:" + itoa2(i),
			label:  label,
			active: i == m.choice,
			action: func(app *App) tea.Cmd {
				app.askUser.choice = i
				return nil
			},
		})
	}
	return m.app.modals.renderModalInlineOptions("options: ", options)
}

func questionOptions(q gact.AgentQuestion) []gact.AgentQuestionChoice {
	if len(q.Options) > 0 {
		return q.Options
	}
	return q.Choices
}

func questionOptionValue(choice gact.AgentQuestionChoice) string {
	return valuefmt.FirstNonEmpty(choice.Value, choice.ID, choice.Label)
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

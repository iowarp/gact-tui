package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type agentQuestionAnsweredMsg struct {
	sessionID  string
	questionID string
	err        error
}

type retryTurnStartedMsg struct {
	sessionID string
	attempt   gact.TurnAttempt
	err       error
}

func answerUserQuestionCmd(c *client.Client, sessionID, questionID string, req gact.AnswerUserQuestionRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, err := c.AnswerUserQuestion(ctx, sessionID, questionID, req)
		return agentQuestionAnsweredMsg{sessionID: sessionID, questionID: questionID, err: err}
	}
}

func retryTurnCmd(c *client.Client, sessionID, messageID string, req gact.RetryTurnRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		attempt, err := c.RetryMessage(ctx, sessionID, messageID, req)
		return retryTurnStartedMsg{sessionID: sessionID, attempt: attempt, err: err}
	}
}

func (a *App) openAskUserModal(q gact.AgentQuestion) {
	a.askUserOpen = true
	a.askUserQuestion = q
	a.askUserDraft = ""
	a.askUserCursor = 0
	a.askUserChoice = 0
}

func (a *App) closeAskUserModal() {
	a.askUserOpen = false
	a.askUserQuestion = gact.AgentQuestion{}
	a.askUserDraft = ""
	a.askUserCursor = 0
	a.askUserChoice = 0
}

func (a *App) handleAskUserKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	choices := questionOptions(a.askUserQuestion)
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeAskUserModal()
		return a, nil
	case "enter":
		return a.commitAskUserAnswer()
	case "tab", "down":
		a.askUserChoice = moveSelection(a.askUserChoice, len(choices), 1)
		return a, nil
	case "shift+tab", "up":
		a.askUserChoice = moveSelection(a.askUserChoice, len(choices), -1)
		return a, nil
	case "backspace":
		if a.askUserCursor == 0 {
			return a, nil
		}
		runes := []rune(a.askUserDraft)
		runes = append(runes[:a.askUserCursor-1], runes[a.askUserCursor:]...)
		a.askUserDraft = string(runes)
		a.askUserCursor--
		return a, nil
	case "delete":
		runes := []rune(a.askUserDraft)
		if a.askUserCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.askUserCursor], runes[a.askUserCursor+1:]...)
		a.askUserDraft = string(runes)
		return a, nil
	case "left":
		if a.askUserCursor > 0 {
			a.askUserCursor--
		}
		return a, nil
	case "right":
		if a.askUserCursor < len([]rune(a.askUserDraft)) {
			a.askUserCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.askUserCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.askUserCursor = len([]rune(a.askUserDraft))
		return a, nil
	}
	if k.Text != "" {
		runes := []rune(a.askUserDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.askUserCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.askUserCursor:]...)
		a.askUserDraft = string(out)
		a.askUserCursor += len(insert)
	}
	return a, nil
}

func (a *App) commitAskUserAnswer() (tea.Model, tea.Cmd) {
	sid := a.currentSessionID()
	q := a.askUserQuestion
	if sid == "" || strings.TrimSpace(q.ID) == "" {
		a.closeAskUserModal()
		return a, nil
	}
	choices := questionOptions(q)
	answer := strings.TrimSpace(a.askUserDraft)
	selected := make([]string, 0, 1)
	if len(choices) > 0 && answer == "" {
		a.askUserChoice = clampSelection(a.askUserChoice, len(choices))
		selected = append(selected, questionOptionValue(choices[a.askUserChoice]))
	}
	a.closeAskUserModal()
	if answer == "" && len(selected) == 0 {
		a.transientHint = "answer cancelled (empty reply)"
		return a, nil
	}
	return a, answerUserQuestionCmd(a.c, sid, q.ID, gact.AnswerUserQuestionRequest{
		Answer:          answer,
		SelectedOptions: selected,
		ChoiceID:        firstString(selected),
		Metadata:        map[string]any{"requested_from": "tui"},
	})
}

func (a *App) viewAskUser() string {
	q := a.askUserQuestion
	w := a.modalWidth()
	prompt := strings.TrimSpace(q.Prompt)
	if prompt == "" {
		prompt = "Agent needs user input before continuing."
	}
	source := firstNonEmpty(q.Source, q.AgentID, q.Category)
	intro := []string{a.Theme.HintLabel.Render(wrap(prompt, modalBodyContentWidth(w)))}
	if source != "" {
		intro = append(intro, a.Theme.HintLabel.Render("source: "+source))
	}
	choiceRow, choiceHits := a.renderAskUserChoiceRow()
	status := []string{}
	if choiceRow != "" {
		status = append(status, choiceRow)
	}
	buttons := []menuButton{
		{id: "ask-user:answer", label: "answer", action: func(app *App) tea.Cmd {
			_, cmd := app.commitAskUserAnswer()
			return cmd
		}},
		{id: "ask-user:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.closeAskUserModal()
			return nil
		}},
	}
	return a.renderTextEntryModal(textEntryModalOptions{
		width:        w,
		title:        "Answer agent question",
		buttons:      buttons,
		surfaceID:    "ask-user",
		intro:        intro,
		editor:       a.renderCursorEditor(a.askUserDraft, a.askUserCursor),
		editorID:     "ask-user",
		editorValue:  a.askUserDraft,
		cursorAction: func(app *App, cursor int) { app.askUserCursor = cursor },
		status:       status,
		statusHits:   choiceHits,
		footer:       a.Theme.HintLabel.Render(modalKeyHint("Enter answer", "Tab option", "Esc cancel")),
	}).modal
}

func (a *App) renderAskUserChoiceRow() (string, []modalCellHit) {
	choices := questionOptions(a.askUserQuestion)
	if len(choices) == 0 {
		return "", nil
	}
	a.askUserChoice = clampSelection(a.askUserChoice, len(choices))
	options := make([]modalInlineOption, 0, len(choices))
	for i, choice := range choices {
		i := i
		label := firstNonEmpty(choice.Label, choice.Value, choice.ID)
		options = append(options, modalInlineOption{
			id:     "ask-user:choice:" + itoa2(i),
			label:  label,
			active: i == a.askUserChoice,
			action: func(app *App) tea.Cmd {
				app.askUserChoice = i
				return nil
			},
		})
	}
	return a.renderModalInlineOptions("options: ", options)
}

func (a *App) openRetryNotesModal(messageID string) {
	a.retryNotesOpen = true
	a.retryMessageID = messageID
	a.retryNotesDraft = ""
	a.retryNotesCursor = 0
}

func (a *App) closeRetryNotesModal() {
	a.retryNotesOpen = false
	a.retryMessageID = ""
	a.retryNotesDraft = ""
	a.retryNotesCursor = 0
}

func (a *App) handleRetryNotesKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeRetryNotesModal()
		return a, nil
	case "enter":
		return a.commitRetryNotes()
	case "backspace":
		if a.retryNotesCursor == 0 {
			return a, nil
		}
		runes := []rune(a.retryNotesDraft)
		runes = append(runes[:a.retryNotesCursor-1], runes[a.retryNotesCursor:]...)
		a.retryNotesDraft = string(runes)
		a.retryNotesCursor--
		return a, nil
	case "delete":
		runes := []rune(a.retryNotesDraft)
		if a.retryNotesCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.retryNotesCursor], runes[a.retryNotesCursor+1:]...)
		a.retryNotesDraft = string(runes)
		return a, nil
	case "left":
		if a.retryNotesCursor > 0 {
			a.retryNotesCursor--
		}
		return a, nil
	case "right":
		if a.retryNotesCursor < len([]rune(a.retryNotesDraft)) {
			a.retryNotesCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.retryNotesCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.retryNotesCursor = len([]rune(a.retryNotesDraft))
		return a, nil
	}
	if k.Text != "" {
		runes := []rune(a.retryNotesDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.retryNotesCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.retryNotesCursor:]...)
		a.retryNotesDraft = string(out)
		a.retryNotesCursor += len(insert)
	}
	return a, nil
}

func (a *App) commitRetryNotes() (tea.Model, tea.Cmd) {
	sid := a.currentSessionID()
	msgID := strings.TrimSpace(a.retryMessageID)
	notes := strings.TrimSpace(a.retryNotesDraft)
	a.closeRetryNotesModal()
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

func (a *App) viewRetryNotes() string {
	w := a.modalWidth()
	intro := []string{
		a.Theme.HintLabel.Render(wrap("Create a linked retry attempt for the selected turn.", modalBodyContentWidth(w))),
		a.Theme.HintLabel.Render(wrap("Changing model or provider can lose KV-cache reuse and increase time-to-first-token, latency, and cost.", modalBodyContentWidth(w))),
	}
	buttons := []menuButton{
		{id: "retry-notes:retry", label: "retry", action: func(app *App) tea.Cmd {
			_, cmd := app.commitRetryNotes()
			return cmd
		}},
		{id: "retry-notes:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.closeRetryNotesModal()
			return nil
		}},
	}
	return a.renderTextEntryModal(textEntryModalOptions{
		width:        w,
		title:        "Retry with notes",
		buttons:      buttons,
		surfaceID:    "retry-notes",
		intro:        intro,
		editor:       a.renderCursorEditor(a.retryNotesDraft, a.retryNotesCursor),
		editorID:     "retry-notes",
		editorValue:  a.retryNotesDraft,
		cursorAction: func(app *App, cursor int) { app.retryNotesCursor = cursor },
		footer:       a.Theme.HintLabel.Render(modalKeyHint("Enter retry", "Esc cancel")),
	}).modal
}

func (a *App) openRetryModelModal(messageID string) {
	a.retryModelOpen = true
	a.retryModelMsgID = messageID
	a.retryModelDraft = ""
	a.retryModelCursor = 0
}

func (a *App) closeRetryModelModal() {
	a.retryModelOpen = false
	a.retryModelMsgID = ""
	a.retryModelDraft = ""
	a.retryModelCursor = 0
}

func (a *App) handleRetryModelKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeRetryModelModal()
		return a, nil
	case "enter":
		return a.commitRetryModel()
	case "backspace":
		if a.retryModelCursor == 0 {
			return a, nil
		}
		runes := []rune(a.retryModelDraft)
		runes = append(runes[:a.retryModelCursor-1], runes[a.retryModelCursor:]...)
		a.retryModelDraft = string(runes)
		a.retryModelCursor--
		return a, nil
	case "delete":
		runes := []rune(a.retryModelDraft)
		if a.retryModelCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.retryModelCursor], runes[a.retryModelCursor+1:]...)
		a.retryModelDraft = string(runes)
		return a, nil
	case "left":
		if a.retryModelCursor > 0 {
			a.retryModelCursor--
		}
		return a, nil
	case "right":
		if a.retryModelCursor < len([]rune(a.retryModelDraft)) {
			a.retryModelCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.retryModelCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.retryModelCursor = len([]rune(a.retryModelDraft))
		return a, nil
	}
	if k.Text != "" {
		runes := []rune(a.retryModelDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.retryModelCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.retryModelCursor:]...)
		a.retryModelDraft = string(out)
		a.retryModelCursor += len(insert)
	}
	return a, nil
}

func (a *App) commitRetryModel() (tea.Model, tea.Cmd) {
	sid := a.currentSessionID()
	msgID := strings.TrimSpace(a.retryModelMsgID)
	ref, ok := parseRetryModelRef(a.retryModelDraft)
	a.closeRetryModelModal()
	if sid == "" || msgID == "" {
		return a, nil
	}
	if !ok {
		a.transientHint = "retry model must be provider/model"
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

func (a *App) viewRetryModel() string {
	w := a.modalWidth()
	intro := []string{
		a.Theme.HintLabel.Render(wrap("Create a linked retry attempt with a provider/model override.", modalBodyContentWidth(w))),
		a.Theme.HintLabel.Render(wrap("This can recompute provider-side KV cache, increase time-to-first-token, latency, and cost, and may produce different reasoning or tool choices.", modalBodyContentWidth(w))),
	}
	buttons := []menuButton{
		{id: "retry-model:retry", label: "retry", action: func(app *App) tea.Cmd {
			_, cmd := app.commitRetryModel()
			return cmd
		}},
		{id: "retry-model:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.closeRetryModelModal()
			return nil
		}},
	}
	return a.renderTextEntryModal(textEntryModalOptions{
		width:        w,
		title:        "Retry with model",
		buttons:      buttons,
		surfaceID:    "retry-model",
		intro:        intro,
		editor:       a.renderCursorEditor(a.retryModelDraft, a.retryModelCursor),
		editorID:     "retry-model",
		editorValue:  a.retryModelDraft,
		cursorAction: func(app *App, cursor int) { app.retryModelCursor = cursor },
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

func questionOptions(q gact.AgentQuestion) []gact.AgentQuestionChoice {
	if len(q.Options) > 0 {
		return q.Options
	}
	return q.Choices
}

func questionOptionValue(choice gact.AgentQuestionChoice) string {
	return firstNonEmpty(choice.Value, choice.ID, choice.Label)
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

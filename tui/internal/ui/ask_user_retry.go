package ui

// ask_user_retry.go handles ask-user answer/cancel and turn-retry messages, their backend commands, and modal updates.

import (
	"context"
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

type agentQuestionCancelledMsg struct {
	sessionID  string
	questionID string
	err        error
}

type retryTurnStartedMsg struct {
	sessionID string
	attempt   gact.TurnAttempt
	err       error
}

func (c *agentComponent) handleAgentQuestionAnswered(m agentQuestionAnsweredMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("answer failed: " + m.err.Error())
		return c.app, nil
	}
	c.app.setHint("answer submitted")
	if m.sessionID != "" {
		return c.app, loadMessagesCmd(c.app.c, m.sessionID)
	}
	return c.app, nil
}

func (c *agentComponent) handleAgentQuestionCancelled(m agentQuestionCancelledMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("question cancel failed: " + m.err.Error())
		return c.app, nil
	}
	c.app.setHint("question cancelled")
	if m.sessionID != "" {
		return c.app, loadMessagesCmd(c.app.c, m.sessionID)
	}
	return c.app, nil
}

func (c *conversationComponent) handleRetryTurnStarted(m retryTurnStartedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("retry failed: " + m.err.Error())
		return a, nil
	}
	label := shortID(m.attempt.ID)
	if label == "" {
		label = "retry"
	}
	a.setHint("retry attempt queued: " + label)
	if m.sessionID != "" {
		return a, loadMessagesCmd(a.c, m.sessionID)
	}
	return a, nil
}

func answerUserQuestionCmd(c *client.Client, sessionID, questionID string, req gact.AnswerUserQuestionRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, err := c.AnswerUserQuestion(ctx, sessionID, questionID, req)
		return agentQuestionAnsweredMsg{sessionID: sessionID, questionID: questionID, err: err}
	}
}

func cancelUserQuestionCmd(c *client.Client, sessionID, questionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, err := c.CancelUserQuestion(ctx, sessionID, questionID)
		return agentQuestionCancelledMsg{sessionID: sessionID, questionID: questionID, err: err}
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

func (m *askUserModal) applyUserQuestionCreated(e client.SSEEvent) {
	a := m.app
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	q := decodeUserQuestionPayload(pl)
	if q.ID == "" {
		return
	}
	sid := firstNonEmpty(q.SessionID, a.session.currentID())
	if sid == "" || a.conversation.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	q.SessionID = sid
	if sid == a.session.currentID() && q.Status == "pending" {
		m.openModal(q)
		m.appendQuestionMessage(q)
	}
}

func (m *askUserModal) applyUserQuestionResolved(e client.SSEEvent) {
	a := m.app
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	q := decodeUserQuestionPayload(pl)
	if q.ID == "" {
		return
	}
	if m.open && m.question.ID == q.ID {
		m.close()
	}
	for mi := range a.conversation.messages {
		for pi := range a.conversation.messages[mi].Parts {
			part := &a.conversation.messages[mi].Parts[pi]
			if part.Question != nil && part.Question.ID == q.ID {
				part.Question.Status = q.Status
				part.Question.Answer = q.Answer
				part.Question.SelectedOptions = append([]string(nil), q.SelectedOptions...)
			}
		}
	}
}

func (m *askUserModal) appendQuestionMessage(q gact.UserQuestion) {
	a := m.app
	msgID := "msg_" + q.ID
	for _, msg := range a.conversation.messages {
		if msg.ID == msgID {
			return
		}
	}
	created := q.CreatedAt
	if created.IsZero() {
		created = time.Now().UTC()
	}
	a.conversation.messages = append(a.conversation.messages, gact.Message{
		ID:        msgID,
		SessionID: q.SessionID,
		Role:      gact.RoleAssistant,
		CreatedAt: created,
		UpdatedAt: created,
		Parts: []gact.Part{{
			ID:       "part_" + q.ID,
			Type:     gact.PartTypeAgentQuestion,
			Text:     q.Prompt,
			Question: &q,
			Metadata: map[string]any{
				"source":      "user_question.created",
				"question_id": q.ID,
			},
		}},
		Metadata: map[string]any{
			"synthetic":   "user_question",
			"question_id": q.ID,
		},
	})
}

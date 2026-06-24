package ui

// session_rewind_commands.go defines session rewind/undo commands, messages, and handlers.

import (
	"context"
	"fmt"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type sessionRewindDoneMsg struct {
	sessionID string
	deleted   []string
	err       error
}

type sessionUndoDoneMsg struct {
	sessionID string
	reverted  []string
	err       error
}

func (c *sessionComponent) handleRewindDone(m sessionRewindDoneMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("rewind failed: " + m.err.Error())
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint(fmt.Sprintf("rewound %d message(s)", len(m.deleted)))
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), loadMessagesCmd(c.app.c, m.sessionID))
}

func (c *sessionComponent) handleUndoDone(m sessionUndoDoneMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("undo failed: " + m.err.Error())
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint(fmt.Sprintf("undid %d message(s)", len(m.reverted)))
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), loadMessagesCmd(c.app.c, m.sessionID))
}

func rewindSessionCmd(c *client.Client, sessionID, messageID string, includeTarget bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		deleted, err := c.RewindSession(ctx, sessionID, messageID, includeTarget)
		return sessionRewindDoneMsg{sessionID: sessionID, deleted: deleted, err: err}
	}
}

func undoSessionCmd(c *client.Client, sessionID string, count int) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		reverted, err := c.UndoSession(ctx, sessionID, count)
		return sessionUndoDoneMsg{sessionID: sessionID, reverted: reverted, err: err}
	}
}

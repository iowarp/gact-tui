package ui

// session_commands.go defines session reload/duplicate/delete/cancel backend commands.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// reloadSessionsCmd is used after subagent.started so the new sub-session
// shows up in the sidebar without the user having to refresh manually.
func reloadSessionsCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return sessionsRefreshedMsg{sessions: sessions}
	}
}

func (c *sessionComponent) clearLocalModelRefs() {
	for i := range c.sessions {
		c.sessions[i].Model = gact.ModelRef{}
	}
}

// duplicateSessionCmd creates a new session carrying over the source
// session's title + agent but with zero messages. Model refs are not
// copied because CLIO uses a global LM provider; preserving a stale
// per-session model ref makes the next send fail after provider swaps.
func duplicateSessionCmd(c *client.Client, wsID string, src gact.Session) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		title := src.Title
		if title == "" {
			title = "(untitled)"
		}
		title += " (copy)"
		req := client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       title,
		}
		if src.Agent.ID != "" {
			ag := src.Agent
			req.Agent = &ag
		}
		s, err := c.CreateSession(ctx, req)
		if err != nil {
			return errMsg{err: err, stage: "duplicate-session"}
		}
		return sessionCreatedMsg{session: s}
	}
}

func deleteSessionCmd(c *client.Client, wsID, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.DeleteSession(ctx, sessionID); err != nil {
			return errMsg{err: err, stage: "delete-session"}
		}
		// Re-list sessions in the workspace.
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return sessionsRefreshedMsg{sessions: sessions}
	}
}

func cancelCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.CancelSession(ctx, sessionID); err != nil {
			return errMsg{err: err, stage: "cancel-session"}
		}
		return nil
	}
}

package ui

// session_commands.go defines session reload/duplicate/delete/cancel backend commands.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// reloadSessionsCmd is used after subagent.started so the new sub-session
// shows up in the sidebar without the user having to refresh manually, and
// after a confirmed session deletion so the deleted row disappears.
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

// sessionDeletedMsg reports that DELETE /v1/sessions/{id} succeeded. It
// deliberately carries the deleted session's id rather than a session list:
// list payloads are filtered (workspace-scoped, archived-filtered) and so can
// never prove a session was deleted — only this signal can (#231).
type sessionDeletedMsg struct {
	sessionID string
}

// deleteSessionCmd deletes the session on the backend and reports the
// confirmed deletion. The sidebar re-list is issued by the sessionDeletedMsg
// handler as a follow-up command, so the deletion signal (which also prunes
// the session's execution ledger) is delivered even if the re-list
// subsequently fails.
func deleteSessionCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.DeleteSession(ctx, sessionID); err != nil {
			return errMsg{err: err, stage: "delete-session"}
		}
		return sessionDeletedMsg{sessionID: sessionID}
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

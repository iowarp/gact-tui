package ui

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// archiveSessionCmd PATCHes archived to `value` on the given session
// and returns sessionArchivedMsg. Value is parameterised because the
// archive/unarchive flows share one code path: in the active view
// `A` sends archived=true, in the archived view it sends archived=
// false; either way the Update handler removes the session from the
// currently-filtered list.
func archiveSessionCmd(c *client.Client, sessionID string, value bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		v := value
		_, err := c.PatchSession(ctx, sessionID, client.PatchSessionRequest{
			Archived: &v,
		})
		return sessionArchivedMsg{sessionID: sessionID, archived: value, err: err}
	}
}

// reloadSessionsForView fetches the session list for the given
// workspace with the archived filter set. Distinct from
// reloadSessionsCmd because this emits a fresh sessionsRefreshedMsg
// expectation — we want the standard "preserve current selection"
// handling when flipping archived views, rather than the "land on
// session #0" semantics of workspaceSwitchedMsg.
func reloadSessionsForView(c *client.Client, wsID string, archived bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sessions, err := c.ListSessions(ctx, client.SessionFilter{
			WorkspaceID: wsID,
			Archived:    archived,
		})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return sessionsRefreshedMsg{sessions: sessions}
	}
}

// sessionArchivedMsg is emitted by archiveSessionCmd. `archived`
// carries the new value (true=archived now, false=un-archived) so
// the Update handler can craft a matching toast. On failure the
// sidebar stays unchanged and we surface a transient hint (J5 pattern).
type sessionArchivedMsg struct {
	sessionID string
	archived  bool
	err       error
}

package ui

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// archiveSessionCmd PATCHes archived=true on the given session and
// returns sessionArchivedMsg with the outcome. We use a dedicated
// result type (not the existing sessionTitleRenamedMsg) because the
// Update handler needs to REMOVE the session from a.sessions on
// success rather than mirror a field into it — archive semantics are
// different enough that tangling the two types would invite bugs.
func archiveSessionCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		archived := true
		_, err := c.PatchSession(ctx, sessionID, client.PatchSessionRequest{
			Archived: &archived,
		})
		return sessionArchivedMsg{sessionID: sessionID, err: err}
	}
}

// sessionArchivedMsg is emitted by archiveSessionCmd. On success the
// Update handler drops the session from the sidebar; on failure it
// surfaces a transient hint so the user knows what happened but the
// UI doesn't promote to StageError (J5 pattern).
type sessionArchivedMsg struct {
	sessionID string
	err       error
}

package ui

// workspace_switch_commands.go defines workspace switch/delete and session-list commands and their messages.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// listSessionsCmd fetches sessions for the given workspace. Separate
// from the existing reloadSessionsCmd because we want a distinct result
// message so the Update dispatcher can tell "switched workspace, pick
// index 0" apart from "subagent spawned, preserve current selection".
func listSessionsCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return workspaceSwitchedMsg{wsID: wsID, sessions: sessions}
	}
}

// workspaceSwitchedMsg is dispatched after listSessionsCmd returns.
// The Update handler picks session #0 (if any) and starts its SSE
// stream, completing the context switch.
type workspaceSwitchedMsg struct {
	wsID     string
	sessions []gact.Session
}

type workspaceDeletedMsg struct {
	workspaceID string
	err         error
}

type sessionsRefreshedMsg struct {
	sessions []gact.Session
}

func deleteWorkspaceCmd(c *client.Client, workspaceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return workspaceDeletedMsg{workspaceID: workspaceID, err: c.DeleteWorkspace(ctx, workspaceID)}
	}
}

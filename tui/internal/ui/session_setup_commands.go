package ui

// session_setup_commands.go loads the installed agents and creates a session that runs the chosen one.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func loadSessionSetupOptionsCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agents, err := c.ListPluginAgents(ctx)
		return sessionSetupLoadedMsg{agents: agents, err: err}
	}
}

// createSessionWithAgentCmd creates a session; an empty agentRef lets the
// backend choose its default agent.
func createSessionWithAgentCmd(c *client.Client, wsID, agentRef string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		req := client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
		}
		if agentRef != "" {
			req.Agent = &gact.AgentRef{ID: agentRef}
		}
		s, err := c.CreateSession(ctx, req)
		if err != nil {
			return errMsg{err: err, stage: "create-session"}
		}
		return sessionCreatedMsg{session: s}
	}
}

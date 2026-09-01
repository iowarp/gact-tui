package ui

// session_tasks_commands.go loads per-session task counts and handles the tasks-loaded message.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// loadSessionTasksCmd fetches §6.18 tasks for a session. Used by
// UUU1 to render a `(N tasks)` badge on the sidebar row. Failures
// are silent — tasks are optional capability and we don't want to
// spam errors on backends that 404 the endpoint.
func loadSessionTasksCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		tasks, err := c.ListSessionTasks(ctx, sessionID)
		if err != nil {
			return sessionTasksLoadedMsg{sessionID: sessionID, tasks: nil}
		}
		return sessionTasksLoadedMsg{sessionID: sessionID, tasks: tasks}
	}
}

type sessionTasksLoadedMsg struct {
	sessionID string
	tasks     []gact.SessionTask
}

func (c *sessionComponent) handleTasksLoaded(m sessionTasksLoadedMsg) (tea.Model, tea.Cmd) {
	// Stash count for the badge. Pending+running tasks count; completed
	// and failed tasks are done and irrelevant to the badge.
	if c.taskCountBySession == nil {
		c.taskCountBySession = map[string]int{}
	}
	open := 0
	for _, t := range m.tasks {
		if t.Status == "pending" || t.Status == "running" {
			open++
		}
	}
	c.taskCountBySession[m.sessionID] = open
	return c.app, nil
}

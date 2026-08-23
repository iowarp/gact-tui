package client

import (
	"context"
	"net/http"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// ListSessionTasks returns all tracked tasks for a session.
func (c *Client) ListSessionTasks(ctx context.Context, sessionID string) ([]gact.SessionTask, error) {
	var out struct {
		Tasks []gact.SessionTask `json:"tasks"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/tasks", nil, &out)
	return out.Tasks, err
}

// CreateSessionTask adds a task to a session. Server fills id, timestamps,
// and defaults status to "pending" if empty.
func (c *Client) CreateSessionTask(ctx context.Context, sessionID string, task gact.SessionTask) (gact.SessionTask, error) {
	var out gact.SessionTask
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/tasks", task, &out)
	return out, err
}

// PatchTask updates title/status/metadata (PATCH semantics — empty
// fields ignored). The server bumps UpdatedAt unconditionally.
func (c *Client) PatchTask(ctx context.Context, taskID string, patch gact.SessionTask) (gact.SessionTask, error) {
	var out gact.SessionTask
	err := c.do(ctx, http.MethodPatch, "/v1/tasks/"+taskID, patch, &out)
	return out, err
}

// DeleteTask removes a task by id.
func (c *Client) DeleteTask(ctx context.Context, taskID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/tasks/"+taskID, nil, nil)
}

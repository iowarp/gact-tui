package client

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type CommandFilter struct {
	RuntimeScope
	AgentID string
	Planner bool
}

func (c *Client) ListCommands(ctx context.Context) ([]gact.Command, error) {
	return c.ListCommandsScoped(ctx, CommandFilter{})
}

func (c *Client) ListCommandsScoped(ctx context.Context, filter CommandFilter) ([]gact.Command, error) {
	var out struct {
		Commands []gact.Command `json:"commands"`
	}
	q := url.Values{}
	filter.RuntimeScope.appendTo(q)
	if filter.AgentID != "" {
		q.Set("agent_id", filter.AgentID)
	}
	if filter.Planner {
		q.Set("planner", "true")
	}
	err := c.do(ctx, http.MethodGet, "/v1/commands"+queryString(q), nil, &out)
	return out.Commands, err
}

// RunCommand triggers POST /v1/sessions/{id}/commands/{cmd_id}.
// cmdID may include a leading slash; it's URL-escaped automatically.
func (c *Client) RunCommand(ctx context.Context, sessionID, cmdID string) error {
	escaped := strings.ReplaceAll(cmdID, "/", "%2F")
	return c.do(ctx, http.MethodPost,
		"/v1/sessions/"+sessionID+"/commands/"+escaped, nil, nil)
}

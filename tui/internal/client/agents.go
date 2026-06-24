package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *Client) ListAgents(ctx context.Context) ([]gact.AgentDef, error) {
	return c.ListAgentsScoped(ctx, RuntimeScope{})
}

func (c *Client) ListAgentsScoped(ctx context.Context, scope RuntimeScope) ([]gact.AgentDef, error) {
	var out struct {
		Agents []gact.AgentDef `json:"agents"`
	}
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodGet, "/v1/agents"+queryString(q), nil, &out)
	return out.Agents, err
}

// GetAgent fetches one agent definition by id (full def incl.
// system_prompt and parameters) via /v1/agents/{id}. Used by
// `gact agent show` for shell scripting symmetric to `gact tool show`.
func (c *Client) GetAgent(ctx context.Context, id string) (gact.AgentDef, error) {
	return c.GetAgentScoped(ctx, id, RuntimeScope{})
}

func (c *Client) GetAgentScoped(ctx context.Context, id string, scope RuntimeScope) (gact.AgentDef, error) {
	var out gact.AgentDef
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodGet, "/v1/agents/"+url.PathEscape(id)+queryString(q), nil, &out)
	return out, err
}

func (c *Client) CreateAgent(ctx context.Context, agent gact.AgentDef) (gact.AgentDef, error) {
	var out gact.AgentDef
	err := c.do(ctx, http.MethodPost, "/v1/agents", agent, &out)
	return out, err
}

func (c *Client) UpdateAgent(ctx context.Context, agentID string, agent gact.AgentDef) (gact.AgentDef, error) {
	var out gact.AgentDef
	err := c.do(ctx, http.MethodPut, "/v1/agents/"+url.PathEscape(agentID), agent, &out)
	return out, err
}

func (c *Client) DeleteAgent(ctx context.Context, agentID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/agents/"+url.PathEscape(agentID), nil, nil)
}

func (c *Client) ExtractAgent(ctx context.Context, req gact.AgentExtractRequest) (gact.AgentDef, error) {
	var out gact.AgentDef
	err := c.do(ctx, http.MethodPost, "/v1/agents/extract", req, &out)
	return out, err
}

func (c *Client) ListTools(ctx context.Context) ([]gact.Tool, error) {
	var out struct {
		Tools []gact.Tool `json:"tools"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/tools", nil, &out)
	return out.Tools, err
}

// GetTool fetches one tool by id (full definition incl. input/output
// schemas) via /v1/tools/{id}. Used by `gact tool show` to surface
// the schema for shell scripts that want to call the tool directly.
func (c *Client) GetTool(ctx context.Context, id string) (gact.Tool, error) {
	var out gact.Tool
	err := c.do(ctx, http.MethodGet, "/v1/tools/"+id, nil, &out)
	return out, err
}

package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *Client) ListAgents(ctx context.Context) ([]gact.AgentDef, error) {
	return c.ListAgentsScoped(ctx, RuntimeScope{})
}

// ListAgentsScoped lists the installed agents as catalog definitions: each
// row's ID is the agent ref a session names to run it.
func (c *Client) ListAgentsScoped(ctx context.Context, scope RuntimeScope) ([]gact.AgentDef, error) {
	var out struct {
		Agents []gact.PluginAgent `json:"agents"`
	}
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodGet, "/v1/agents"+queryString(q), nil, &out)
	defs := make([]gact.AgentDef, 0, len(out.Agents))
	for _, agent := range out.Agents {
		defs = append(defs, agent.Definition())
	}
	return defs, err
}

// ListPluginAgents lists installed agents and user agents on a backend that
// composes agents from plugins (x_clio_agent_plugins): each carries the ref a
// new session names to run it.
func (c *Client) ListPluginAgents(ctx context.Context) ([]gact.PluginAgent, error) {
	var out struct {
		Agents []gact.PluginAgent `json:"agents"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/agents", nil, &out)
	return out.Agents, err
}

// SessionAgentSkills lists the skills the session agent's plugins bring.
func (c *Client) SessionAgentSkills(ctx context.Context, sessionID string) ([]gact.PluginSkill, error) {
	var out struct {
		Resolution struct {
			Skills []gact.PluginSkill `json:"skills"`
		} `json:"resolution"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/agent", nil, &out)
	return out.Resolution.Skills, err
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

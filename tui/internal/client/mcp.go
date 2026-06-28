package client

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ListMcpServers returns all MCP servers known to the backend. Powers
// the /mcp slash-command modal.
func (c *Client) ListMcpServers(ctx context.Context) ([]gact.McpServer, error) {
	var out struct {
		Servers []gact.McpServer `json:"servers"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers", nil, &out)
	return out.Servers, err
}

type McpHandshakeServer struct {
	Name       string   `json:"name"`
	Reachable  bool     `json:"reachable"`
	State      string   `json:"state,omitempty"`
	Transport  string   `json:"transport,omitempty"`
	Tools      []string `json:"tools,omitempty"`
	ToolsCount int      `json:"tools_count,omitempty"`
	Error      string   `json:"error,omitempty"`
	LatencyMS  float64  `json:"latency_ms,omitempty"`
}

type McpHandshakeResponse struct {
	Servers []McpHandshakeServer `json:"servers"`
}

// McpHandshake reports live server health from CLIO's MCP runtime. It is
// intentionally separate from /v1/mcp/servers because stdio servers are
// mounted per active workspace/session on newer CLIO builds.
func (c *Client) McpHandshake(ctx context.Context, scope RuntimeScope) (McpHandshakeResponse, error) {
	var out McpHandshakeResponse
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodGet, "/v1/mcp/handshake"+queryString(q), nil, &out)
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "501") {
			return McpHandshakeResponse{}, nil
		}
		return McpHandshakeResponse{}, err
	}
	return out, nil
}

// McpResourceRead POSTs /v1/mcp/servers/{id}/resources/read with
// `{uri: ...}` and returns the contents slice. Each entry has the
// URI plus either a `text` body or a base64 `data` blob.
func (c *Client) McpResourceRead(ctx context.Context, serverID, uri string) ([]gact.McpContent, error) {
	body := map[string]any{"uri": uri}
	var out struct {
		Contents []gact.McpContent `json:"contents"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/mcp/servers/"+serverID+"/resources/read", body, &out)
	return out.Contents, err
}

// McpReconnect POSTs /v1/mcp/servers/{id}/reconnect — forces the
// backend to re-establish its connection to a previously-disconnected
// MCP server. Returns nil on 2xx (server may respond 204).
func (c *Client) McpReconnect(ctx context.Context, serverID string) error {
	return c.do(ctx, http.MethodPost, "/v1/mcp/servers/"+serverID+"/reconnect", nil, nil)
}

// McpInstall POSTs /v1/mcp/servers with a stdio or http transport spec.
// Body shape (stdio): {name, transport:"stdio", command, args:[...], env:{...}}
// Body shape (http):  {name, transport:"http",  url}
// Returns the installed server's ID + tools list.
func (c *Client) McpInstall(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	err := c.do(ctx, http.MethodPost, "/v1/mcp/servers", body, &out)
	return out, err
}

// McpUninstall DELETEs /v1/mcp/servers/{id}. Bundled in-process servers
// (mcp_fs/hdf5/parquet) cannot be removed and return 404.
func (c *Client) McpUninstall(ctx context.Context, serverID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/mcp/servers/"+serverID, nil, nil)
}

// McpServerTools fetches the tools advertised by one MCP server via
// /v1/mcp/servers/{id}/tools.
func (c *Client) McpServerTools(ctx context.Context, serverID string) ([]gact.Tool, error) {
	var out struct {
		Tools []gact.Tool `json:"tools"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/tools", nil, &out)
	return out.Tools, err
}

// McpServerResources fetches the resources advertised by one MCP server
// via /v1/mcp/servers/{id}/resources.
func (c *Client) McpServerResources(ctx context.Context, serverID string) ([]gact.McpResource, error) {
	var out struct {
		Resources []gact.McpResource `json:"resources"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/resources", nil, &out)
	return out.Resources, err
}

// McpServerPrompts fetches the prompt templates advertised by one MCP
// server via /v1/mcp/servers/{id}/prompts.
func (c *Client) McpServerPrompts(ctx context.Context, serverID string) ([]gact.McpPrompt, error) {
	var out struct {
		Prompts []gact.McpPrompt `json:"prompts"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/prompts", nil, &out)
	return out.Prompts, err
}

package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ListWorkspacesResponse is the response shape for GET /v1/workspaces.
type ListWorkspacesResponse struct {
	Workspaces []gact.Workspace `json:"workspaces"`
	NextCursor string           `json:"next_cursor,omitempty"`
}

func (c *Client) ListWorkspaces(ctx context.Context) ([]gact.Workspace, error) {
	var out ListWorkspacesResponse
	err := c.do(ctx, http.MethodGet, "/v1/workspaces", nil, &out)
	return out.Workspaces, err
}

type CreateWorkspaceRequest struct {
	Name     string         `json:"name,omitempty"`
	RootPath string         `json:"root_path"`
	Config   map[string]any `json:"config,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

func (c *Client) CreateWorkspace(ctx context.Context, req CreateWorkspaceRequest) (gact.Workspace, error) {
	var out gact.Workspace
	err := c.do(ctx, http.MethodPost, "/v1/workspaces", req, &out)
	return out, err
}

func (c *Client) DeleteWorkspace(ctx context.Context, workspaceID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/workspaces/"+url.PathEscape(workspaceID), nil, nil)
}

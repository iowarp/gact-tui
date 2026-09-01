package client

import (
	"context"
	"net/http"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// ListHooks returns every registered hook.
func (c *Client) ListHooks(ctx context.Context) ([]gact.Hook, error) {
	var out struct {
		Hooks []gact.Hook `json:"hooks"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/hooks", nil, &out)
	return out.Hooks, err
}

// CreateHook registers a hook. Server fills in the id; caller may
// leave Hook.ID empty.
func (c *Client) CreateHook(ctx context.Context, h gact.Hook) (gact.Hook, error) {
	var out gact.Hook
	err := c.do(ctx, http.MethodPost, "/v1/hooks", h, &out)
	return out, err
}

// DeleteHook removes a hook by id. 204 on success, 404 if missing.
func (c *Client) DeleteHook(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/hooks/"+id, nil, nil)
}

package client

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// PermissionWire is the wire shape returned from GET /v1/permissions; it
// embeds gact.PermissionRequest plus status fields. The store wraps this
// internally; the TUI sees this shape over the wire.
type PermissionWire struct {
	gact.PermissionRequest
	Status     string                `json:"status"`
	Action     gact.PermissionAction `json:"action,omitempty"`
	ResolvedAt time.Time             `json:"resolved_at,omitempty"`
}

func (c *Client) ListPermissions(ctx context.Context, sessionID string, onlyPending bool) ([]PermissionWire, error) {
	q := url.Values{}
	if sessionID != "" {
		q.Set("session_id", sessionID)
	}
	if onlyPending {
		q.Set("status", "pending")
	}
	var out struct {
		Permissions []PermissionWire `json:"permissions"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/permissions?"+q.Encode(), nil, &out)
	return out.Permissions, err
}

func (c *Client) RespondPermission(ctx context.Context, permissionID string, action gact.PermissionAction) error {
	return c.do(ctx, http.MethodPost, "/v1/permissions/"+permissionID,
		map[string]any{"action": string(action)}, nil)
}

// ListPolicies returns every registered permission policy.
func (c *Client) ListPolicies(ctx context.Context) ([]gact.Policy, error) {
	var out struct {
		Policies []gact.Policy `json:"policies"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/policies", nil, &out)
	return out.Policies, err
}

// PutPolicies replaces the whole policy list. Returns the canonical
// list as the server stored it.
func (c *Client) PutPolicies(ctx context.Context, policies []gact.Policy) ([]gact.Policy, error) {
	body := map[string]any{"policies": policies}
	var out struct {
		Policies []gact.Policy `json:"policies"`
	}
	err := c.do(ctx, http.MethodPut, "/v1/policies", body, &out)
	return out.Policies, err
}

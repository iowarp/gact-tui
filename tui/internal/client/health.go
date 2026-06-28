package client

import (
	"context"
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Health calls GET /v1/health.
func (c *Client) Health(ctx context.Context) (gact.HealthResponse, error) {
	var out gact.HealthResponse
	err := c.do(ctx, http.MethodGet, "/v1/health", nil, &out)
	return out, err
}

// Capabilities calls GET /v1/capabilities.
func (c *Client) Capabilities(ctx context.Context) (gact.Capabilities, error) {
	var out gact.Capabilities
	err := c.do(ctx, http.MethodGet, "/v1/capabilities", nil, &out)
	return out, err
}

func (c *Client) CapabilityGaps(ctx context.Context) (map[string]gact.CapabilityGap, error) {
	var out struct {
		CapabilityGaps map[string]gact.CapabilityGap `json:"capability_gaps"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/capability-gaps", nil, &out)
	return out.CapabilityGaps, err
}

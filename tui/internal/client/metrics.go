package client

import (
	"context"
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *Client) Metrics(ctx context.Context) (gact.Metrics, error) {
	var out gact.Metrics
	err := c.do(ctx, http.MethodGet, "/v1/metrics", nil, &out)
	return out, err
}

package clio

// Placeholder — the CLIO REST client that speaks to clio-agent-api.
//
// TODO (CLIO-BBBBBBBBBB Phase 1):
//   - type Client struct { endpoint string; http *http.Client }
//   - func New(endpoint string) *Client
//   - func (c *Client) Query(ctx, QueryReq) (<-chan SSEvent, error)
//   - func (c *Client) Health(ctx) (HealthResp, error)
//   - func (c *Client) Experts(ctx) ([]Expert, error)
//   - func (c *Client) Metrics(ctx) (map[string]Metrics, error)
//
// Request + response shapes mirror CLIO's FastAPI schemas exactly.
// See docs/tui/06-endpoints.md on the clio-agent side for the
// authoritative shapes.

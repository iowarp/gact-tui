package conformance

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// minimalCaps holds just the flags we need for AAAA1 + BBBBB1 +
// TTTTT1 + UUUUU1 + BBBBBB1 + QQQQQQ1 gating, plus the v0.2 suites
// (CLIO-BBBBBBBBBB5).
type minimalCaps struct {
	Hooks          bool
	Permissions    bool
	SessionTasks   bool
	Mcp            bool
	Providers      bool
	Files          bool
	Diffs          bool
	SearchMessages bool

	// v0.2
	AgentRouting      bool
	Memory            bool
	StructuredErrors  bool
	IntegrationHealth bool
	ToolTelemetry     bool
}

func fetchCapabilities(c *conformClient) minimalCaps {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, body, err := c.get(ctx, "/v1/capabilities")
	if err != nil {
		return minimalCaps{}
	}
	var raw struct {
		Capabilities struct {
			Hooks          bool `json:"hooks"`
			Permissions    bool `json:"permissions"`
			SessionTasks   bool `json:"session_tasks"`
			Mcp            bool `json:"mcp"`
			Providers      bool `json:"providers"`
			Files          bool `json:"files"`
			Diffs          bool `json:"diffs"`
			SearchMessages bool `json:"search_messages"`

			// v0.2 — CLIO-BBBBBBBBBB5
			AgentRouting      bool `json:"agent_routing"`
			Memory            bool `json:"memory"`
			StructuredErrors  bool `json:"structured_errors"`
			IntegrationHealth bool `json:"integration_health"`
			ToolTelemetry     bool `json:"tool_telemetry"`
		} `json:"capabilities"`
	}
	_ = json.Unmarshal(body, &raw)
	return minimalCaps(raw.Capabilities)
}

// conformClient is a thin wrapper around http.Client that prefixes URLs
// and decodes JSON. Intentionally small — the whole point of this suite
// is to exercise the wire, not an SDK.
type conformClient struct {
	baseURL string
	http    *http.Client
}

func (c *conformClient) get(ctx context.Context, path string) (*http.Response, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	buf, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return resp, buf, err
}

func (c *conformClient) postJSON(ctx context.Context, path string, body any) (*http.Response, []byte, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(buf))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return resp, out, err
}

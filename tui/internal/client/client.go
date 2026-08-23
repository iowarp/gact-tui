// Package client is a typed HTTP + SSE client for a GACT v0.1 backend.
//
// Wire types come from the shared github.com/JaimeCernuda/gact-tui/contract/gact
// module. The TUI never depends on emulator implementation details — only
// on the wire types, which are normative per contract/SPEC.md.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// Client is a GACT v0.1 client.
type Client struct {
	baseURL    string
	httpClient *http.Client
	bearer     string
}

// New constructs a Client. baseURL is e.g. "http://localhost:7777".
// httpClient defaults to http.DefaultClient with a 30s timeout.
func New(baseURL string, opts ...Option) *Client {
	c := &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// Option configures a Client.
type Option func(*Client)

// WithHTTPClient overrides the underlying http.Client. Note that streaming
// methods (e.g. EventStream) need a client without a Timeout — pass one
// configured for long-lived connections.
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.httpClient = h } }

// WithBearerToken sets the Authorization header for every request.
func WithBearerToken(token string) Option { return func(c *Client) { c.bearer = token } }

// BaseURL returns the configured base URL.
func (c *Client) BaseURL() string { return c.baseURL }

// --- Low-level helpers -----------------------------------------------------

func (c *Client) req(ctx context.Context, method, path string, body any) (*http.Request, error) {
	var rd io.Reader
	if body != nil {
		buf := new(bytes.Buffer)
		if err := json.NewEncoder(buf).Encode(body); err != nil {
			return nil, fmt.Errorf("encode: %w", err)
		}
		rd = buf
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rd)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	return req, nil
}

// do executes a request and decodes the JSON response into out (if non-nil).
// On non-2xx, returns an *Error.
func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	req, err := c.req(ctx, method, path, body)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		var e gact.Error
		_ = json.Unmarshal(raw, &e)
		code := e.Error.Code
		if code == "" {
			code = e.Error.Error
		}
		if code == "" {
			// Some vendor routes (e.g. context/compact) reply with a FLAT
			// envelope `{"error": "nothing_to_compact"}` where `error` is a
			// bare string rather than the §14 object. Recover the reason code
			// from that shape so callers can switch on it.
			var flat struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(raw, &flat) == nil {
				code = flat.Error
			}
		}
		return &Error{
			Status:  resp.StatusCode,
			Code:    code,
			Message: e.Error.Message,
			Details: e.Error.Details,
		}
	}
	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return fmt.Errorf("decode: %w", err)
		}
	}
	return nil
}

// Error is a typed error returned from the server.
type Error struct {
	Status  int
	Code    string
	Message string
	Details map[string]any
}

func (e *Error) Error() string {
	return fmt.Sprintf("gact: %d %s: %s", e.Status, e.Code, e.Message)
}

// RuntimeScope carries the currently selected CLIO workspace/session into
// runtime catalogs. Empty fields are omitted so older backends keep working.
// Scope names the per-expert context lane (the `scope=<expert>` query on the
// vendor context/state + context/compact routes); empty means the
// session-default expert.
type RuntimeScope struct {
	WorkspaceID string
	SessionID   string
	Scope       string
}

func (s RuntimeScope) appendTo(q url.Values) {
	if s.WorkspaceID != "" {
		q.Set("workspace_id", s.WorkspaceID)
	}
	if s.SessionID != "" {
		q.Set("session_id", s.SessionID)
	}
}

func queryString(q url.Values) string {
	if len(q) == 0 {
		return ""
	}
	return "?" + q.Encode()
}

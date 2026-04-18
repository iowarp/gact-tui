// Package conformance is a runnable test harness that any
// GACT-compliant backend can use to verify it matches the v0.1
// contract. Point it at a live URL and it walks the major endpoints,
// asserting shape (not semantics — that's on the backend under test).
//
// Usage:
//
//	func TestMyBackendConformance(t *testing.T) {
//	    srv := startMyBackend(t)
//	    defer srv.Close()
//	    conformance.Run(t, srv.URL, conformance.Options{
//	        WorkspaceID: "ws_default",
//	    })
//	}
//
// Options let callers skip sections their backend doesn't implement
// (e.g. SkipPostMessage when only read-only endpoints are wired).
// Unskipped sections that return 501 count as a failure — silently
// tolerating 501 would defeat the purpose.
package conformance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// Options lets callers scope the suite to what their backend supports.
// Defaults (zero value): run every section, no workspace override.
type Options struct {
	// WorkspaceID is used for endpoints that require one (sessions
	// list, SSE scoped to a workspace, etc.). When empty, the suite
	// picks the first workspace from /v1/workspaces — good enough for
	// emulator-style backends that seed a default.
	WorkspaceID string

	// SessionID pins a specific session for per-session assertions.
	// When empty, the suite creates one if the backend allows.
	SessionID string

	// Skip* flags turn sections off for backends that only implement
	// a subset of the SPEC. A skipped section emits t.Log instead of
	// running its assertions.
	SkipHealth       bool
	SkipCapabilities bool
	SkipWorkspaces   bool
	SkipSessions     bool
	SkipCreateSession bool
	SkipPostMessage  bool
	SkipSSE          bool

	// HTTPTimeout bounds each RPC (not SSE). Default 10 s.
	HTTPTimeout time.Duration

	// SSEBudget bounds how long the SSE probe waits for its first
	// event. Default 3 s — enough for an emulator, may need bumping
	// for real-world backends that take longer to wake up.
	SSEBudget time.Duration
}

// Run executes the conformance suite. Each section uses t.Run so a
// failure in one doesn't mask failures elsewhere, and individual
// sections can be skipped via -run.
func Run(t *testing.T, baseURL string, opts Options) {
	t.Helper()
	if opts.HTTPTimeout == 0 {
		opts.HTTPTimeout = 10 * time.Second
	}
	if opts.SSEBudget == 0 {
		opts.SSEBudget = 3 * time.Second
	}
	baseURL = strings.TrimRight(baseURL, "/")
	c := &conformClient{baseURL: baseURL, http: &http.Client{Timeout: opts.HTTPTimeout}}

	if !opts.SkipHealth {
		t.Run("Health", func(t *testing.T) { checkHealth(t, c) })
	}
	if !opts.SkipCapabilities {
		t.Run("Capabilities", func(t *testing.T) { checkCapabilities(t, c) })
	}

	// Resolve workspace once so later sections can reuse it.
	wsID := opts.WorkspaceID
	if wsID == "" && !opts.SkipWorkspaces {
		var got string
		t.Run("Workspaces", func(t *testing.T) {
			got = checkWorkspaces(t, c)
		})
		wsID = got
	} else if !opts.SkipWorkspaces {
		t.Run("Workspaces", func(t *testing.T) { _ = checkWorkspaces(t, c) })
	}

	// Resolve or create session.
	sid := opts.SessionID
	if !opts.SkipSessions {
		t.Run("Sessions_List", func(t *testing.T) {
			checkSessionsList(t, c, wsID)
		})
	}
	if sid == "" && !opts.SkipCreateSession {
		t.Run("Sessions_Create", func(t *testing.T) {
			sid = checkCreateSession(t, c, wsID)
		})
	}

	if sid != "" && !opts.SkipPostMessage {
		t.Run("Messages_Post", func(t *testing.T) {
			checkPostMessage(t, c, sid, wsID)
		})
	}

	if sid != "" && !opts.SkipSSE {
		t.Run("SSE", func(t *testing.T) {
			checkSSE(t, c, sid, wsID, opts.SSEBudget)
		})
	}
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

// --- Section implementations ------------------------------------------------

func checkHealth(t *testing.T, c *conformClient) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/health")
	if err != nil {
		t.Fatalf("GET /v1/health: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("GET /v1/health: status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Healthy bool `json:"healthy"`
		UptimeS int  `json:"uptime_s"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("health JSON decode: %v (body=%s)", err, body)
	}
	if !got.Healthy {
		t.Errorf("healthy=false in %s", body)
	}
	// uptime_s can legitimately be 0 on a freshly-started backend; we
	// don't assert > 0, only that it decoded as an int.
	_ = got.UptimeS
}

func checkCapabilities(t *testing.T, c *conformClient) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/capabilities")
	if err != nil {
		t.Fatalf("GET /v1/capabilities: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		ContractVersion string `json:"contract_version"`
		Backend         struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"backend"`
		Capabilities map[string]any `json:"capabilities"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("capabilities JSON decode: %v (body=%s)", err, body)
	}
	if got.ContractVersion == "" {
		t.Errorf("contract_version missing from capabilities")
	}
	if got.Backend.Name == "" {
		t.Errorf("backend.name missing")
	}
	// We don't insist on particular capability flags — they're per
	// backend — just that the object is present and non-empty so
	// clients have something to key on.
	if len(got.Capabilities) == 0 {
		t.Errorf("capabilities map is empty")
	}
}

func checkWorkspaces(t *testing.T, c *conformClient) string {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/workspaces")
	if err != nil {
		t.Fatalf("GET /v1/workspaces: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("workspaces endpoint returned 501 — backend lists itself as supporting workspaces but this endpoint is unimplemented")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Workspaces []struct {
			ID        string         `json:"id"`
			Name      string         `json:"name"`
			RootPath  string         `json:"root_path"`
			CreatedAt time.Time      `json:"created_at"`
			Metadata  map[string]any `json:"metadata,omitempty"`
		} `json:"workspaces"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("workspaces JSON decode: %v (body=%s)", err, body)
	}
	// Empty list is legal (SPEC doesn't require seeding a workspace),
	// but if any workspaces exist they must have IDs.
	for i, w := range got.Workspaces {
		if w.ID == "" {
			t.Errorf("workspaces[%d].id is empty", i)
		}
	}
	if len(got.Workspaces) == 0 {
		return ""
	}
	return got.Workspaces[0].ID
}

func checkSessionsList(t *testing.T, c *conformClient, wsID string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	path := "/v1/sessions"
	if wsID != "" {
		path += "?workspace_id=" + wsID
	}
	resp, body, err := c.get(ctx, path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("sessions list returned 501")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Sessions []struct {
			ID          string `json:"id"`
			WorkspaceID string `json:"workspace_id"`
			Status      string `json:"status"`
		} `json:"sessions"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("sessions JSON decode: %v (body=%s)", err, body)
	}
	for i, s := range got.Sessions {
		if s.ID == "" {
			t.Errorf("sessions[%d].id empty", i)
		}
	}
}

func checkCreateSession(t *testing.T, c *conformClient, wsID string) string {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	req := map[string]any{
		"workspace_id": wsID,
		"title":        "conformance-" + time.Now().UTC().Format("150405"),
	}
	resp, body, err := c.postJSON(ctx, "/v1/sessions", req)
	if err != nil {
		t.Fatalf("POST /v1/sessions: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("POST /v1/sessions returned 501")
	}
	if resp.StatusCode/100 != 2 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("created-session JSON decode: %v (body=%s)", err, body)
	}
	if got.ID == "" {
		t.Fatalf("created session has empty id: %s", body)
	}
	return got.ID
}

func checkPostMessage(t *testing.T, c *conformClient, sid, wsID string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	path := fmt.Sprintf("/v1/sessions/%s/messages", sid)
	if wsID != "" {
		// Adapters route messages per workspace; emulator ignores this
		// param. Sending it always keeps the suite portable.
		path += "?workspace_id=" + wsID
	}
	req := map[string]any{
		"parts": []map[string]any{
			{"type": "text", "text": "hello from the conformance suite"},
		},
	}
	resp, body, err := c.postJSON(ctx, path, req)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("POST messages returned 501")
	}
	// Accept 200 OR 202 — SPEC says "202 accepted" but some adapters
	// (OpenCode) return a synchronous 200 with the completed message.
	if resp.StatusCode != 200 && resp.StatusCode != 202 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		MessageID  string `json:"message_id"`
		AcceptedAt string `json:"accepted_at"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("post-message JSON decode: %v (body=%s)", err, body)
	}
	if got.MessageID == "" {
		t.Errorf("message_id missing from POST response: %s", body)
	}
}

func checkSSE(t *testing.T, c *conformClient, sid, wsID string, budget time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	path := fmt.Sprintf("/v1/sessions/%s/events", sid)
	if wsID != "" {
		path += "?workspace_id=" + wsID
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	// Use a fresh client so we aren't bounded by the RPC timeout.
	streamClient := &http.Client{Timeout: 0}
	resp, err := streamClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("SSE endpoint returned 501")
	}
	if resp.StatusCode != 200 {
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		t.Fatalf("status %d body %s", resp.StatusCode, buf)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("Content-Type = %q, want text/event-stream", ct)
	}

	// Look for at least one `data:` line within the budget. That's
	// enough to prove the stream is live — full event taxonomy is a
	// per-backend concern.
	deadline := time.Now().Add(budget)
	buf := make([]byte, 4096)
	var seen bytes.Buffer
	for time.Now().Before(deadline) {
		if rd, ok := resp.Body.(interface{ SetReadDeadline(time.Time) error }); ok {
			_ = rd.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		}
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			seen.Write(buf[:n])
			if bytes.Contains(seen.Bytes(), []byte("\ndata: ")) ||
				bytes.HasPrefix(seen.Bytes(), []byte("data: ")) {
				return
			}
		}
		if rerr != nil && rerr != io.EOF {
			// Likely the read deadline — keep polling until the
			// budget deadline is reached.
			continue
		}
		if rerr == io.EOF {
			break
		}
	}
	t.Fatalf("no SSE data frame within %s; saw=%q", budget, seen.String())
}

// Package conformance is a runnable test harness that any
// GACT-compliant backend can use to verify it matches the v0.1
// contract. Point it at a live URL and it walks the major endpoints,
// asserting shape (not semantics — that's on the backend under test).
//
// Usage:
//
//	func TestMyBackendConformance(t Reporter) {
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
	SkipHealth        bool
	SkipCapabilities  bool
	SkipWorkspaces    bool
	SkipSessions      bool
	SkipCreateSession bool
	SkipPostMessage   bool
	SkipSSE           bool
	SkipCommands      bool
	SkipTools         bool
	SkipMetrics       bool
	// AAAA1: optional MMM-endpoint coverage. Each gated by the
	// matching capability flag — backends that don't claim it get
	// auto-skipped, so adapters that wire only a subset don't fail
	// here. Setting Skip* explicitly always skips even if the cap
	// is true.
	SkipHooks    bool
	SkipPolicies bool
	SkipTasks    bool
	// BBBBB1: MCP servers section — gated on capabilities.mcp. Adds
	// shape coverage for GET /v1/mcp/servers since the TUI's catalog
	// browser depends on it. Backends that don't claim mcp=true skip
	// automatically.
	SkipMcp bool
	// TTTTT1: Models/Providers section — gated on capabilities.providers.
	// Walks GET /v1/providers + GET /v1/providers/{id}/models so the
	// model picker (Settings tab + `gact models list`) catches drift
	// at the wire level before users hit it.
	SkipProviders bool
	// UUUUU1: Files section — gated on capabilities.files. Walks
	// GET /v1/workspaces/{id}/files (the workspace tree). Locks the
	// shape that powers `gact files list`, the @-file picker (M6),
	// and `gact repo-map`. Read-only: doesn't touch the file body
	// endpoint to avoid coupling to the test fixture's file content.
	SkipFiles bool

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
func Run(t Reporter, baseURL string, opts Options) {
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
		t.Run("Health", func(t Reporter) { checkHealth(t, c) })
	}
	if !opts.SkipCapabilities {
		t.Run("Capabilities", func(t Reporter) { checkCapabilities(t, c) })
	}

	// Resolve workspace once so later sections can reuse it.
	wsID := opts.WorkspaceID
	if wsID == "" && !opts.SkipWorkspaces {
		var got string
		t.Run("Workspaces", func(t Reporter) {
			got = checkWorkspaces(t, c)
		})
		wsID = got
	} else if !opts.SkipWorkspaces {
		t.Run("Workspaces", func(t Reporter) { _ = checkWorkspaces(t, c) })
	}

	// Resolve or create session.
	sid := opts.SessionID
	if !opts.SkipSessions {
		t.Run("Sessions_List", func(t Reporter) {
			checkSessionsList(t, c, wsID)
		})
	}
	if sid == "" && !opts.SkipCreateSession {
		t.Run("Sessions_Create", func(t Reporter) {
			sid = checkCreateSession(t, c, wsID)
		})
	}

	if sid != "" && !opts.SkipPostMessage {
		t.Run("Messages_Post", func(t Reporter) {
			checkPostMessage(t, c, sid, wsID)
		})
	}

	if sid != "" && !opts.SkipSSE {
		t.Run("SSE", func(t Reporter) {
			checkSSE(t, c, sid, wsID, opts.SSEBudget)
		})
	}

	if !opts.SkipCommands {
		t.Run("Commands_List", func(t Reporter) { checkCommands(t, c) })
	}
	if !opts.SkipTools {
		t.Run("Tools_List", func(t Reporter) { checkTools(t, c) })
	}
	if !opts.SkipMetrics {
		t.Run("Metrics", func(t Reporter) { checkMetrics(t, c) })
	}
	// AAAA1: MMM endpoints, gated by capability flag. We need the
	// caps to know which to run; reuse the Capabilities check's
	// fetch by re-calling it here (cheap GET).
	if !opts.SkipHooks || !opts.SkipPolicies || !opts.SkipTasks || !opts.SkipMcp || !opts.SkipProviders || !opts.SkipFiles {
		caps := fetchCapabilities(c)
		if !opts.SkipHooks && caps.Hooks {
			t.Run("Hooks", func(t Reporter) { checkHooks(t, c) })
		}
		if !opts.SkipPolicies {
			// Policies has no capability flag in Capabilities —
			// permissions itself does. Run when permissions=true.
			if caps.Permissions {
				t.Run("Policies", func(t Reporter) { checkPolicies(t, c) })
			}
		}
		if !opts.SkipTasks && caps.SessionTasks {
			if sid != "" {
				t.Run("Tasks", func(t Reporter) { checkTasks(t, c, sid) })
			}
		}
		if !opts.SkipMcp && caps.Mcp {
			t.Run("Mcp", func(t Reporter) { checkMcp(t, c) })
		}
		if !opts.SkipProviders && caps.Providers {
			t.Run("Providers", func(t Reporter) { checkProviders(t, c) })
		}
		if !opts.SkipFiles && caps.Files && wsID != "" {
			t.Run("Files", func(t Reporter) { checkFiles(t, c, wsID) })
		}
	}
}

// minimalCaps holds just the flags we need for AAAA1 + BBBBB1 +
// TTTTT1 gating.
type minimalCaps struct {
	Hooks        bool
	Permissions  bool
	SessionTasks bool
	Mcp          bool
	Providers    bool
	Files        bool
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
			Hooks        bool `json:"hooks"`
			Permissions  bool `json:"permissions"`
			SessionTasks bool `json:"session_tasks"`
			Mcp          bool `json:"mcp"`
			Providers    bool `json:"providers"`
			Files        bool `json:"files"`
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

// --- Section implementations ------------------------------------------------

func checkHealth(t Reporter, c *conformClient) {
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

func checkCapabilities(t Reporter, c *conformClient) {
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

func checkWorkspaces(t Reporter, c *conformClient) string {
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

func checkSessionsList(t Reporter, c *conformClient, wsID string) {
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

func checkCreateSession(t Reporter, c *conformClient, wsID string) string {
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

func checkPostMessage(t Reporter, c *conformClient, sid, wsID string) {
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

func checkSSE(t Reporter, c *conformClient, sid, wsID string, budget time.Duration) {
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

// checkCommands asserts GET /v1/commands returns 200 with a
// {"commands": [...]} shape where each entry has an `id`. We don't
// insist on specific built-ins — backends vary — only that the
// envelope and per-item shape match SPEC §6.13.
func checkCommands(t Reporter, c *conformClient) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/commands")
	if err != nil {
		t.Fatalf("GET /v1/commands: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("commands endpoint returned 501 — set SkipCommands if backend doesn't implement it")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Commands []struct {
			ID     string `json:"id"`
			Title  string `json:"title"`
			Source string `json:"source"`
		} `json:"commands"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("commands JSON decode: %v (body=%s)", err, body)
	}
	for i, cmd := range got.Commands {
		if cmd.ID == "" {
			t.Errorf("commands[%d].id empty", i)
		}
	}
}

// checkTools asserts GET /v1/tools returns 200 with a
// {"tools": [...]} shape where each entry has a `name`. Same
// forgiving approach as Commands — we verify the shape, not the
// specific tools in scope.
func checkTools(t Reporter, c *conformClient) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/tools")
	if err != nil {
		t.Fatalf("GET /v1/tools: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("tools endpoint returned 501 — set SkipTools if backend doesn't implement it")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Tools []struct {
			Name string `json:"name"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("tools JSON decode: %v (body=%s)", err, body)
	}
	for i, tl := range got.Tools {
		if tl.Name == "" {
			t.Errorf("tools[%d].name empty", i)
		}
	}
}

// checkMetrics asserts GET /v1/metrics returns 200 and the top-level
// { uptime_s, sessions, messages, tokens } envelope described in
// SPEC §6.16. Specific nested field values aren't asserted since
// they're operational and change per request.
func checkMetrics(t Reporter, c *conformClient) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/metrics")
	if err != nil {
		t.Fatalf("GET /v1/metrics: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("metrics endpoint returned 501 — set SkipMetrics if backend doesn't implement it")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("metrics JSON decode: %v (body=%s)", err, body)
	}
	// uptime_s is the one field every backend must emit per SPEC.
	if _, ok := got["uptime_s"]; !ok {
		t.Errorf("metrics response missing uptime_s field: %s", body)
	}
}

// AAAA1 — checks for §6.17 hooks, §6.11 policies, §6.18 tasks. Each
// runs a minimal write+read cycle against the live backend.

func checkHooks(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// GET should return {hooks: []}.
	resp, body, err := c.get(ctx, "/v1/hooks")
	if err != nil {
		t.Fatalf("GET /v1/hooks: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var listResp struct {
		Hooks []map[string]any `json:"hooks"`
	}
	if err := json.Unmarshal(body, &listResp); err != nil {
		t.Fatalf("hooks list decode: %v (body=%s)", err, body)
	}

	// POST a hook, expect 201 + {id}.
	hookBody := map[string]any{
		"event":   "notification",
		"command": "/bin/true",
	}
	postResp, postBody, err := c.postJSON(ctx, "/v1/hooks", hookBody)
	if err != nil {
		t.Fatalf("POST /v1/hooks: %v", err)
	}
	if postResp.StatusCode != 200 && postResp.StatusCode != 201 {
		t.Fatalf("create hook status %d body %s", postResp.StatusCode, postBody)
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(postBody, &created)
	if created.ID == "" {
		t.Fatalf("created hook missing id: %s", postBody)
	}

	// DELETE the hook, expect 204.
	delReq, _ := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.baseURL+"/v1/hooks/"+created.ID, nil)
	delResp, err := c.http.Do(delReq)
	if err != nil {
		t.Fatalf("DELETE /v1/hooks/%s: %v", created.ID, err)
	}
	delResp.Body.Close()
	if delResp.StatusCode != 204 {
		t.Errorf("delete hook expected 204, got %d", delResp.StatusCode)
	}
}

func checkPolicies(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/policies")
	if err != nil {
		t.Fatalf("GET /v1/policies: %v", err)
	}
	if resp.StatusCode == 404 || resp.StatusCode == 501 {
		// Backends that don't implement the policy CRUD return 404 or
		// 501 — the spec calls policies optional. Tolerate.
		return
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}

	// PUT a single allow-shell rule, then GET to verify round-trip.
	put := map[string]any{
		"policies": []map[string]any{
			{"scope": "workspace", "tool_name_pattern": "shell", "action": "allow"},
		},
	}
	putReq, _ := http.NewRequest(http.MethodPut, c.baseURL+"/v1/policies", bytes.NewReader(mustJSON(put)))
	putReq.Header.Set("Content-Type", "application/json")
	putReq = putReq.WithContext(ctx)
	putResp, err := c.http.Do(putReq)
	if err != nil {
		t.Fatalf("PUT /v1/policies: %v", err)
	}
	putBody, _ := io.ReadAll(putResp.Body)
	putResp.Body.Close()
	if putResp.StatusCode != 200 {
		t.Fatalf("put policies status %d body %s", putResp.StatusCode, putBody)
	}
	if !strings.Contains(string(putBody), `"shell"`) {
		t.Errorf("PUT echo missing shell rule: %s", putBody)
	}

	// Cleanup — empty list.
	emptyReq, _ := http.NewRequest(http.MethodPut, c.baseURL+"/v1/policies",
		bytes.NewReader(mustJSON(map[string]any{"policies": []any{}})))
	emptyReq.Header.Set("Content-Type", "application/json")
	emptyReq = emptyReq.WithContext(ctx)
	if r, err := c.http.Do(emptyReq); err == nil {
		r.Body.Close()
	}
}

func checkTasks(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// POST a task.
	postResp, postBody, err := c.postJSON(ctx,
		"/v1/sessions/"+sid+"/tasks", map[string]any{"title": "conformance probe"})
	if err != nil {
		t.Fatalf("POST tasks: %v", err)
	}
	if postResp.StatusCode != 200 && postResp.StatusCode != 201 {
		t.Fatalf("create task status %d body %s", postResp.StatusCode, postBody)
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(postBody, &created)
	if created.ID == "" {
		t.Fatalf("created task missing id: %s", postBody)
	}

	// GET — must list at least the one we created.
	getResp, getBody, err := c.get(ctx, "/v1/sessions/"+sid+"/tasks")
	if err != nil {
		t.Fatalf("GET tasks: %v", err)
	}
	if getResp.StatusCode != 200 {
		t.Fatalf("list tasks status %d body %s", getResp.StatusCode, getBody)
	}
	if !strings.Contains(string(getBody), created.ID) {
		t.Errorf("list missing created task %s: %s", created.ID, getBody)
	}

	// DELETE.
	delReq, _ := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.baseURL+"/v1/tasks/"+created.ID, nil)
	delResp, err := c.http.Do(delReq)
	if err != nil {
		t.Fatalf("DELETE task: %v", err)
	}
	delResp.Body.Close()
	if delResp.StatusCode != 204 {
		t.Errorf("delete task expected 204, got %d", delResp.StatusCode)
	}
}

// mustJSON panics on marshal error — only used for static literals
// inside check functions where panic == suite bug.
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// BBBBB1 — checkMcp validates GET /v1/mcp/servers shape: status 200,
// JSON object with a `servers` array, and each entry has the required
// fields (id, name, transport, status). The TUI's catalog browser +
// `gact mcp list` (JJJJ1) both depend on this shape, so locking it in
// at the conformance layer prevents drift in adapters.
func checkMcp(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/mcp/servers")
	if err != nil {
		t.Fatalf("GET /v1/mcp/servers: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/mcp/servers returned 501 — set SkipMcp or fix capabilities.mcp")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Servers []map[string]any `json:"servers"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("mcp/servers JSON decode: %v (body=%s)", err, body)
	}
	if raw.Servers == nil {
		// Empty list is fine; nil means the response had no `servers`
		// key at all, which violates the spec.
		t.Errorf("response missing `servers` key: %s", body)
		return
	}
	for i, srv := range raw.Servers {
		for _, key := range []string{"id", "name", "transport", "status"} {
			if _, ok := srv[key]; !ok {
				t.Errorf("server[%d] missing required key %q: %v", i, key, srv)
			}
		}
		// status must be one of the allowed enum values.
		if status, _ := srv["status"].(string); status != "" {
			switch status {
			case "connecting", "ready", "error", "disconnected":
			default:
				t.Errorf("server[%d] unexpected status %q (want connecting|ready|error|disconnected)", i, status)
			}
		}
	}
}

// TTTTT1 — checkProviders validates GET /v1/providers + per-provider
// GET /v1/providers/{id}/models. Status 200 + a non-nil `providers`
// key on the list endpoint; for each provider, status 200 + a non-nil
// `models` key on the nested endpoint and each model entry has the
// required {id, name} fields. Locks the wire shape that powers the
// Settings → Model tab and `gact models list` (CLI). Adapters that
// don't proxy /v1/providers can SkipProviders explicitly.
func checkProviders(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/providers")
	if err != nil {
		t.Fatalf("GET /v1/providers: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/providers returned 501 — set SkipProviders or fix capabilities.providers")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Providers []map[string]any `json:"providers"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("providers JSON decode: %v (body=%s)", err, body)
	}
	if raw.Providers == nil {
		t.Errorf("response missing `providers` key: %s", body)
		return
	}
	for i, p := range raw.Providers {
		for _, key := range []string{"id", "name"} {
			if _, ok := p[key]; !ok {
				t.Errorf("provider[%d] missing required key %q: %v", i, key, p)
			}
		}
		pid, _ := p["id"].(string)
		if pid == "" {
			continue
		}
		// Per-provider models endpoint.
		mresp, mbody, err := c.get(ctx, "/v1/providers/"+pid+"/models")
		if err != nil {
			t.Errorf("GET /v1/providers/%s/models: %v", pid, err)
			continue
		}
		if mresp.StatusCode != 200 {
			t.Errorf("provider[%s] models status %d body %s", pid, mresp.StatusCode, mbody)
			continue
		}
		var mraw struct {
			Models []map[string]any `json:"models"`
		}
		if err := json.Unmarshal(mbody, &mraw); err != nil {
			t.Errorf("provider[%s] models decode: %v (body=%s)", pid, err, mbody)
			continue
		}
		if mraw.Models == nil {
			t.Errorf("provider[%s] response missing `models` key: %s", pid, mbody)
			continue
		}
		for j, m := range mraw.Models {
			for _, key := range []string{"id", "name"} {
				if _, ok := m[key]; !ok {
					t.Errorf("provider[%s] model[%d] missing required key %q: %v", pid, j, key, m)
				}
			}
		}
	}
}

// UUUUU1 — checkFiles validates GET /v1/workspaces/{id}/files. Asserts
// 200, top-level `entries` array, and each entry carries the required
// {path, type} with type in the file|dir enum. Locks the wire shape
// that powers the @-file picker (M6), `gact files list`, and
// `gact repo-map`'s tree view. Read-only; doesn't fetch file bodies
// to avoid coupling to fixture content.
func checkFiles(t Reporter, c *conformClient, wsID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/workspaces/"+wsID+"/files")
	if err != nil {
		t.Fatalf("GET /v1/workspaces/%s/files: %v", wsID, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/workspaces/{id}/files returned 501 — set SkipFiles or fix capabilities.files")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Entries []map[string]any `json:"entries"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("files JSON decode: %v (body=%s)", err, body)
	}
	if raw.Entries == nil {
		t.Errorf("response missing `entries` key: %s", body)
		return
	}
	for i, e := range raw.Entries {
		for _, key := range []string{"path", "type"} {
			if _, ok := e[key]; !ok {
				t.Errorf("entry[%d] missing required key %q: %v", i, key, e)
			}
		}
		if typ, _ := e["type"].(string); typ != "" {
			switch typ {
			case "file", "dir":
			default:
				t.Errorf("entry[%d] unexpected type %q (want file|dir)", i, typ)
			}
		}
	}
}

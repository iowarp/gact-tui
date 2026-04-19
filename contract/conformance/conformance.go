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
	// IIIIII1: Messages list/get section — gated on a non-empty
	// session id. Walks GET /v1/sessions/{id}/messages and drills
	// into GET /v1/sessions/{id}/messages/{msg_id} for the first
	// entry. Locks the wire shape that powers `gact log` and the
	// conversation pane's history fetch.
	SkipMessageList bool
	// RRRRRR1: Sessions_Export — SPEC §6.2 GET
	// /v1/sessions/{id}/export. Asserts 200 + JSON content-type +
	// decodable body. Read-only.
	SkipSessionExport bool
	SkipSSE           bool
	SkipCommands      bool
	SkipTools         bool
	SkipMetrics       bool
	// DDDDDD1: Agents section — no capability flag in SPEC (read is
	// always available per §6.5). Walks GET /v1/agents and locks the
	// AgentDef shape that powers the Settings → Agent picker. Skip
	// for backends that surface a totally different agent model.
	SkipAgents bool
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
	// BBBBBB1: Diffs section — gated on capabilities.diffs. Walks
	// GET /v1/sessions/{id}/diffs (the pending file_diff list).
	// Locks the shape that powers `gact diff` + the conversation
	// pane's a/r apply/reject keys. Read-only: doesn't apply or
	// reject anything (idempotent against the live session).
	SkipDiffs bool
	// CCCCCC1: per-message diffs section — gated on
	// capabilities.diffs + at least one message in the session.
	// Walks GET /v1/sessions/{id}/messages → first message id →
	// GET /v1/sessions/{id}/messages/{mid}/diffs. Locks the wire
	// shape that powers per-turn diff drill-down (Ctrl+E from a
	// tool_result row). Read-only.
	SkipMessageDiffs bool
	// QQQQQQ1: messages search — gated on
	// capabilities.search_messages + sid. Walks GET
	// /v1/sessions/{id}/messages/search?q=hello. Locks the wire
	// shape SPEC §6.3 promises so the @-search palette and `gact
	// search` don't drift at the wire level.
	SkipMessageSearch bool

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

	if sid != "" && !opts.SkipSessions {
		t.Run("Sessions_Get", func(t Reporter) {
			checkSessionGet(t, c, sid)
		})
	}

	if sid != "" && !opts.SkipPostMessage {
		t.Run("Messages_Post", func(t Reporter) {
			checkPostMessage(t, c, sid, wsID)
		})
	}

	if sid != "" && !opts.SkipMessageList {
		t.Run("Messages_List", func(t Reporter) {
			checkMessagesList(t, c, sid)
		})
	}

	if sid != "" && !opts.SkipSessionExport {
		t.Run("Sessions_Export", func(t Reporter) {
			checkSessionExport(t, c, sid)
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
	if !opts.SkipAgents {
		t.Run("Agents", func(t Reporter) { checkAgents(t, c) })
	}
	// AAAA1: MMM endpoints, gated by capability flag. We need the
	// caps to know which to run; reuse the Capabilities check's
	// fetch by re-calling it here (cheap GET).
	if !opts.SkipHooks || !opts.SkipPolicies || !opts.SkipTasks || !opts.SkipMcp || !opts.SkipProviders || !opts.SkipFiles || !opts.SkipDiffs || !opts.SkipMessageDiffs || !opts.SkipMessageSearch {
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
		if !opts.SkipDiffs && caps.Diffs && sid != "" {
			t.Run("Diffs", func(t Reporter) { checkDiffs(t, c, sid) })
		}
		if !opts.SkipMessageDiffs && caps.Diffs && sid != "" {
			t.Run("Messages_Diffs", func(t Reporter) { checkMessageDiffs(t, c, sid) })
		}
		if !opts.SkipMessageSearch && caps.SearchMessages && sid != "" {
			t.Run("Messages_Search", func(t Reporter) { checkMessagesSearch(t, c, sid) })
		}
	}
}

// minimalCaps holds just the flags we need for AAAA1 + BBBBB1 +
// TTTTT1 + UUUUU1 + BBBBBB1 + QQQQQQ1 gating.
type minimalCaps struct {
	Hooks          bool
	Permissions    bool
	SessionTasks   bool
	Mcp            bool
	Providers      bool
	Files          bool
	Diffs          bool
	SearchMessages bool
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
	} else if !strings.HasPrefix(got.ContractVersion, "0.") && !strings.HasPrefix(got.ContractVersion, "1.") {
		// SSSSSS1: contract_version must look like a real version
		// (semver-ish, currently 0.x or 1.x). Catches accidents like
		// `"contract_version": "GACT"` or empty-string-after-trim.
		t.Errorf("contract_version %q does not look like a version (want 0.x or 1.x)", got.ContractVersion)
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
	// SSSSSS1: every capability value must be a JSON bool. Adapter
	// authors that emit `"hooks": "yes"` or `"files": null` would
	// silently downgrade to false in the cap-gating logic; this
	// catches it at the wire. Forward-compat carve-out: vendor-prefixed
	// keys (`x_<vendor>_<flag>`) may be any JSON value.
	for k, v := range got.Capabilities {
		if strings.HasPrefix(k, "x_") {
			continue
		}
		if _, ok := v.(bool); !ok {
			t.Errorf("capability %q must be a JSON bool, got %T (%v)", k, v, v)
		}
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
	first := got.Workspaces[0].ID

	// GGGGGG1: per-id drill-down. SPEC §6.1 promises GET
	// /v1/workspaces/{id} returns a single Workspace. Adapter
	// authors that wired only the list endpoint get a silent gap;
	// this catches it. Per-id response must echo the same id and
	// have a non-empty root_path (a workspace without one is not a
	// workspace).
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, derr := c.get(dctx, "/v1/workspaces/"+first)
	if derr != nil {
		t.Errorf("GET /v1/workspaces/%s: %v", first, derr)
		return first
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/workspaces/{id} returned 501 — per-id drill-down required by SPEC §6.1")
		return first
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/workspaces/%s status %d body %s", first, dResp.StatusCode, dBody)
		return first
	}
	var detail struct {
		ID       string `json:"id"`
		RootPath string `json:"root_path"`
	}
	if err := json.Unmarshal(dBody, &detail); err != nil {
		t.Errorf("workspace/%s JSON decode: %v (body=%s)", first, err, dBody)
		return first
	}
	if detail.ID != first {
		t.Errorf("/v1/workspaces/%s returned id=%q (want %q)", first, detail.ID, first)
	}
	if detail.RootPath == "" {
		t.Errorf("/v1/workspaces/%s missing root_path: %s", first, dBody)
	}
	return first
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

// HHHHHH1 — checkSessionGet validates GET /v1/sessions/{id} (SPEC
// §6.2). Asserts 200 + id echoed back + non-empty status (sessions
// always carry a lifecycle state per the Session schema). Skips
// when no sid is available — the caller already gates on that.
// Read-only.
func checkSessionGet(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid)
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id} returned 501 — per-id drill-down required by SPEC §6.2")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("session/%s JSON decode: %v (body=%s)", sid, err, body)
	}
	if got.ID != sid {
		t.Errorf("/v1/sessions/%s returned id=%q (want %q)", sid, got.ID, sid)
	}
	if got.Status == "" {
		t.Errorf("/v1/sessions/%s missing status: %s", sid, body)
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

// IIIIII1 — checkMessagesList validates GET /v1/sessions/{id}/messages
// (SPEC §6.3) plus the per-id drill into GET /v1/sessions/{id}/
// messages/{msg_id}. Asserts 200 + non-nil top-level `messages`
// array (empty is fine; missing key violates spec) + per-entry
// required {id, role, parts} with `role` in the documented enum
// (user|assistant|system|tool). For the first message, drills into
// the per-id endpoint and verifies the id is echoed back. Locks
// the wire shape that powers `gact log` and the conversation
// pane's history fetch. Read-only.
func checkMessagesList(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/messages")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("messages list returned 501 — set SkipMessageList")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("messages JSON decode: %v (body=%s)", err, body)
	}
	if raw.Messages == nil {
		t.Errorf("response missing `messages` key: %s", body)
		return
	}
	var firstID string
	for i, m := range raw.Messages {
		for _, key := range []string{"id", "role", "parts"} {
			if _, ok := m[key]; !ok {
				t.Errorf("message[%d] missing required key %q: %v", i, key, m)
			}
		}
		if id, _ := m["id"].(string); id == "" {
			t.Errorf("message[%d] has empty id: %v", i, m)
		} else if firstID == "" {
			firstID = id
		}
		if role, _ := m["role"].(string); role != "" {
			switch role {
			case "user", "assistant", "system", "tool":
			default:
				t.Errorf("message[%d] unexpected role %q (want user|assistant|system|tool)", i, role)
			}
		}
	}
	if firstID == "" {
		return
	}
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/sessions/"+sid+"/messages/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/sessions/%s/messages/%s: %v", sid, firstID, err)
		return
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/sessions/{id}/messages/{msg_id} returned 501 — per-id drill-down required by SPEC §6.3")
		return
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/sessions/%s/messages/%s status %d body %s", sid, firstID, dResp.StatusCode, dBody)
		return
	}
	var detail struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(dBody, &detail); err != nil {
		t.Errorf("message/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		return
	}
	if detail.ID != firstID {
		t.Errorf("/v1/sessions/%s/messages/%s returned id=%q (want %q)", sid, firstID, detail.ID, firstID)
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

	// NNNNNN1: read until we see a complete event (terminated by a
	// blank line). Then validate the envelope per SPEC §7.2:
	//   1. `event:` line is present
	//   2. `data:` line parses as JSON with a `type` field
	//   3. `data.type` matches the `event:` value
	// Specific event types and payload shapes are per-backend; we
	// only enforce the envelope shape.
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
			// A complete event ends with "\n\n". Take the first such
			// block and parse it.
			raw := seen.Bytes()
			if idx := bytes.Index(raw, []byte("\n\n")); idx >= 0 {
				validateSSEEvent(t, string(raw[:idx]), seen.String())
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
	t.Fatalf("no complete SSE event (terminated by \\n\\n) within %s; saw=%q", budget, seen.String())
}

// validateSSEEvent parses an SSE event block (no trailing \n\n) and
// asserts §7.2 envelope rules: event: line present, data: line parses
// as JSON with a `type` field, and data.type matches the event: value.
// Caller passes the full buffer for diagnostics.
func validateSSEEvent(t Reporter, block, fullBuf string) {
	t.Helper()
	var eventName, dataLine string
	for _, line := range strings.Split(block, "\n") {
		switch {
		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			dataLine = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}
	if eventName == "" {
		t.Errorf("SSE event missing `event:` line per SPEC §7.2: %q", block)
	}
	if dataLine == "" {
		t.Errorf("SSE event missing `data:` line per SPEC §7.2: %q", block)
		return
	}
	var payload struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(dataLine), &payload); err != nil {
		t.Errorf("SSE data: line not valid JSON: %v (data=%q full=%q)", err, dataLine, fullBuf)
		return
	}
	if payload.Type == "" {
		t.Errorf("SSE data.type missing per SPEC §7.2: %q", dataLine)
		return
	}
	if eventName != "" && payload.Type != eventName {
		t.Errorf("SSE event line (%q) does not match data.type (%q) per SPEC §7.2", eventName, payload.Type)
	}
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
// {"tools": [...]} shape where each entry carries the required
// {id, name} pair (SPEC §6.6 + §4.6). Same forgiving approach as
// Commands — we verify the shape, not the specific tools in scope.
//
// EEEEEE1: also drills into GET /v1/tools/{id} for the first tool
// in the list (when present) so adapter authors catch a missing
// per-id endpoint at conformance time. Per-id response must echo
// the same `id` back.
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
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("tools JSON decode: %v (body=%s)", err, body)
	}
	var firstID string
	for i, tl := range got.Tools {
		if tl.ID == "" {
			t.Errorf("tools[%d].id empty", i)
		}
		if tl.Name == "" {
			t.Errorf("tools[%d].name empty", i)
		}
		if firstID == "" && tl.ID != "" {
			firstID = tl.ID
		}
	}
	if firstID == "" {
		return
	}
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/tools/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/tools/%s: %v", firstID, err)
		return
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/tools/{id} returned 501 — per-id drill-down required by SPEC §6.6")
		return
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/tools/%s status %d body %s", firstID, dResp.StatusCode, dBody)
		return
	}
	var detail struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(dBody, &detail); err != nil {
		t.Errorf("tool/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		return
	}
	if detail.ID != firstID {
		t.Errorf("/v1/tools/%s returned id=%q (want %q)", firstID, detail.ID, firstID)
	}
	if detail.Name == "" {
		t.Errorf("/v1/tools/%s missing name: %s", firstID, dBody)
	}
}

// checkMetrics asserts GET /v1/metrics returns 200 and the top-level
// { uptime_s, sessions, messages, tokens } envelope described in
// SPEC §6.16. Specific nested field values aren't asserted since
// they're operational and change per request, but the structural
// presence of each top-level key is enforced (MMMMMM1) so adapter
// authors that only emit `uptime_s` get caught at the conformance
// layer instead of at runtime when the metrics tab tries to read
// `sessions.total` and crashes.
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
	// MMMMMM1: also require the {sessions, messages, tokens} top-level
	// objects per SPEC §6.16. Each must be a JSON object (not just
	// present-as-null) and each must carry the documented `total`
	// counter so the metrics tab can render row totals without a nil
	// dereference. Specific values aren't asserted (operational).
	for _, key := range []string{"sessions", "messages", "tokens"} {
		raw, ok := got[key]
		if !ok {
			t.Errorf("metrics response missing %q top-level object per SPEC §6.16: %s", key, body)
			continue
		}
		obj, ok := raw.(map[string]any)
		if !ok {
			t.Errorf("metrics %q must be an object, got %T (%v)", key, raw, raw)
			continue
		}
		// `tokens` uses input_total/output_total instead of `total`;
		// `sessions` and `messages` use `total`. Validate accordingly.
		if key == "tokens" {
			if _, ok := obj["input_total"]; !ok {
				t.Errorf("metrics tokens missing input_total: %v", obj)
			}
			if _, ok := obj["output_total"]; !ok {
				t.Errorf("metrics tokens missing output_total: %v", obj)
			}
		} else {
			if _, ok := obj["total"]; !ok {
				t.Errorf("metrics %s missing total: %v", key, obj)
			}
		}
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
	var firstID string
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
		if firstID == "" {
			if id, _ := srv["id"].(string); id != "" {
				firstID = id
			}
		}
	}
	if firstID == "" {
		return
	}
	// JJJJJJ1: per-server drill-down. SPEC §6.7 promises GET
	// /v1/mcp/servers/{id} returns a single McpServer and
	// /v1/mcp/servers/{id}/tools returns {tools: Tool[]}. Catches
	// adapters that wired only the list endpoint.
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/mcp/servers/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/mcp/servers/%s: %v", firstID, err)
	} else if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id} returned 501 — per-id drill-down required by SPEC §6.7")
	} else if dResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s status %d body %s", firstID, dResp.StatusCode, dBody)
	} else {
		var detail struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(dBody, &detail); err != nil {
			t.Errorf("mcp/server/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		} else if detail.ID != firstID {
			t.Errorf("/v1/mcp/servers/%s returned id=%q (want %q)", firstID, detail.ID, firstID)
		}
	}
	// /v1/mcp/servers/{id}/tools — same pattern.
	tctx, tcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer tcancel()
	tResp, tBody, err := c.get(tctx, "/v1/mcp/servers/"+firstID+"/tools")
	if err != nil {
		t.Errorf("GET /v1/mcp/servers/%s/tools: %v", firstID, err)
		return
	}
	if tResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/tools returned 501 — required by SPEC §6.7")
		return
	}
	if tResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/tools status %d body %s", firstID, tResp.StatusCode, tBody)
		return
	}
	var traw struct {
		Tools []map[string]any `json:"tools"`
	}
	if err := json.Unmarshal(tBody, &traw); err != nil {
		t.Errorf("mcp/server/%s/tools JSON decode: %v (body=%s)", firstID, err, tBody)
		return
	}
	if traw.Tools == nil {
		t.Errorf("/v1/mcp/servers/%s/tools missing `tools` key: %s", firstID, tBody)
	}
	for i, tl := range traw.Tools {
		if id, _ := tl["id"].(string); id == "" {
			t.Errorf("mcp tool[%d] missing id: %v", i, tl)
		}
	}
	// LLLLLL1: per-server resources + prompts. SPEC §6.7 lines
	// 436-441. Adapter authors that wired only servers + tools
	// missed both. Read-only.
	rctx, rcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer rcancel()
	rResp, rBody, rerr := c.get(rctx, "/v1/mcp/servers/"+firstID+"/resources")
	if rerr != nil {
		t.Errorf("GET /v1/mcp/servers/%s/resources: %v", firstID, rerr)
	} else if rResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/resources returned 501 — required by SPEC §6.7")
	} else if rResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/resources status %d body %s", firstID, rResp.StatusCode, rBody)
	} else {
		var rraw struct {
			Resources []map[string]any `json:"resources"`
		}
		if err := json.Unmarshal(rBody, &rraw); err != nil {
			t.Errorf("mcp/server/%s/resources JSON decode: %v (body=%s)", firstID, err, rBody)
		} else if rraw.Resources == nil {
			t.Errorf("/v1/mcp/servers/%s/resources missing `resources` key: %s", firstID, rBody)
		} else {
			for i, res := range rraw.Resources {
				if uri, _ := res["uri"].(string); uri == "" {
					t.Errorf("mcp resource[%d] missing uri: %v", i, res)
				}
			}
		}
	}
	pctx, pcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer pcancel()
	pResp, pBody, perr := c.get(pctx, "/v1/mcp/servers/"+firstID+"/prompts")
	if perr != nil {
		t.Errorf("GET /v1/mcp/servers/%s/prompts: %v", firstID, perr)
	} else if pResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/mcp/servers/{id}/prompts returned 501 — required by SPEC §6.7")
	} else if pResp.StatusCode != 200 {
		t.Errorf("/v1/mcp/servers/%s/prompts status %d body %s", firstID, pResp.StatusCode, pBody)
	} else {
		var praw struct {
			Prompts []map[string]any `json:"prompts"`
		}
		if err := json.Unmarshal(pBody, &praw); err != nil {
			t.Errorf("mcp/server/%s/prompts JSON decode: %v (body=%s)", firstID, err, pBody)
		} else if praw.Prompts == nil {
			t.Errorf("/v1/mcp/servers/%s/prompts missing `prompts` key: %s", firstID, pBody)
		} else {
			for i, pr := range praw.Prompts {
				if name, _ := pr["name"].(string); name == "" {
					t.Errorf("mcp prompt[%d] missing name: %v", i, pr)
				}
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
		// KKKKKK1: Per-provider detail endpoint. SPEC §6.12 promises
		// GET /v1/providers/{id} returns a single Provider. Adapter
		// authors that wired only the list got a silent gap before.
		// Per-id response must echo the same id back and have a
		// non-empty name (Provider schema).
		dresp, dbody, derr := c.get(ctx, "/v1/providers/"+pid)
		if derr != nil {
			t.Errorf("GET /v1/providers/%s: %v", pid, derr)
		} else if dresp.StatusCode == http.StatusNotImplemented {
			t.Errorf("/v1/providers/%s returned 501 — per-id drill-down required by SPEC §6.12", pid)
		} else if dresp.StatusCode != 200 {
			t.Errorf("/v1/providers/%s status %d body %s", pid, dresp.StatusCode, dbody)
		} else {
			var pdetail struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			}
			if err := json.Unmarshal(dbody, &pdetail); err != nil {
				t.Errorf("provider/%s JSON decode: %v (body=%s)", pid, err, dbody)
			} else {
				if pdetail.ID != pid {
					t.Errorf("/v1/providers/%s returned id=%q (want %q)", pid, pdetail.ID, pid)
				}
				if pdetail.Name == "" {
					t.Errorf("/v1/providers/%s missing name: %s", pid, dbody)
				}
			}
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

// BBBBBB1 — checkDiffs validates GET /v1/sessions/{id}/diffs. Asserts
// 200, top-level `diffs` array (non-nil — empty list is fine, missing
// key is not), and each entry carries the file_diff shape from SPEC
// §5.4: required {path, applied}; optional {before, after, language}
// (we only assert types when present so adapters that emit nulls
// still pass). Locks the wire shape that powers `gact diff` and the
// conversation pane's a/r apply/reject keys. Read-only — never POSTs
// to /diffs/apply or /diffs/reject so it stays idempotent against
// the live session.
func checkDiffs(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/diffs")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/diffs: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/diffs returned 501 — set SkipDiffs or fix capabilities.diffs")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Diffs []map[string]any `json:"diffs"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("diffs JSON decode: %v (body=%s)", err, body)
	}
	if raw.Diffs == nil {
		t.Errorf("response missing `diffs` key: %s", body)
		return
	}
	for i, d := range raw.Diffs {
		for _, key := range []string{"path", "applied"} {
			if _, ok := d[key]; !ok {
				t.Errorf("diff[%d] missing required key %q: %v", i, key, d)
			}
		}
		if path, ok := d["path"].(string); ok && path == "" {
			t.Errorf("diff[%d] has empty path: %v", i, d)
		}
		if _, isBool := d["applied"].(bool); !isBool {
			if _, present := d["applied"]; present {
				t.Errorf("diff[%d] applied is not bool: %v", i, d["applied"])
			}
		}
		if lang, present := d["language"]; present {
			if _, ok := lang.(string); !ok && lang != nil {
				t.Errorf("diff[%d] language must be string|null: %v", i, lang)
			}
		}
	}
}

// DDDDDD1 — checkAgents validates GET /v1/agents (SPEC §6.5).
// Asserts 200 + non-nil top-level `agents` array (empty list is
// fine; missing key violates spec) + per-entry required {id,
// source, title} with `source` in the documented enum
// (builtin|user|recipe|skill). Locks the wire shape that powers
// the Settings → Agent picker (ListAgents → settingsLoadedMsg)
// and `gact agents list` (CLI). Read-only — never POSTs to create
// an agent so it stays idempotent against the live backend.
//
// FFFFFF1: also drills into GET /v1/agents/{id} for the first
// agent in the list (when present). Per-id response must echo the
// same id back and have non-empty source/title — same shape as a
// list entry, per SPEC §6.5.
func checkAgents(t Reporter, c *conformClient) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/agents")
	if err != nil {
		t.Fatalf("GET /v1/agents: %v", err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/agents returned 501 — set SkipAgents")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Agents []map[string]any `json:"agents"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("agents JSON decode: %v (body=%s)", err, body)
	}
	if raw.Agents == nil {
		t.Errorf("response missing `agents` key: %s", body)
		return
	}
	var firstID string
	for i, a := range raw.Agents {
		for _, key := range []string{"id", "source", "title"} {
			if _, ok := a[key]; !ok {
				t.Errorf("agent[%d] missing required key %q: %v", i, key, a)
			}
		}
		if id, _ := a["id"].(string); id == "" {
			t.Errorf("agent[%d] has empty id: %v", i, a)
		} else if firstID == "" {
			firstID = id
		}
		if src, _ := a["source"].(string); src != "" {
			switch src {
			case "builtin", "user", "recipe", "skill":
			default:
				t.Errorf("agent[%d] unexpected source %q (want builtin|user|recipe|skill)", i, src)
			}
		}
	}
	if firstID == "" {
		return
	}
	dctx, dcancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer dcancel()
	dResp, dBody, err := c.get(dctx, "/v1/agents/"+firstID)
	if err != nil {
		t.Errorf("GET /v1/agents/%s: %v", firstID, err)
		return
	}
	if dResp.StatusCode == http.StatusNotImplemented {
		t.Errorf("/v1/agents/{id} returned 501 — per-id drill-down required by SPEC §6.5")
		return
	}
	if dResp.StatusCode != 200 {
		t.Errorf("/v1/agents/%s status %d body %s", firstID, dResp.StatusCode, dBody)
		return
	}
	var detail struct {
		ID     string `json:"id"`
		Source string `json:"source"`
		Title  string `json:"title"`
	}
	if err := json.Unmarshal(dBody, &detail); err != nil {
		t.Errorf("agent/%s JSON decode: %v (body=%s)", firstID, err, dBody)
		return
	}
	if detail.ID != firstID {
		t.Errorf("/v1/agents/%s returned id=%q (want %q)", firstID, detail.ID, firstID)
	}
	if detail.Source == "" {
		t.Errorf("/v1/agents/%s missing source: %s", firstID, dBody)
	}
	if detail.Title == "" {
		t.Errorf("/v1/agents/%s missing title: %s", firstID, dBody)
	}
}

// CCCCCC1 — checkMessageDiffs validates the per-message variant
// `GET /v1/sessions/{id}/messages/{msg_id}/diffs`. Picks the first
// message id from `GET /v1/sessions/{id}/messages` so the suite
// stays portable (no fixture coupling). Asserts 200, top-level
// `diffs` array (non-nil), and the same file_diff entry shape as
// checkDiffs (path required + non-empty, applied bool, language
// string|null when present). Skips quietly when the session has no
// messages yet — listing returns empty so there's nothing to walk.
// Read-only.
func checkMessageDiffs(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	listResp, listBody, err := c.get(ctx, "/v1/sessions/"+sid+"/messages")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages: %v", sid, err)
	}
	if listResp.StatusCode == http.StatusNotImplemented {
		t.Fatal("messages list returned 501 — set SkipMessageDiffs")
	}
	if listResp.StatusCode != 200 {
		t.Fatalf("list messages status %d body %s", listResp.StatusCode, listBody)
	}
	var listRaw struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(listBody, &listRaw); err != nil {
		t.Fatalf("messages JSON decode: %v (body=%s)", err, listBody)
	}
	if len(listRaw.Messages) == 0 {
		// Empty session — nothing to drill into. Don't fail; the
		// per-message endpoint shape is exercised only when there's
		// at least one message to point at.
		return
	}
	mid := listRaw.Messages[0].ID
	if mid == "" {
		t.Fatalf("first message id empty in list: %s", listBody)
	}
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/messages/"+mid+"/diffs")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages/%s/diffs: %v", sid, mid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/messages/{msg_id}/diffs returned 501 — set SkipMessageDiffs or fix capabilities.diffs")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Diffs []map[string]any `json:"diffs"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("message diffs JSON decode: %v (body=%s)", err, body)
	}
	if raw.Diffs == nil {
		t.Errorf("response missing `diffs` key: %s", body)
		return
	}
	for i, d := range raw.Diffs {
		for _, key := range []string{"path", "applied"} {
			if _, ok := d[key]; !ok {
				t.Errorf("diff[%d] missing required key %q: %v", i, key, d)
			}
		}
		if path, ok := d["path"].(string); ok && path == "" {
			t.Errorf("diff[%d] has empty path: %v", i, d)
		}
		if _, isBool := d["applied"].(bool); !isBool {
			if _, present := d["applied"]; present {
				t.Errorf("diff[%d] applied is not bool: %v", i, d["applied"])
			}
		}
		if lang, present := d["language"]; present {
			if _, ok := lang.(string); !ok && lang != nil {
				t.Errorf("diff[%d] language must be string|null: %v", i, lang)
			}
		}
	}
}

// QQQQQQ1 — checkMessagesSearch validates GET /v1/sessions/{id}/
// messages/search?q=hello (SPEC §6.3, gated by capabilities
// .search_messages). Asserts 200 + non-nil top-level `matches`
// array (empty list is fine — the seed message may not match the
// query; missing key violates spec). When matches are present,
// each must carry the documented {message_id, snippet} pair.
// Locks the wire shape that powers the @-search palette and
// `gact search`. Read-only.
func checkMessagesSearch(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/messages/search?q=hello&limit=5")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/messages/search: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/messages/search returned 501 — set SkipMessageSearch or fix capabilities.search_messages")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var raw struct {
		Matches []map[string]any `json:"matches"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("messages search JSON decode: %v (body=%s)", err, body)
	}
	if raw.Matches == nil {
		t.Errorf("response missing `matches` key: %s", body)
		return
	}
	for i, m := range raw.Matches {
		for _, key := range []string{"message_id", "snippet"} {
			if _, ok := m[key]; !ok {
				t.Errorf("match[%d] missing required key %q: %v", i, key, m)
			}
		}
		if mid, _ := m["message_id"].(string); mid == "" {
			t.Errorf("match[%d] empty message_id: %v", i, m)
		}
	}
}

// RRRRRR1 — checkSessionExport validates GET /v1/sessions/{id}/export
// (SPEC §6.2). Asserts 200 + Content-Type starts with application/json
// + body parses as JSON. Specific exported shape is per-backend; the
// SPEC says "session blob" without locking the field set, so we only
// assert that the response is valid JSON. Locks just enough that
// `gact export` and `gact import` can round-trip without a 501 hiding
// in the middle. Read-only.
func checkSessionExport(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.get(ctx, "/v1/sessions/"+sid+"/export")
	if err != nil {
		t.Fatalf("GET /v1/sessions/%s/export: %v", sid, err)
	}
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("/v1/sessions/{id}/export returned 501 — set SkipSessionExport")
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var blob any
	if err := json.Unmarshal(body, &blob); err != nil {
		t.Errorf("export body not valid JSON: %v (body=%s)", err, body)
	}
}

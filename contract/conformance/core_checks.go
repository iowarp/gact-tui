package conformance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

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

package conformance

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

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

	// POST a hook, expect 201 + full Hook echo. YYYYYY1: assert
	// the response carries back the event/command we sent so adapter
	// authors that drop fields on the way through (a real bug pattern
	// we hit during MMM3) get caught at conformance time.
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
		ID      string `json:"id"`
		Event   string `json:"event"`
		Command string `json:"command"`
	}
	_ = json.Unmarshal(postBody, &created)
	if created.ID == "" {
		t.Fatalf("created hook missing id: %s", postBody)
	}
	if created.Event != "notification" {
		t.Errorf("created hook event=%q (want %q): %s", created.Event, "notification", postBody)
	}
	if created.Command != "/bin/true" {
		t.Errorf("created hook command=%q (want %q): %s", created.Command, "/bin/true", postBody)
	}

	// YYYYYY1: the second list MUST include the new hook so callers
	// can poll the catalog after a write. Catches adapter authors
	// whose POST 200s but never persists the row to the list.
	listResp2, listBody2, err := c.get(ctx, "/v1/hooks")
	if err != nil {
		t.Fatalf("GET /v1/hooks (post-create): %v", err)
	}
	if listResp2.StatusCode != 200 {
		t.Fatalf("post-create list status %d body %s", listResp2.StatusCode, listBody2)
	}
	if !strings.Contains(string(listBody2), created.ID) {
		t.Errorf("post-create list missing new hook %s: %s", created.ID, listBody2)
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

	// ZZZZZZ1: GET after PUT must show the persisted rule. Catches
	// adapter authors whose PUT echoes the request but never writes
	// to the underlying store. Same root cause as YYYYYY1's
	// post-create list check on hooks.
	verifyResp, verifyBody, err := c.get(ctx, "/v1/policies")
	if err != nil {
		t.Fatalf("GET /v1/policies (post-PUT): %v", err)
	}
	if verifyResp.StatusCode != 200 {
		t.Fatalf("post-PUT list status %d body %s", verifyResp.StatusCode, verifyBody)
	}
	if !strings.Contains(string(verifyBody), `"shell"`) {
		t.Errorf("post-PUT GET missing shell rule: %s", verifyBody)
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

	// POST a task. AAAAAAA1: response must echo the title we sent
	// so adapter authors that lose fields on the way through get
	// caught — same bug pattern as YYYYYY1 for hooks.
	postResp, postBody, err := c.postJSON(ctx,
		"/v1/sessions/"+sid+"/tasks", map[string]any{"title": "conformance probe"})
	if err != nil {
		t.Fatalf("POST tasks: %v", err)
	}
	if postResp.StatusCode != 200 && postResp.StatusCode != 201 {
		t.Fatalf("create task status %d body %s", postResp.StatusCode, postBody)
	}
	var created struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	_ = json.Unmarshal(postBody, &created)
	if created.ID == "" {
		t.Fatalf("created task missing id: %s", postBody)
	}
	if created.Title != "conformance probe" {
		t.Errorf("created task title=%q (want %q): %s", created.Title, "conformance probe", postBody)
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

	// TTTTTT1: PATCH /v1/tasks/{id} — flip the task to status=running
	// and verify the round-trip. Catches adapter authors that wired
	// POST/GET/DELETE but forgot PATCH (which the TUI's task panel
	// uses for in-place status flips).
	patchReq, _ := http.NewRequest(http.MethodPatch,
		c.baseURL+"/v1/tasks/"+created.ID,
		bytes.NewReader(mustJSON(map[string]any{"status": "running"})))
	patchReq.Header.Set("Content-Type", "application/json")
	patchReq = patchReq.WithContext(ctx)
	patchResp, perr := c.http.Do(patchReq)
	if perr != nil {
		t.Fatalf("PATCH task: %v", perr)
	}
	patchBody, _ := io.ReadAll(patchResp.Body)
	patchResp.Body.Close()
	if patchResp.StatusCode == http.StatusNotImplemented {
		t.Fatal("PATCH /v1/tasks/{id} returned 501 — required by SPEC §6.18")
	}
	if patchResp.StatusCode != 200 {
		t.Fatalf("patch task status %d body %s", patchResp.StatusCode, patchBody)
	}
	var patched struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(patchBody, &patched); err != nil {
		t.Fatalf("patched task JSON decode: %v (body=%s)", err, patchBody)
	}
	if patched.ID != created.ID {
		t.Errorf("patched task id %q != created %q", patched.ID, created.ID)
	}
	if patched.Status != "running" {
		t.Errorf("patched task status %q, want %q", patched.Status, "running")
	}
	switch patched.Status {
	case "pending", "running", "completed", "failed":
	default:
		t.Errorf("patched task status %q not in enum (pending|running|completed|failed)", patched.Status)
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

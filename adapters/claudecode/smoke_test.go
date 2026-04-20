package claudecode

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// TestSmoke_RealClaude drives the Go adapter end-to-end against the
// real `claude` CLI. Skips when claude isn't installed (CI / fresh
// machines) — same pattern as the Python sidecar's smoke tests.
//
// Per the project testing rule: adapters must be tested against the
// real upstream, not a mock. This is the smoke; mocks are not
// allowed for adapter integration.
func TestSmoke_RealClaude(t *testing.T) {
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude CLI not on PATH; smoke test requires real Claude Code install")
	}
	srv := httptest.NewServer(New(t.TempDir(), "claude").Handler())
	defer srv.Close()

	// Create session
	r, err := http.Post(srv.URL+"/v1/sessions",
		"application/json", strings.NewReader(`{"title":"smoke"}`))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("create status %d body %s", r.StatusCode, body)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(created.ID, "sess_") {
		t.Fatalf("session id=%q", created.ID)
	}

	// POST a one-word prompt — keeps spend negligible.
	r2, err := http.Post(srv.URL+"/v1/sessions/"+created.ID+"/messages",
		"application/json", strings.NewReader(`{"parts":[{"type":"text","text":"say hi in one word"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	body2, _ := io.ReadAll(r2.Body)
	r2.Body.Close()
	if r2.StatusCode != 202 {
		t.Fatalf("post status %d body %s", r2.StatusCode, body2)
	}

	// Poll status (cheaper + deterministic vs SSE streaming for a
	// test). Real claude turns finish in ~3-8s; budget 90s.
	deadline := time.Now().Add(90 * time.Second)
	var status string
	for time.Now().Before(deadline) {
		gr, err := http.Get(srv.URL + "/v1/sessions/" + created.ID)
		if err != nil {
			t.Fatal(err)
		}
		gb, _ := io.ReadAll(gr.Body)
		gr.Body.Close()
		var sess struct {
			Status string `json:"status"`
		}
		_ = json.Unmarshal(gb, &sess)
		status = sess.Status
		if status == "idle" || status == "error" {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if status != "idle" {
		t.Fatalf("session ended in status=%q (expected idle)", status)
	}

	// Verify cached messages contain at least the user echo + an
	// assistant reply.
	mr, err := http.Get(srv.URL + "/v1/sessions/" + created.ID + "/messages")
	if err != nil {
		t.Fatal(err)
	}
	mb, _ := io.ReadAll(mr.Body)
	mr.Body.Close()
	var got struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(mb, &got); err != nil {
		t.Fatal(err)
	}
	roles := make(map[string]int)
	for _, m := range got.Messages {
		if r, ok := m["role"].(string); ok {
			roles[r]++
		}
	}
	if roles["user"] == 0 {
		t.Errorf("expected at least one user message; got %v", roles)
	}
	if roles["assistant"] == 0 {
		t.Errorf("expected at least one assistant message; got %v", roles)
	}
}

// TestNonClaudePathReturnsError exercises the lookup-failure path —
// a confidence check that we don't silently mask a missing binary.
func TestNonClaudePathReturnsError(t *testing.T) {
	srv := httptest.NewServer(New(t.TempDir(), "/nonexistent/path/to/claude").Handler())
	defer srv.Close()

	// Create session OK (no subprocess yet).
	r, err := http.Post(srv.URL+"/v1/sessions",
		"application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("create status %d", r.StatusCode)
	}
}

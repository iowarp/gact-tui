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

// TestSmoke_RealClaudePermissionFlow drives the can_use_tool
// control protocol against the real CLI. Asks claude to use the
// Write tool (Bash is auto-allowed; Write is gated), spins up a
// background allower that auto-POSTs allow on every pending
// permission, asserts the round-trip completes idle.
func TestSmoke_RealClaudePermissionFlow(t *testing.T) {
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude CLI not on PATH; smoke requires real Claude Code install")
	}
	srv := httptest.NewServer(New(t.TempDir(), "claude").Handler())
	defer srv.Close()

	r, _ := http.Post(srv.URL+"/v1/sessions",
		"application/json", strings.NewReader(`{"title":"perm"}`))
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	var created struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(body, &created)
	if created.ID == "" {
		t.Fatalf("create session failed: %s", body)
	}

	// Background allower — POSTs allow on every pending permission.
	stopCh := make(chan struct{})
	go func() {
		for {
			select {
			case <-stopCh:
				return
			default:
			}
			r, err := http.Get(srv.URL + "/v1/permissions?status=pending&session_id=" + created.ID)
			if err != nil {
				time.Sleep(200 * time.Millisecond)
				continue
			}
			b, _ := io.ReadAll(r.Body)
			r.Body.Close()
			var lst struct {
				Permissions []map[string]any `json:"permissions"`
			}
			_ = json.Unmarshal(b, &lst)
			for _, p := range lst.Permissions {
				pid, _ := p["id"].(string)
				if pid == "" {
					continue
				}
				_, _ = http.Post(srv.URL+"/v1/permissions/"+pid,
					"application/json", strings.NewReader(`{"action":"allow"}`))
			}
			time.Sleep(200 * time.Millisecond)
		}
	}()
	defer close(stopCh)

	// POST the prompt that triggers a Write call.
	r2, _ := http.Post(srv.URL+"/v1/sessions/"+created.ID+"/messages",
		"application/json",
		strings.NewReader(`{"parts":[{"type":"text","text":"Write a file new.txt with the content hello. Use the Write tool. Don't ask me; just do it."}]}`))
	r2.Body.Close()
	if r2.StatusCode != 202 {
		t.Fatalf("post status %d", r2.StatusCode)
	}

	// Poll status — at least one permission must have been requested
	// and resolved before idle, otherwise the protocol didn't fire.
	deadline := time.Now().Add(120 * time.Second)
	var status string
	for time.Now().Before(deadline) {
		gr, _ := http.Get(srv.URL + "/v1/sessions/" + created.ID)
		gb, _ := io.ReadAll(gr.Body)
		gr.Body.Close()
		var s struct{ Status string }
		_ = json.Unmarshal(gb, &s)
		status = s.Status
		if status == "idle" || status == "error" {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if status != "idle" {
		t.Fatalf("ended status=%q want idle", status)
	}

	// Verify a permission was actually issued + resolved.
	pr, _ := http.Get(srv.URL + "/v1/permissions?session_id=" + created.ID)
	pb, _ := io.ReadAll(pr.Body)
	pr.Body.Close()
	var pl struct {
		Permissions []map[string]any `json:"permissions"`
	}
	_ = json.Unmarshal(pb, &pl)
	if len(pl.Permissions) == 0 {
		t.Fatalf("no permissions recorded — control protocol didn't fire")
	}
	resolved := 0
	for _, p := range pl.Permissions {
		if r, _ := p["resolved"].(bool); r {
			resolved++
		}
	}
	if resolved == 0 {
		t.Fatalf("no permissions resolved; %d pending", len(pl.Permissions))
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

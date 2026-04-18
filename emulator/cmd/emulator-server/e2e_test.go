// End-to-end test: builds and boots the actual emulator binary, then drives
// it over real HTTP. Catches integration issues that the package-level
// httptest harness can't reach (mux routing edge cases, chunked transfer for
// SSE, real socket lifecycle).
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// pickPort finds an ephemeral free TCP port. Has a small race with anyone
// else binding the same port between Close and the server listening, but
// good enough for tests.
func pickPort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("pick port: %v", err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// startEmulator builds and runs the binary, returning a base URL and a
// cleanup function.
func startEmulator(t *testing.T) (baseURL string, cleanup func()) {
	t.Helper()
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	build := exec.Command("go", "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	port := pickPort(t)
	cmd := exec.Command(bin, "-port", fmt.Sprintf("%d", port), "-timing", "fast")
	cmd.Stdout = io.Discard
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}

	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	// Wait for /v1/health.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url + "/v1/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return url, func() {
					_ = cmd.Process.Signal(os.Interrupt)
					_ = cmd.Wait()
				}
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	t.Fatalf("emulator did not become healthy in 3s. stderr:\n%s", stderr.String())
	return "", nil
}

func TestE2E_HealthAndCapabilities(t *testing.T) {
	url, cleanup := startEmulator(t)
	defer cleanup()

	resp, err := http.Get(url + "/v1/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("health status = %d", resp.StatusCode)
	}

	resp2, err := http.Get(url + "/v1/capabilities")
	if err != nil {
		t.Fatalf("caps: %v", err)
	}
	defer resp2.Body.Close()
	var caps map[string]any
	_ = json.NewDecoder(resp2.Body).Decode(&caps)
	if caps["contract_version"] != "0.1" {
		t.Errorf("contract_version = %v", caps["contract_version"])
	}
}

func TestE2E_FullScenarioFlow(t *testing.T) {
	url, cleanup := startEmulator(t)
	defer cleanup()

	// Create a session in the seeded workspace.
	sess := postJSON(t, url+"/v1/sessions", map[string]any{
		"workspace_id": "ws_default",
		"title":        "e2e",
	})
	sid := sess["id"].(string)

	// Open SSE stream FIRST so we don't miss events.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url+"/v1/sessions/"+sid+"/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("sse: %v", err)
	}
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)

	// Drain greeting.
	if _, err := readSSEEvent(rdr, time.Second); err != nil {
		t.Fatalf("greeting: %v", err)
	}

	// POST a message to drive the scenario.
	posted := postJSON(t, url+"/v1/sessions/"+sid+"/messages", map[string]any{
		"parts": []map[string]any{
			{"type": "text", "text": "read main.go please"},
		},
	})
	if posted["message_id"] == "" {
		t.Fatalf("no message_id returned")
	}

	// Read events until message.completed (then the wrap-up status_changed).
	wantSeen := map[string]bool{
		"message.created":         false,
		"message.part.added":      false,
		"message.part.delta":      false,
		"message.part.completed":  false,
		"tool.call.started":       false,
		"tool.call.completed":     false,
		"message.completed":       false,
	}
	deadline := time.After(8 * time.Second)
	doneEvents := 0
	// The scenario fires message.completed multiple times (once per
	// assistant turn — pre-tool and post-result). Wait for ALL the
	// 'wantSeen' events to appear, not just the first message.completed.
	for {
		allSeen := true
		for _, v := range wantSeen {
			if !v {
				allSeen = false
				break
			}
		}
		if allSeen {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timed out; seen=%+v", wantSeen)
		default:
		}
		ev, err := readSSEEvent(rdr, 2*time.Second)
		if err != nil {
			t.Fatalf("read SSE: %v (seen=%+v)", err, wantSeen)
		}
		if _, want := wantSeen[ev]; want {
			wantSeen[ev] = true
		}
		if ev == "message.completed" {
			doneEvents++
		}
	}
	_ = doneEvents
	for et, seen := range wantSeen {
		if !seen {
			t.Errorf("never saw %q", et)
		}
	}

	// Confirm the session has messages now.
	listResp, err := http.Get(url + "/v1/sessions/" + sid + "/messages?limit=20&include_system=true")
	if err != nil {
		t.Fatalf("list messages: %v", err)
	}
	defer listResp.Body.Close()
	var listBody struct {
		Messages []map[string]any `json:"messages"`
	}
	_ = json.NewDecoder(listResp.Body).Decode(&listBody)
	if len(listBody.Messages) < 3 {
		t.Errorf("expected 3+ messages (user + assistant + tool + assistant), got %d",
			len(listBody.Messages))
	}
}

func TestE2E_PermissionFlow(t *testing.T) {
	url, cleanup := startEmulator(t)
	defer cleanup()

	sess := postJSON(t, url+"/v1/sessions", map[string]any{
		"workspace_id": "ws_default",
		"title":        "perm-e2e",
	})
	sid := sess["id"].(string)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url+"/v1/sessions/"+sid+"/events", nil)
	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)
	_, _ = readSSEEvent(rdr, time.Second) // greeting

	// "delete" triggers the permission path.
	postJSON(t, url+"/v1/sessions/"+sid+"/messages", map[string]any{
		"parts": []map[string]any{{"type": "text", "text": "please delete the temp dir"}},
	})

	// Wait for permission.requested via SSE; then list permissions to grab ID.
	deadline := time.After(5 * time.Second)
	permRequested := false
loop:
	for {
		select {
		case <-deadline:
			t.Fatal("permission.requested never arrived")
		default:
		}
		ev, err := readSSEEvent(rdr, 2*time.Second)
		if err != nil {
			t.Fatalf("read SSE: %v", err)
		}
		if ev == "permission.requested" {
			permRequested = true
			break loop
		}
	}
	if !permRequested {
		t.Fatal("no permission.requested")
	}

	// List pending and find our permission.
	plResp, _ := http.Get(url + "/v1/permissions?session_id=" + sid + "&status=pending")
	defer plResp.Body.Close()
	var pending struct {
		Permissions []map[string]any `json:"permissions"`
	}
	_ = json.NewDecoder(plResp.Body).Decode(&pending)
	if len(pending.Permissions) != 1 {
		t.Fatalf("expected 1 pending, got %d", len(pending.Permissions))
	}
	permID := pending.Permissions[0]["id"].(string)

	// Allow it.
	postJSON(t, url+"/v1/permissions/"+permID, map[string]any{"action": "allow"})

	// Should see tool.call.completed and eventually message.completed.
	sawCompleted := false
	deadline = time.After(5 * time.Second)
	for !sawCompleted {
		select {
		case <-deadline:
			t.Fatal("never saw message.completed after allow")
		default:
		}
		ev, err := readSSEEvent(rdr, 2*time.Second)
		if err != nil {
			t.Fatalf("read SSE: %v", err)
		}
		if ev == "message.completed" {
			sawCompleted = true
		}
	}
}

func TestE2E_CancelInflight(t *testing.T) {
	url, cleanup := startEmulator(t)
	defer cleanup()

	// Spin up a session.
	sess := postJSON(t, url+"/v1/sessions", map[string]any{
		"workspace_id": "ws_default",
		"title":        "cancel-e2e",
	})
	sid := sess["id"].(string)

	// Trigger a scenario then cancel quickly.
	postJSON(t, url+"/v1/sessions/"+sid+"/messages", map[string]any{
		"parts": []map[string]any{{"type": "text", "text": "do work"}},
	})

	cancelReq, _ := http.NewRequest(http.MethodPost, url+"/v1/sessions/"+sid+"/cancel", nil)
	resp, err := http.DefaultClient.Do(cancelReq)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 204 {
		t.Errorf("cancel status = %d", resp.StatusCode)
	}

	// Eventually session should be idle.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		r, _ := http.Get(url + "/v1/sessions/" + sid)
		if r != nil {
			var got map[string]any
			_ = json.NewDecoder(r.Body).Decode(&got)
			r.Body.Close()
			if got["status"] == "idle" {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Errorf("session never returned to idle after cancel")
}

// --- helpers ---------------------------------------------------------------

// postJSON sends a JSON body and returns the decoded JSON response, or fails the test.
func postJSON(t *testing.T, url string, body any) map[string]any {
	t.Helper()
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	resp, err := http.Post(url, "application/json", &buf)
	if err != nil {
		t.Fatalf("post %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("post %s: status %d %s", url, resp.StatusCode, b)
	}
	var got map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil && err != io.EOF {
		t.Fatalf("decode %s: %v", url, err)
	}
	return got
}

// readSSEEvent reads until it sees an "event:" or "data:" line; returns the
// event name. If a JSON data line carries a type, prefer the JSON type. The
// SSE format we emit uses both "event:" and JSON.type — be tolerant of either.
func readSSEEvent(rdr *bufio.Reader, timeout time.Duration) (string, error) {
	type result struct {
		t   string
		err error
	}
	ch := make(chan result, 1)
	go func() {
		var lastEvent string
		for {
			line, err := rdr.ReadString('\n')
			if err != nil {
				ch <- result{lastEvent, err}
				return
			}
			line = strings.TrimRight(line, "\n")
			if strings.HasPrefix(line, "event: ") {
				lastEvent = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				if lastEvent == "" {
					// Try to extract type from JSON.
					var d map[string]any
					if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &d); err == nil {
						if t, ok := d["type"].(string); ok {
							lastEvent = t
						}
					}
				}
				if lastEvent != "" {
					ch <- result{lastEvent, nil}
					return
				}
			}
		}
	}()
	select {
	case r := <-ch:
		return r.t, r.err
	case <-time.After(timeout):
		return "", fmt.Errorf("timeout after %v", timeout)
	}
}

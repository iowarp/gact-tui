package claudecode

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHealth verifies the /v1/health endpoint returns the documented
// envelope. Doesn't touch the claude CLI.
func TestHealth(t *testing.T) {
	srv := httptest.NewServer(New(t.TempDir(), "/usr/bin/true").Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatalf("GET /v1/health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var got struct {
		Healthy bool `json:"healthy"`
		UptimeS int  `json:"uptime_s"`
	}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if !got.Healthy {
		t.Errorf("healthy=false")
	}
}

// TestCapabilities verifies the cap matrix advertises the expected
// subset (workspaces=true, sessions=true, the rest=false until
// DDDDDDD2..DDDDDDD4 wires them).
func TestCapabilities(t *testing.T) {
	srv := httptest.NewServer(New(t.TempDir(), "/usr/bin/true").Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/capabilities")
	if err != nil {
		t.Fatalf("GET /v1/capabilities: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var got struct {
		ContractVersion string         `json:"contract_version"`
		Backend         map[string]any `json:"backend"`
		Capabilities    map[string]any `json:"capabilities"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if got.ContractVersion != "0.1" {
		t.Errorf("contract_version=%q want 0.1", got.ContractVersion)
	}
	if got.Backend["name"] != "claudecode-adapter" {
		t.Errorf("backend.name=%v", got.Backend["name"])
	}
	for _, want := range []string{"workspaces", "sessions"} {
		if got.Capabilities[want] != true {
			t.Errorf("capabilities.%s=%v want true", want, got.Capabilities[want])
		}
	}
	for _, off := range []string{"voice", "lsp", "scheduled_sessions"} {
		if got.Capabilities[off] != false {
			t.Errorf("capabilities.%s=%v want false", off, got.Capabilities[off])
		}
	}
}

// TestWorkspaces verifies the synthetic workspace round-trip:
// list returns one entry, per-id GET echoes it, mismatched id 404s.
func TestWorkspaces(t *testing.T) {
	srv := httptest.NewServer(New(t.TempDir(), "/usr/bin/true").Handler())
	defer srv.Close()

	// List
	resp, err := http.Get(srv.URL + "/v1/workspaces")
	if err != nil {
		t.Fatalf("GET /v1/workspaces: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("list status %d body %s", resp.StatusCode, body)
	}
	var listed struct {
		Workspaces []map[string]any `json:"workspaces"`
	}
	if err := json.Unmarshal(body, &listed); err != nil {
		t.Fatalf("list decode: %v", err)
	}
	if len(listed.Workspaces) != 1 {
		t.Fatalf("want 1 workspace, got %d", len(listed.Workspaces))
	}
	wsID, _ := listed.Workspaces[0]["id"].(string)
	if wsID != "ws_default" {
		t.Errorf("workspace id=%q want ws_default", wsID)
	}

	// Per-id echo
	resp2, err := http.Get(srv.URL + "/v1/workspaces/" + wsID)
	if err != nil {
		t.Fatalf("GET /v1/workspaces/%s: %v", wsID, err)
	}
	body2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()
	if resp2.StatusCode != 200 {
		t.Fatalf("get status %d body %s", resp2.StatusCode, body2)
	}
	if !strings.Contains(string(body2), wsID) {
		t.Errorf("get body missing id: %s", body2)
	}

	// Bad id 404
	resp3, err := http.Get(srv.URL + "/v1/workspaces/ws_nonexistent")
	if err != nil {
		t.Fatalf("GET bad ws: %v", err)
	}
	resp3.Body.Close()
	if resp3.StatusCode != 404 {
		t.Errorf("bad-ws status %d want 404", resp3.StatusCode)
	}
}

// TestNotImplemented verifies un-wired endpoints return 501 with the
// SPEC §6.0 error envelope (so the TUI can degrade gracefully).
func TestNotImplemented(t *testing.T) {
	srv := httptest.NewServer(New(t.TempDir(), "/usr/bin/true").Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/sessions")
	if err != nil {
		t.Fatalf("GET /v1/sessions: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Errorf("status %d want 501", resp.StatusCode)
	}
	if !strings.Contains(string(body), `"error"`) {
		t.Errorf("body missing error envelope: %s", body)
	}
}

package goose

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// mockGoose returns a test server that pretends to be a Goose
// upstream. Only /health is wired — adapter routes that don't talk
// to upstream get tested without it.
func mockGoose(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"healthy":true}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestHealth(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Healthy bool `json:"healthy"`
		UptimeS int  `json:"uptime_s"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Healthy {
		t.Error("healthy=false but mock returned 200")
	}
}

func TestHealthFalseWhenUpstreamDown(t *testing.T) {
	// Don't start an upstream — adapter should report healthy=false
	srv := httptest.NewServer(New("http://127.0.0.1:1", "", nil).Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var got struct {
		Healthy bool `json:"healthy"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Healthy {
		t.Error("healthy=true but upstream is down")
	}
}

func TestCapabilities(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/capabilities")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var got struct {
		ContractVersion string         `json:"contract_version"`
		Backend         map[string]any `json:"backend"`
		Capabilities    map[string]any `json:"capabilities"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if got.ContractVersion != "0.1" {
		t.Errorf("contract_version=%q", got.ContractVersion)
	}
	if got.Backend["name"] != "goose-adapter" {
		t.Errorf("backend name=%v", got.Backend["name"])
	}
	if got.Capabilities["workspaces"] != true {
		t.Errorf("workspaces should be true")
	}
}

func TestWorkspaceListAndGet(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, t.TempDir(), nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/workspaces")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("list status %d body %s", r.StatusCode, body)
	}
	var listed struct {
		Workspaces []map[string]any `json:"workspaces"`
	}
	if err := json.Unmarshal(body, &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Workspaces) != 1 {
		t.Fatalf("want 1 workspace, got %d", len(listed.Workspaces))
	}
	wsID, _ := listed.Workspaces[0]["id"].(string)
	if wsID != "ws_default" {
		t.Errorf("workspace id=%q", wsID)
	}

	r2, _ := http.Get(srv.URL + "/v1/workspaces/" + wsID)
	body2, _ := io.ReadAll(r2.Body)
	r2.Body.Close()
	if r2.StatusCode != 200 {
		t.Fatalf("get status %d body %s", r2.StatusCode, body2)
	}
	if !strings.Contains(string(body2), wsID) {
		t.Errorf("get body missing id: %s", body2)
	}

	r3, _ := http.Get(srv.URL + "/v1/workspaces/ws_nope")
	r3.Body.Close()
	if r3.StatusCode != 404 {
		t.Errorf("bad-ws status %d want 404", r3.StatusCode)
	}
}

func TestNotImplementedReturns501(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	r, _ := http.Get(srv.URL + "/v1/sessions")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != http.StatusNotImplemented {
		t.Errorf("status %d want 501", r.StatusCode)
	}
	if !strings.Contains(string(body), `"error"`) {
		t.Errorf("body missing error envelope: %s", body)
	}
}

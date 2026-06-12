package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §3 health + capabilities ----------------------------------------------

func TestHealth(t *testing.T) {
	s := New(Config{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("content-type = %q", ct)
	}
	var body gact.HealthResponse
	mustDecode(t, rec, &body)
	if !body.Healthy {
		t.Errorf("healthy = false")
	}
	if body.UptimeS < 0 {
		t.Errorf("uptime_s = %d", body.UptimeS)
	}
}

func TestCapabilities(t *testing.T) {
	s := New(Config{Scenario: "default"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/capabilities", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body gact.Capabilities
	mustDecode(t, rec, &body)
	if body.ContractVersion != ContractVersion {
		t.Errorf("contract_version = %q", body.ContractVersion)
	}
	if body.Backend.Name != "gact-emulator" {
		t.Errorf("backend.name = %q", body.Backend.Name)
	}
	if !body.Capabilities.Sessions {
		t.Errorf("sessions capability should be true")
	}
	if body.Capabilities.LSP {
		t.Errorf("LSP capability should be false")
	}
	if !body.Transports.EventsSSE {
		t.Errorf("events_sse should be true")
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	s := New(Config{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/nonexistent", nil)
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

// --- §6.1 Workspaces -------------------------------------------------------

func TestWorkspaceLifecycle(t *testing.T) {
	s := New(Config{})
	h := s.Handler()

	// An OS-absolute root (basename "foo"): filepath.IsAbs requires a drive
	// letter on Windows, so a hardcoded "/tmp/foo" is not absolute there.
	wsRoot := filepath.Join(t.TempDir(), "foo")

	// List empty
	{
		rec := do(t, h, http.MethodGet, "/v1/workspaces", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list empty: status %d", rec.Code)
		}
		var body ListWorkspacesResponse
		mustDecode(t, rec, &body)
		if len(body.Workspaces) != 0 {
			t.Errorf("expected empty list, got %d", len(body.Workspaces))
		}
	}

	// Create
	var created gact.Workspace
	{
		rec := do(t, h, http.MethodPost, "/v1/workspaces", CreateWorkspaceRequest{
			RootPath: wsRoot,
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create: status %d body %s", rec.Code, rec.Body.String())
		}
		mustDecode(t, rec, &created)
		if created.ID == "" {
			t.Errorf("created.ID empty")
		}
		if created.Name != "foo" {
			t.Errorf("created.Name = %q (expected derived from basename)", created.Name)
		}
	}

	// Create with missing root_path
	{
		rec := do(t, h, http.MethodPost, "/v1/workspaces", CreateWorkspaceRequest{})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("create missing root_path: status = %d", rec.Code)
		}
	}
	// Create with relative root_path
	{
		rec := do(t, h, http.MethodPost, "/v1/workspaces", CreateWorkspaceRequest{RootPath: "relative/path"})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("create relative root_path: status = %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "absolute local path") {
			t.Errorf("create relative root_path body = %s", rec.Body.String())
		}
	}
	// Create with a root already registered to another workspace
	{
		rec := do(t, h, http.MethodPost, "/v1/workspaces", CreateWorkspaceRequest{RootPath: wsRoot})
		if rec.Code != http.StatusConflict {
			t.Errorf("create duplicate root_path: status = %d", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "already registered") {
			t.Errorf("create duplicate root_path body = %s", rec.Body.String())
		}
	}
	// Visual-loop fixture: benchmark analysis workspaces produce an
	// operator-readable remove failure instead of disappearing silently.
	var protected gact.Workspace
	{
		rec := do(t, h, http.MethodPost, "/v1/workspaces", CreateWorkspaceRequest{RootPath: filepath.Join(t.TempDir(), "gact-analysis")})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create protected fixture: status %d body %s", rec.Code, rec.Body.String())
		}
		mustDecode(t, rec, &protected)
		rec = do(t, h, http.MethodDelete, "/v1/workspaces/"+protected.ID, nil)
		if rec.Code != http.StatusConflict {
			t.Fatalf("delete protected fixture: status %d body %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "active benchmark profile") {
			t.Fatalf("delete protected fixture body = %s", rec.Body.String())
		}
	}

	// Get
	{
		rec := do(t, h, http.MethodGet, "/v1/workspaces/"+created.ID, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: status %d", rec.Code)
		}
		var got gact.Workspace
		mustDecode(t, rec, &got)
		if got.ID != created.ID {
			t.Errorf("get returned wrong ID")
		}
	}

	// Get missing
	{
		rec := do(t, h, http.MethodGet, "/v1/workspaces/ws_nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("get missing: status %d", rec.Code)
		}
	}

	// PATCH name
	{
		newName := "renamed"
		rec := do(t, h, http.MethodPatch, "/v1/workspaces/"+created.ID, UpdateWorkspaceRequest{
			Name: &newName,
		})
		if rec.Code != http.StatusOK {
			t.Fatalf("patch: status %d", rec.Code)
		}
		var ws gact.Workspace
		mustDecode(t, rec, &ws)
		if ws.Name != "renamed" {
			t.Errorf("patch did not update name: %q", ws.Name)
		}
	}

	// PATCH unknown field is rejected (DisallowUnknownFields)
	{
		buf := bytes.NewBufferString(`{"unknown_field":"x"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch, "/v1/workspaces/"+created.ID, buf)
		req.Header.Set("Content-Type", "application/json")
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("patch unknown field: status = %d", rec.Code)
		}
	}

	// DELETE
	{
		rec := do(t, h, http.MethodDelete, "/v1/workspaces/"+created.ID, nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("delete: status %d", rec.Code)
		}
	}

	// DELETE missing
	{
		rec := do(t, h, http.MethodDelete, "/v1/workspaces/"+created.ID, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("delete missing: status %d", rec.Code)
		}
	}
}

// --- helpers ---------------------------------------------------------------

func mustDecode(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(v); err != nil {
		t.Fatalf("decode: %v (body %q)", err, rec.Body.String())
	}
}

// do builds a request with optional JSON body, runs it through h, returns the recorder.
func do(t *testing.T, h http.Handler, method, target string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, target, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

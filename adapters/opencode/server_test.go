package opencode

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// mockOpenCode stands up an httptest.Server with handlers for the OpenCode
// endpoints we proxy. Tests assert the adapter calls the right paths and
// translates the responses correctly.
func mockOpenCode(t *testing.T, handlers map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for path, h := range handlers {
		mux.HandleFunc(path, h)
	}
	return httptest.NewServer(mux)
}

func do(t *testing.T, h http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, nil)
	h.ServeHTTP(rec, req)
	return rec
}

func TestAdapter_HealthAndCapabilities(t *testing.T) {
	s := New("http://unused", nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("health: %d", rec.Code)
	}
	var hr gact.HealthResponse
	_ = json.NewDecoder(rec.Body).Decode(&hr)
	if !hr.Healthy {
		t.Errorf("healthy = false")
	}

	rec = do(t, s.Handler(), http.MethodGet, "/v1/capabilities")
	var caps gact.Capabilities
	_ = json.NewDecoder(rec.Body).Decode(&caps)
	if !caps.Capabilities.Sessions {
		t.Errorf("sessions cap should be true")
	}
	if caps.Capabilities.MCP {
		t.Errorf("MCP cap should be false (adapter v0.1 doesn't proxy MCP yet)")
	}
}

func TestAdapter_ListWorkspaces(t *testing.T) {
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/path": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"worktree": "/repos/myapp", "directory": "/repos/myapp", "home": "/home/me"}`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/workspaces")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Workspaces []gact.Workspace `json:"workspaces"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(body.Workspaces))
	}
	if body.Workspaces[0].RootPath != "/repos/myapp" {
		t.Errorf("RootPath = %q", body.Workspaces[0].RootPath)
	}
}

func TestAdapter_ListSessions(t *testing.T) {
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[
				{"id":"ses_1","title":"first","time":{"created":1700000000000,"updated":1700000000000}},
				{"id":"ses_2","title":"second","time":{"created":1700000100000,"updated":1700000100000},"parentID":"ses_1"}
			]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/sessions")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Sessions []gact.Session `json:"sessions"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Sessions) != 2 {
		t.Fatalf("count = %d", len(body.Sessions))
	}
	if body.Sessions[0].Title != "first" {
		t.Errorf("title = %q", body.Sessions[0].Title)
	}
	if body.Sessions[1].ParentSessionID != "ses_1" {
		t.Errorf("parent = %q", body.Sessions[1].ParentSessionID)
	}
}

func TestAdapter_GetSession(t *testing.T) {
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/ses_42": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"id":"ses_42","title":"the answer","slug":"answer","time":{"created":1,"updated":2}}`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/sessions/ses_42")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var sess gact.Session
	_ = json.NewDecoder(rec.Body).Decode(&sess)
	if sess.Title != "the answer" {
		t.Errorf("title = %q", sess.Title)
	}
	if sess.Metadata["x_opencode_slug"] != "answer" {
		t.Errorf("metadata slug missing")
	}
}

func TestAdapter_GetSessionNotFound(t *testing.T) {
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/ses_nope": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/sessions/ses_nope")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (got %s)", rec.Code, rec.Body.String())
	}
}

func TestAdapter_NotImplementedFallthrough(t *testing.T) {
	s := New("http://unused", nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/mcp/servers")
	if rec.Code != http.StatusNotImplemented {
		t.Errorf("status = %d, want 501", rec.Code)
	}
}

func TestAdapter_UpstreamUnreachable(t *testing.T) {
	// Use a server that immediately closes — simulates network error.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/sessions")
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

package crush

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func mockCrush(t *testing.T, handlers map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for p, h := range handlers {
		mux.HandleFunc(p, h)
	}
	return httptest.NewServer(mux)
}

func do(t *testing.T, h http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	h.ServeHTTP(rec, req)
	return rec
}

func TestAdapter_HealthAndCapabilities(t *testing.T) {
	s := New("http://unused", "ws_default", nil)
	rec := do(t, s.Handler(), "/v1/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("health: %d", rec.Code)
	}

	rec = do(t, s.Handler(), "/v1/capabilities")
	var caps gact.Capabilities
	_ = json.NewDecoder(rec.Body).Decode(&caps)
	if caps.Backend.Name != "gact-crush-adapter" {
		t.Errorf("backend.name = %q", caps.Backend.Name)
	}
	if !caps.Capabilities.Sessions {
		t.Errorf("sessions cap should be true")
	}
}

func TestAdapter_ListWorkspaces(t *testing.T) {
	upstream := mockCrush(t, map[string]http.HandlerFunc{
		"/v1/workspaces": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[{"id":"ws_a","path":"/repos/a","title":"a","created_at":1700000000}]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/workspaces")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Workspaces []gact.Workspace `json:"workspaces"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Workspaces) != 1 || body.Workspaces[0].Name != "a" {
		t.Errorf("workspaces = %+v", body.Workspaces)
	}
}

func TestAdapter_ListSessions(t *testing.T) {
	upstream := mockCrush(t, map[string]http.HandlerFunc{
		"/v1/workspaces/ws_a/sessions": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[
				{"id":"ses_1","title":"first","prompt_tokens":1500,"completion_tokens":600,"cost":0.0135},
				{"id":"ses_2","title":"second","parent_session_id":"ses_1"}
			]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/sessions?workspace_id=ws_a")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Sessions []gact.Session `json:"sessions"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Sessions) != 2 {
		t.Fatalf("sessions count = %d", len(body.Sessions))
	}
	if body.Sessions[0].CostUSD != 0.0135 {
		t.Errorf("cost not propagated: %v", body.Sessions[0].CostUSD)
	}
	if body.Sessions[1].ParentSessionID != "ses_1" {
		t.Errorf("parent missing: %+v", body.Sessions[1])
	}
}

func TestAdapter_ListSessions_DefaultWorkspace(t *testing.T) {
	// Adapter started with --default-workspace=ws_a; client omits the
	// query and the adapter falls back.
	upstream := mockCrush(t, map[string]http.HandlerFunc{
		"/v1/workspaces/ws_a/sessions": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/sessions")
	if rec.Code != http.StatusOK {
		t.Errorf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestAdapter_ListSessions_MissingWorkspace(t *testing.T) {
	s := New("http://unused", "", nil)
	rec := do(t, s.Handler(), "/v1/sessions")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}

func TestAdapter_GetSession(t *testing.T) {
	upstream := mockCrush(t, map[string]http.HandlerFunc{
		"/v1/workspaces/ws_a/sessions/ses_42": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"id":"ses_42","title":"the answer"}`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/sessions/ses_42")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var sess gact.Session
	_ = json.NewDecoder(rec.Body).Decode(&sess)
	if sess.Title != "the answer" {
		t.Errorf("title = %q", sess.Title)
	}
}

func TestAdapter_NotImplementedFallthrough(t *testing.T) {
	s := New("http://unused", "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/mcp/servers")
	if rec.Code != http.StatusNotImplemented {
		t.Errorf("status %d, want 501", rec.Code)
	}
}

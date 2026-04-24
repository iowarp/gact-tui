package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB3: /v1/capabilities advertises v0.2 contract
// version + new capability flags (agent_routing, memory,
// structured_errors, integration_health, tool_telemetry).
func TestCapabilitiesV02Flags(t *testing.T) {
	s := New(Config{Scenario: "default"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/capabilities", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body gact.Capabilities
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if body.ContractVersion != "0.2" {
		t.Errorf("contract_version = %q, want \"0.2\"", body.ContractVersion)
	}
	c := body.Capabilities
	for flag, got := range map[string]bool{
		"agent_routing":      c.AgentRouting,
		"memory":             c.Memory,
		"structured_errors":  c.StructuredErrors,
		"integration_health": c.IntegrationHealth,
		"tool_telemetry":     c.ToolTelemetry,
	} {
		if !got {
			t.Errorf("capability %s = false, want true (emulator is the v0.2 reference)", flag)
		}
	}
}

// CLIO-BBBBBBBBBB3: /v1/health exposes the v0.2 integrations array
// + overall_status. Ready-state for the emulator since everything is
// in-memory.
func TestHealthV02IntegrationsArray(t *testing.T) {
	s := New(Config{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body gact.HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.Healthy {
		t.Errorf("healthy = false, want true")
	}
	if body.OverallStatus != "ready" {
		t.Errorf("overall_status = %q, want \"ready\"", body.OverallStatus)
	}
	if len(body.Integrations) == 0 {
		t.Fatalf("integrations[] empty, want ≥1 row")
	}
	// Each row carries name + status at minimum.
	for i, integ := range body.Integrations {
		if integ.Name == "" || integ.Status == "" {
			t.Errorf("integrations[%d] = %+v, missing name or status", i, integ)
		}
	}
}

// CLIO-BBBBBBBBBB3: GET /v1/memory/stats returns the v0.2 shape for
// cache + global counters; ?session_id= narrows to per-session
// retention.
func TestMemoryStatsEndpoint(t *testing.T) {
	s := New(Config{})

	// Prime the cache counters so hit_rate is nonzero.
	s.BumpMemoryHit()
	s.BumpMemoryHit()
	s.BumpMemoryHit()
	s.BumpMemoryMiss()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/memory/stats", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body gact.MemoryStats
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Cache.Hits != 3 || body.Cache.Misses != 1 {
		t.Errorf("cache counters = (hits=%d, misses=%d), want (3, 1)",
			body.Cache.Hits, body.Cache.Misses)
	}
	if body.Cache.HitRate < 0.74 || body.Cache.HitRate > 0.76 {
		t.Errorf("hit_rate = %v, want ~0.75", body.Cache.HitRate)
	}
	if body.Cache.Capacity <= 0 {
		t.Errorf("capacity should be positive")
	}
	// Session scope not requested → session block should be nil.
	if body.Session != nil {
		t.Errorf("session block = %+v, want nil when ?session_id not set", body.Session)
	}
}

// CLIO-BBBBBBBBBB3: MemoryStats with ?session_id= populates the
// session block from the store.
func TestMemoryStatsWithSession(t *testing.T) {
	s := New(Config{})

	// Create a workspace + session so the store has something to
	// report.
	_, err := s.store.CreateWorkspace(gact.Workspace{Name: "test", RootPath: "/tmp/test"})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	wsList := s.store.ListWorkspaces()
	if len(wsList) == 0 {
		t.Fatalf("workspace not created")
	}
	sess, err := s.store.CreateSession(gact.Session{
		WorkspaceID: wsList[0].ID,
		Title:       "test",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		"/v1/memory/stats?session_id="+sess.ID, nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body gact.MemoryStats
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Session == nil {
		t.Fatalf("session block = nil, want populated")
	}
	if body.Session.SessionID != sess.ID {
		t.Errorf("session_id = %q, want %q", body.Session.SessionID, sess.ID)
	}
	if body.Session.TokensBudget == nil {
		t.Errorf("tokens_budget should be set (the emulator enforces a budget)")
	}
}

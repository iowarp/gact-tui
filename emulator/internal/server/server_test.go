package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestHealth(t *testing.T) {
	s := New(Config{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("content-type = %q, want application/json", ct)
	}
	var body gact.HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.Healthy {
		t.Errorf("healthy = false, want true")
	}
	if body.UptimeS < 0 {
		t.Errorf("uptime_s = %d, want >= 0", body.UptimeS)
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
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.ContractVersion != ContractVersion {
		t.Errorf("contract_version = %q, want %q", body.ContractVersion, ContractVersion)
	}
	if body.Backend.Name != "gact-emulator" {
		t.Errorf("backend.name = %q", body.Backend.Name)
	}
	if !body.Capabilities.Sessions {
		t.Errorf("sessions capability should be true")
	}
	if body.Capabilities.LSP {
		t.Errorf("LSP capability should be false (not yet implemented)")
	}
	if !body.Transports.EventsSSE {
		t.Errorf("events_sse transport should be true")
	}
	if body.Auth.Current == "" {
		t.Errorf("auth.current must not be empty")
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	s := New(Config{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/nonexistent", nil)
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

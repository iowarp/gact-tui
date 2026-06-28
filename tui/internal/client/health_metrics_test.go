package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestHealthCapabilitiesMetricsClientEndpoints(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/health":
			_ = json.NewEncoder(w).Encode(gact.HealthResponse{Healthy: true, OverallStatus: "ready"})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/capabilities":
			_ = json.NewEncoder(w).Encode(gact.Capabilities{
				ContractVersion: "0.2",
				Capabilities:    gact.CapabilityFlags{Metrics: true},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/capability-gaps":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"capability_gaps": map[string]gact.CapabilityGap{
					"metrics": {Status: "full"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/metrics":
			_ = json.NewEncoder(w).Encode(gact.Metrics{
				Sessions: gact.MetricsSessions{Total: 3},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	health, err := c.Health(t.Context())
	if err != nil || !health.Healthy || health.OverallStatus != "ready" {
		t.Fatalf("Health: health=%#v err=%v", health, err)
	}
	caps, err := c.Capabilities(t.Context())
	if err != nil || caps.ContractVersion != "0.2" || !caps.Capabilities.Metrics {
		t.Fatalf("Capabilities: caps=%#v err=%v", caps, err)
	}
	gaps, err := c.CapabilityGaps(t.Context())
	if err != nil || gaps["metrics"].Status != "full" {
		t.Fatalf("CapabilityGaps: gaps=%#v err=%v", gaps, err)
	}
	metrics, err := c.Metrics(t.Context())
	if err != nil || metrics.Sessions.Total != 3 {
		t.Fatalf("Metrics: metrics=%#v err=%v", metrics, err)
	}
}

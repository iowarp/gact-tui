package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestLatencyTracker_RecordsSamplesAndComputesPercentiles(t *testing.T) {
	tr := newLatencyTracker(64)
	for i := 1; i <= 50; i++ {
		tr.Record("GET /v1/foo", time.Duration(i)*time.Millisecond)
	}
	snap := tr.Snapshot()
	got, ok := snap["GET /v1/foo"]
	if !ok {
		t.Fatalf("snapshot missing key; got %+v", snap)
	}
	if got.Count != 50 {
		t.Errorf("count = %d, want 50", got.Count)
	}
	// Nearest-rank with 50 samples: p50 ≈ samples[24] (25 ms),
	// p95 ≈ samples[46] (47 ms), max = 50 ms.
	if got.P50Ms < 24 || got.P50Ms > 26 {
		t.Errorf("p50 = %v ms, want ~25", got.P50Ms)
	}
	if got.P95Ms < 46 || got.P95Ms > 48 {
		t.Errorf("p95 = %v ms, want ~47", got.P95Ms)
	}
	if got.MaxMs != 50 {
		t.Errorf("max = %v ms, want 50", got.MaxMs)
	}
}

func TestLatencyTracker_SkipsSSEPatterns(t *testing.T) {
	tr := newLatencyTracker(16)
	tr.Record("GET /v1/sessions/{id}/events", 5*time.Second)
	tr.Record("GET /v1/events", 5*time.Second)
	if got := tr.Snapshot(); len(got) != 0 {
		t.Errorf("SSE patterns should be skipped; got %+v", got)
	}
}

func TestLatencyTracker_SkipsEmptyPattern(t *testing.T) {
	tr := newLatencyTracker(16)
	tr.Record("", 1*time.Millisecond)
	if got := tr.Snapshot(); len(got) != 0 {
		t.Errorf("empty pattern should be skipped; got %+v", got)
	}
}

func TestLatencyTracker_RingBufferOverwritesOldest(t *testing.T) {
	tr := newLatencyTracker(4)
	for i := 1; i <= 10; i++ {
		tr.Record("GET /v1/foo", time.Duration(i)*time.Millisecond)
	}
	got := tr.Snapshot()["GET /v1/foo"]
	// Buffer holds only the last 4 samples (7..10ms). Total count = 10.
	if got.Count != 10 {
		t.Errorf("count = %d, want 10", got.Count)
	}
	if got.MaxMs != 10 {
		t.Errorf("max = %v ms, want 10", got.MaxMs)
	}
	// The oldest 6 entries are gone — p50 of [7,8,9,10] should be 8 or 9.
	if got.P50Ms < 8 || got.P50Ms > 9 {
		t.Errorf("p50 = %v ms, want 8 or 9", got.P50Ms)
	}
}

func TestMetricsEndpoint_IncludesLatencies(t *testing.T) {
	s := New(Config{})
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	// Hit /v1/health a few times to populate the reservoir.
	for i := 0; i < 5; i++ {
		resp, err := http.Get(srv.URL + "/v1/health")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
	}

	resp, err := http.Get(srv.URL + "/v1/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var got gact.Metrics
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	stat, ok := got.Latencies["GET /v1/health"]
	if !ok {
		t.Fatalf("latencies missing /v1/health; got %+v", got.Latencies)
	}
	// Count is 5 (the metrics request itself records under /v1/metrics).
	if stat.Count != 5 {
		t.Errorf("count = %d, want 5", stat.Count)
	}
	if stat.P95Ms < stat.P50Ms {
		t.Errorf("p95 (%v) < p50 (%v)", stat.P95Ms, stat.P50Ms)
	}
}

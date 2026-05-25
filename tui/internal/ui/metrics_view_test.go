package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestMetricsViewUsesSharedDetailSections(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{
		UptimeS: 42,
		Sessions: gact.MetricsSessions{
			Total:    3,
			Active:   2,
			ByStatus: map[string]int{"idle": 1},
		},
		Messages: gact.MetricsMessages{
			Total:  9,
			ByRole: map[string]int{"assistant": 4, "user": 5},
		},
		Tokens: gact.MetricsTokens{
			InputTotal:      100,
			OutputTotal:     200,
			CacheReadTotal:  30,
			CacheWriteTotal: 40,
		},
		Cost: gact.MetricsCost{
			TotalUSD:   1.25,
			ByProvider: map[string]float64{"argonne": 1.25},
		},
		Latencies: map[string]gact.MetricsLatencyStat{
			"GET /v1/sessions": {Count: 7, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 9.1},
		},
	}}

	out := stripANSI(a.viewMetrics())
	for _, want := range []string{
		"Backend Metrics",
		"Overview",
		"uptime: 42s",
		"Sessions",
		"total: 3",
		"active: 2",
		"Messages",
		"assistant: 4",
		"Tokens",
		"cache_read: 30",
		"Cost",
		"argonne: $1.2500",
		"Latencies (top 6 by p95, ms)",
		"GET /v1/sessions: p50 1.2 / p95 5.6 / max 9.1 (n=7)",
		"Esc / Ctrl+T close",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("metrics view missing %q:\n%s", want, out)
		}
	}
}

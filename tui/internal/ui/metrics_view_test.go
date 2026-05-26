package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

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
		"Esc close",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("metrics view missing %q:\n%s", want, out)
		}
	}
}

func TestMetricsViewUsesBoundedScrollWindow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 22
	a.metricsOpen = true
	a.metrics = &metricsState{data: denseMetricsForTest()}

	out := stripANSI(a.viewMetrics())
	if strings.Contains(out, "route-11") || strings.Contains(out, "route-12") {
		t.Fatalf("short metrics modal should window long body:\n%s", out)
	}
	if strings.Contains(out, "1-") {
		t.Fatalf("windowed metrics modal should not advertise numeric line range:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("windowed metrics modal should show a side scroll indicator:\n%s", out)
	}

	a.metrics.scroll = 1 << 30
	out = stripANSI(a.viewMetrics())
	if !strings.Contains(out, "route-11") {
		t.Fatalf("bottom-scrolled metrics modal should show final latency rows:\n%s", out)
	}
	if a.metrics.scroll <= 0 {
		t.Fatalf("render should clamp and persist positive metrics scroll, got %d", a.metrics.scroll)
	}
}

func TestMetricsMouseWheelScrollsBody(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 22
	a.metricsOpen = true
	a.metrics = &metricsState{data: denseMetricsForTest()}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:body:wheel")
	if !ok {
		t.Fatal("missing metrics body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.metrics == nil || a.metrics.scroll != 1 {
		t.Fatalf("wheel down should advance metrics scroll, got %+v", a.metrics)
	}
	_ = a.View()
	target, ok = findHitTargetForTest(a, "metrics:body:wheel")
	if !ok {
		t.Fatal("missing metrics body wheel target after scroll")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.metrics == nil || a.metrics.scroll != 0 {
		t.Fatalf("wheel up should move metrics scroll back, got %+v", a.metrics)
	}
}

func denseMetricsForTest() gact.Metrics {
	latencies := map[string]gact.MetricsLatencyStat{}
	for i := 0; i < 12; i++ {
		latencies["route-"+itoa2(i)] = gact.MetricsLatencyStat{
			Count: 1,
			P50Ms: float64(i),
			P95Ms: float64(100 + i),
			MaxMs: float64(200 + i),
		}
	}
	return gact.Metrics{
		UptimeS: 42,
		Sessions: gact.MetricsSessions{
			Total:    10,
			Active:   2,
			ByStatus: map[string]int{"idle": 4, "running": 2, "error": 1},
		},
		Messages: gact.MetricsMessages{
			Total:  99,
			ByRole: map[string]int{"assistant": 40, "system": 2, "tool": 20, "user": 37},
		},
		Tokens: gact.MetricsTokens{
			InputTotal:      100,
			OutputTotal:     200,
			CacheReadTotal:  30,
			CacheWriteTotal: 40,
		},
		Cost: gact.MetricsCost{
			TotalUSD:   1.25,
			ByProvider: map[string]float64{"argonne": 1.25, "local": 0},
		},
		Latencies: latencies,
	}
}

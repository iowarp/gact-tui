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
		"Operations Metrics",
		"Operator snapshot",
		"sessions: 3 total · 2 active",
		"slowest operation: session list · usually 5.6ms · worst 9.1ms · 7 samples",
		"Activity",
		"uptime: 42s",
		"sessions: 3 total · 2 active · idle 1",
		"messages: 9 total · assistant 4 · user 5",
		"Token use",
		"input/output: 100 input · 200 output",
		"cache: 30 read · 40 write",
		"Spend by provider",
		"all providers: $1.2500",
		"argonne: $1.2500",
		"Latency watchlist",
		"session list: usually 5.6ms · worst 9.1ms · 7 samples",
		"Esc close",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("metrics view missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Overview", "\nSessions\n", "\nMessages\n", "\nTokens\n", "Slow operations", "slowest_route", "cache_read", "cache_write", "cost_usd", "p95_ms", "p50 ", "p95 ", "(n="} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("metrics view leaked backend label %q:\n%s", unwanted, out)
		}
	}
}

func TestMetricsLatencyDetailPreservesExactRouteEvidence(t *testing.T) {
	a := newReadyApp(nil, nil)
	route := "GET /v1/sessions/{id}/messages"
	a.openMetricsLatencyDetail(route, gact.MetricsLatencyStat{Count: 3, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 8.9})

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("latency detail should open")
	}
	for _, want := range []string{
		"API latency · GET /v1/sessions/{id}/messages",
		"CLIO latency",
		"operation: message history load",
		"api route: GET /v1/sessions/{id}/messages",
		"count: 3",
		"p95 latency: 5.6 ms",
	} {
		if !strings.Contains(a.detailView.title+"\n"+a.detailView.fullText, want) {
			t.Fatalf("latency detail missing %q:\n%s\n%s", want, a.detailView.title, a.detailView.fullText)
		}
	}
}

func TestMetricsFooterAdvertisesClickableDetails(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{
		Cost: gact.MetricsCost{
			TotalUSD:   2.50,
			ByProvider: map[string]float64{"argonne": 1.25},
		},
		Latencies: map[string]gact.MetricsLatencyStat{
			"GET /v1/sessions": {Count: 7, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 9.1},
		},
	}}

	out := stripANSI(a.viewMetrics())
	if !strings.Contains(out, "Enter/click details") {
		t.Fatalf("metrics footer should advertise keyboard and mouse row details when rows are actionable:\n%s", out)
	}
}

func TestMetricsViewUsesBoundedScrollWindow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 22
	a.metricsOpen = true
	a.metrics = &metricsState{data: denseMetricsForTest()}

	out := stripANSI(a.viewMetrics())
	if strings.Contains(out, "route-12") {
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
	if !strings.Contains(out, "Latency watchlist") || !strings.Contains(out, "route-6: usually 106.0ms") {
		t.Fatalf("bottom-scrolled metrics modal should show final latency rows:\n%s", out)
	}
	if a.metrics.scroll <= 0 {
		t.Fatalf("render should clamp and persist positive metrics scroll, got %d", a.metrics.scroll)
	}
}

func TestMetricsShortSnapshotUsesCompactSharedBodyHeight(t *testing.T) {
	short := newReadyApp(nil, nil)
	short.width, short.height = 150, 44
	short.metricsOpen = true
	short.metrics = &metricsState{data: gact.Metrics{
		UptimeS: 5,
		Sessions: gact.MetricsSessions{
			Total: 1,
		},
	}}
	shortRect := overlayMouseRect(short.viewMetrics(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short metrics top = %d, want shared top row 3", shortRect.y)
	}

	long := newReadyApp(nil, nil)
	long.width, long.height = short.width, short.height
	long.metricsOpen = true
	long.metrics = &metricsState{data: denseMetricsForTest()}
	longRect := overlayMouseRect(long.viewMetrics(), long.width, long.height)
	if shortRect.w != longRect.w {
		t.Fatalf("short metrics width = %d, long metrics width = %d; shared modal width should be stable", shortRect.w, longRect.w)
	}
	if shortRect.h >= longRect.h {
		t.Fatalf("short metrics height = %d, want less than dense metrics height %d", shortRect.h, longRect.h)
	}
	if longRect.y != shortRect.y {
		t.Fatalf("long metrics top = %d, want same top as compact metrics %d", longRect.y, shortRect.y)
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

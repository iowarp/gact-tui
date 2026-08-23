package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestMetricsViewUsesSharedDetailSections(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{
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

	out := stripANSI(a.metrics.view())
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

func TestMetricsViewShowsTUIInteractionLatency(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 42}}
	a.metrics.recordInteractionSample(&tuiInteractionTrace{
		key:      "conversation:click",
		surface:  "conversation",
		kind:     "click",
		targetID: "conversation:part:0:0",
	}, tuiInteractionSample{
		update: 2 * time.Millisecond,
		render: 4 * time.Millisecond,
		total:  15 * time.Millisecond,
	})
	a.metrics.recordInteractionSample(&tuiInteractionTrace{
		key:      "conversation:click",
		surface:  "conversation",
		kind:     "click",
		targetID: "conversation:part:0:0",
	}, tuiInteractionSample{
		update: 3 * time.Millisecond,
		render: 5 * time.Millisecond,
		total:  22 * time.Millisecond,
	})

	out := stripANSI(a.metrics.view())
	for _, want := range []string{
		"slowest TUI surface: conversation click",
		"TUI latency by section",
		"conversation: usually 22.0ms · render 5.0ms · worst 22.0ms · 2 samples · 2 clicks",
		"TUI interaction details",
		"conversation click: usually 22.0ms · render 5.0ms · worst 22.0ms · 2 samples",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("metrics view missing TUI latency text %q:\n%s", want, out)
		}
	}
}

func TestMetricsTUILatencyRowsOpenSharedDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 42}}
	a.metrics.recordInteractionSample(&tuiInteractionTrace{
		key:      "metrics:wheel down",
		surface:  "metrics",
		kind:     "wheel down",
		targetID: "metrics:body:wheel",
	}, tuiInteractionSample{
		update: time.Millisecond,
		render: 6 * time.Millisecond,
		total:  11 * time.Millisecond,
	})

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:tui-latency:metrics:wheel down")
	if !ok {
		t.Fatal("missing TUI latency detail hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("TUI latency detail click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("TUI latency row should open shared detail")
	}
	for _, want := range []string{
		"TUI interaction latency",
		"surface: metrics",
		"input: wheel down",
		"samples: 1",
		"total p95: 11.0ms",
		"render p95: 6.0ms",
		"last hit target: metrics:body:wheel",
	} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("TUI latency detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

func TestMetricsTUILatencySectionRowsOpenSharedDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 42}}
	a.metrics.recordInteractionSample(&tuiInteractionTrace{
		key:         "input:click",
		surface:     "input",
		kind:        "click",
		targetLabel: "input surface",
	}, tuiInteractionSample{
		update: time.Millisecond,
		render: 5 * time.Millisecond,
		total:  13 * time.Millisecond,
	})

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:tui-section-latency:input")
	if !ok {
		t.Fatal("missing TUI section latency detail hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("TUI section latency click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("TUI section latency row should open shared detail")
	}
	for _, want := range []string{
		"TUI section latency · input",
		"TUI latency by section",
		"surface: input",
		"samples: 1",
		"clicks: 1",
		"slowest p95: 13.0ms",
		"slowest render: 5.0ms",
		"labels: input surface",
	} {
		if !strings.Contains(a.detail.ref.title+"\n"+a.detail.ref.fullText, want) {
			t.Fatalf("TUI section latency detail missing %q:\n%s\n%s", want, a.detail.ref.title, a.detail.ref.fullText)
		}
	}
}

func TestMetricsLatencyDetailPreservesExactRouteEvidence(t *testing.T) {
	a := newReadyApp(nil, nil)
	route := "GET /v1/sessions/{id}/messages"
	a.metrics.openLatencyDetail(route, gact.MetricsLatencyStat{Count: 3, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 8.9})

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("latency detail should open")
	}
	for _, want := range []string{
		"API latency · GET /v1/sessions/{id}/messages",
		"GACT latency",
		"operation: message history load",
		"api route: GET /v1/sessions/{id}/messages",
		"count: 3",
		"p95 latency: 5.6 ms",
	} {
		if !strings.Contains(a.detail.ref.title+"\n"+a.detail.ref.fullText, want) {
			t.Fatalf("latency detail missing %q:\n%s\n%s", want, a.detail.ref.title, a.detail.ref.fullText)
		}
	}
}

func TestMetricsFooterAdvertisesClickableDetails(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{
		Cost: gact.MetricsCost{
			TotalUSD:   2.50,
			ByProvider: map[string]float64{"argonne": 1.25},
		},
		Latencies: map[string]gact.MetricsLatencyStat{
			"GET /v1/sessions": {Count: 7, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 9.1},
		},
	}}

	out := stripANSI(a.metrics.view())
	if !strings.Contains(out, "Enter/click details") {
		t.Fatalf("metrics footer should advertise keyboard and mouse row details when rows are actionable:\n%s", out)
	}
}

func TestMetricsViewUsesBoundedScrollWindow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 22
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: denseMetricsForTest()}

	out := stripANSI(a.metrics.view())
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
	out = stripANSI(a.metrics.view())
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
	short.metrics.open = true
	short.metrics.metricsState = metricsState{data: gact.Metrics{
		UptimeS: 5,
		Sessions: gact.MetricsSessions{
			Total: 1,
		},
	}}
	shortRect := overlayMouseRect(short.metrics.view(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short metrics top = %d, want shared top row 3", shortRect.y)
	}

	long := newReadyApp(nil, nil)
	long.width, long.height = short.width, short.height
	long.metrics.open = true
	long.metrics.metricsState = metricsState{data: denseMetricsForTest()}
	longRect := overlayMouseRect(long.metrics.view(), long.width, long.height)
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
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: denseMetricsForTest()}

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
	if a.metrics.scroll != 1 {
		t.Fatalf("wheel down should advance metrics scroll, got %+v", a.metrics.metricsState)
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
	if a.metrics.scroll != 0 {
		t.Fatalf("wheel up should move metrics scroll back, got %+v", a.metrics.metricsState)
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

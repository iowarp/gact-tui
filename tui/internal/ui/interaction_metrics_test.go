package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestMetricsButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 42}}

	_ = a.View()
	refreshTarget, ok := findHitTargetForTest(a, "button:metrics:refresh")
	if !ok {
		t.Fatal("missing semantic metrics refresh target")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:metrics:close")
	if !ok {
		t.Fatal("missing semantic metrics close target")
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      refreshTarget.rect.x,
		Y:      refreshTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("clicking refresh should dispatch a metrics load command")
	}
	if !a.metrics.loading {
		t.Fatalf("clicking refresh should mark metrics loading, got %+v", a.metrics.metricsState)
	}

	_ = a.View()
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      closeTarget.rect.x,
		Y:      closeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking close should not dispatch a command")
	}
	if a.metrics.open {
		t.Fatal("clicking close should close metrics")
	}
}

func TestMetricsWheelUsesBodyRegionOnly(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 18
	a.stage = StageReady
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{
		UptimeS: 42,
		Sessions: gact.MetricsSessions{
			Total:    10,
			Active:   3,
			ByStatus: map[string]int{"idle": 6, "running": 4},
		},
		Messages: gact.MetricsMessages{
			Total:  200,
			ByRole: map[string]int{"assistant": 100, "user": 100},
		},
		Tokens: gact.MetricsTokens{InputTotal: 1000, OutputTotal: 2000},
		Cost:   gact.MetricsCost{TotalUSD: 1.23, ByProvider: map[string]float64{"argonne": 1.23}},
		Latencies: map[string]gact.MetricsLatencyStat{
			"/v1/a": {P50Ms: 1, P95Ms: 2, MaxMs: 3, Count: 4},
			"/v1/b": {P50Ms: 2, P95Ms: 3, MaxMs: 4, Count: 5},
		},
	}}

	_ = a.View()
	body, ok := findHitTargetForTest(a, "metrics:body:wheel")
	if !ok {
		t.Fatal("missing metrics body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      body.rect.x,
		Y:      body.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.metrics.scroll != 1 {
		t.Fatalf("wheel over metrics body should scroll metrics, got %+v", a.metrics.metricsState)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "metrics:surface:wheel")
	if !ok {
		t.Fatal("missing metrics surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.metrics.scroll != 1 {
		t.Fatalf("wheel on metrics chrome should not scroll metrics, got %+v", a.metrics.metricsState)
	}
}

func TestMetricsCostRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{
		Cost: gact.MetricsCost{
			TotalUSD:   2.50,
			ByProvider: map[string]float64{"argonne": 1.25},
		},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:cost:argonne")
	if !ok {
		t.Fatal("missing semantic metrics provider cost target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("metrics cost detail click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("metrics provider cost row should open shared detail")
	}
	for _, want := range []string{"Provider cost", "provider: argonne", "cost: $1.2500", "share: 50.0%", "total cost: $2.5000"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("metrics provider detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
	for _, unwanted := range []string{"cost_usd", "total_cost_usd"} {
		if strings.Contains(a.detail.ref.fullText, unwanted) {
			t.Fatalf("metrics provider detail leaked backend label %q:\n%s", unwanted, a.detail.ref.fullText)
		}
	}
}

func TestMetricsLatencyRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{
		Latencies: map[string]gact.MetricsLatencyStat{
			"GET /v1/sessions": {Count: 7, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 9.1},
		},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:latency:GET /v1/sessions")
	if !ok {
		t.Fatal("missing semantic metrics latency route target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("metrics latency detail click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("metrics latency row should open shared detail")
	}
	for _, want := range []string{"GACT latency", "operation: session list", "api route: GET /v1/sessions", "count: 7", "p50 latency: 1.2 ms", "p95 latency: 5.6 ms", "max latency: 9.1 ms"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("metrics latency detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
	for _, unwanted := range []string{"p50_ms", "p95_ms", "max_ms"} {
		if strings.Contains(a.detail.ref.fullText, unwanted) {
			t.Fatalf("metrics latency detail leaked backend label %q:\n%s", unwanted, a.detail.ref.fullText)
		}
	}
}

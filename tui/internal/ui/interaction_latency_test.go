package ui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
)

func TestTUIInteractionLatencyRecordsClickByHitTargetSurface(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusInput

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing command input hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	_ = a.View()

	summaries := a.tuiInteractionSummaries(10)
	if len(summaries) == 0 {
		t.Fatal("expected at least one TUI interaction latency sample")
	}
	got := summaries[0]
	if got.Surface != "input" || got.Kind != "click" {
		t.Fatalf("sample classified as %s/%s, want input/click", got.Surface, got.Kind)
	}
	if got.Target != "input:command" {
		t.Fatalf("sample target = %q, want input:command", got.Target)
	}
	if got.Count != 1 {
		t.Fatalf("sample count = %d, want 1", got.Count)
	}
	if got.TotalP95 <= 0 || got.RenderP95 <= 0 {
		t.Fatalf("sample should include total and render latency, got total=%s render=%s", got.TotalP95, got.RenderP95)
	}
}

func TestTUILatencyTargetClassificationUsesOperatorSurfaces(t *testing.T) {
	cases := map[string]string{
		"conversation:body:wheel":         "conversation",
		"sidebar:session:s1":              "left sidebar",
		"right-sidebar:files:item:0":      "right sidebar",
		"button:metrics:refresh":          "metrics",
		"metrics:body:wheel":              "metrics",
		"button:detail:copy":              "detail",
		"catalog:item:0":                  "catalog",
		"workspace-switch:item:ws_a":      "workspace switcher",
		"lm-config:provider:0":            "provider setup",
		"agent-blueprints:sources:source": "agent blueprints",
	}
	for id, want := range cases {
		if got := tuiLatencySurfaceForTarget(id); got != want {
			t.Fatalf("target %q classified as %q, want %q", id, got, want)
		}
	}
}

func TestWriteTUIInteractionLatencyReport(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.recordTUIInteractionSample(&tuiInteractionTrace{
		key:      "input:click",
		surface:  "input",
		kind:     "click",
		targetID: "input:command",
	}, tuiInteractionSample{
		update: 2 * time.Millisecond,
		render: 4 * time.Millisecond,
		total:  9 * time.Millisecond,
	})
	a.recordTUIInteractionSample(&tuiInteractionTrace{
		key:      "conversation:wheel down",
		surface:  "conversation",
		kind:     "wheel down",
		targetID: "conversation:body:wheel",
	}, tuiInteractionSample{
		update: time.Millisecond,
		render: 3 * time.Millisecond,
		total:  8 * time.Millisecond,
	})

	reportPath := filepath.Join(t.TempDir(), "nested", "latency.json")
	if err := a.WriteTUIInteractionLatencyReport(reportPath); err != nil {
		t.Fatalf("write report: %v", err)
	}
	raw, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("read report: %v", err)
	}
	var report struct {
		Backend      string `json:"backend"`
		MouseEnabled bool   `json:"mouse_enabled"`
		SampleCount  int    `json:"sample_count"`
		SurfaceCount int    `json:"surface_count"`
		SupportedBy  struct {
			Clicks bool `json:"clicks"`
			Wheels bool `json:"wheels"`
		} `json:"supported_by"`
		Interactions []struct {
			Surface  string  `json:"surface"`
			Kind     string  `json:"kind"`
			Target   string  `json:"last_hit_target"`
			Count    int     `json:"count"`
			TotalP95 float64 `json:"total_p95_ms"`
		} `json:"interactions"`
	}
	if err := json.Unmarshal(raw, &report); err != nil {
		t.Fatalf("decode report: %v\n%s", err, raw)
	}
	if report.Backend != "http://127.0.0.1:18777" || !report.MouseEnabled {
		t.Fatalf("unexpected report header: %+v", report)
	}
	if report.SampleCount != 2 || report.SurfaceCount != 2 {
		t.Fatalf("sample/surface counts = %d/%d, want 2/2", report.SampleCount, report.SurfaceCount)
	}
	if !report.SupportedBy.Clicks || !report.SupportedBy.Wheels {
		t.Fatalf("report should mark click and wheel coverage: %+v", report.SupportedBy)
	}
	seen := map[string]bool{}
	for _, row := range report.Interactions {
		seen[row.Surface+" "+row.Kind] = true
		if row.Count != 1 || row.Target == "" || row.TotalP95 <= 0 {
			t.Fatalf("row missing evidence: %+v", row)
		}
	}
	for _, want := range []string{"input click", "conversation wheel down"} {
		if !seen[want] {
			t.Fatalf("missing interaction %q in report: %+v", want, report.Interactions)
		}
	}
}

package ui

import (
	"testing"

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

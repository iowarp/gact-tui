package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplySemanticEventSummarizesCLIOSemanticToolPayload(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "sem_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"trace_id":     "trace_1",
			"event_type":   "tool.call.completed",
			"status":       "completed",
			"summary":      "Tool NdpSearchDatasets completed.",
			"detail_level": "semantic",
			"actor":        map[string]any{"tool": "NdpSearchDatasets"},
			"subject":      map[string]any{"call_id": "call_1"},
			"payload": map[string]any{
				"tool":             "NdpSearchDatasets",
				"call_id":          "call_1",
				"ok":               true,
				"duration_ms":      42.5,
				"cached":           false,
				"telemetry_source": "live_observer",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeToolResult || part.ToolName != "NdpSearchDatasets" || part.CallID != "call_1" {
		t.Fatalf("semantic tool result = %#v", part)
	}
	if part.DurationMS != 42.5 || part.Metadata["telemetry_source"] != "live_observer" {
		t.Fatalf("semantic tool metadata = %#v", part.Metadata)
	}
}

func TestApplySemanticToolCompletionUsesOperationalFallback(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "completed",
			"actor":      map[string]any{"tool": "sac_compute_trace_statistics"},
			"subject":    map[string]any{"call_id": "call_stats"},
			"payload": map[string]any{
				"tool":         "sac_compute_trace_statistics",
				"call_id":      "call_stats",
				"ok":           true,
				"duration_ms":  18.0,
				"args_preview": "filepath=earthscope_CI_BAR.sac",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.conversation.messages)
	}
	text := flattenToolResult(a.conversation.messages[0].Parts[0])
	for _, want := range []string{"SAC trace statistics completed", "18ms", "args: filepath=earthscope_CI_BAR.sac"} {
		if !strings.Contains(text, want) {
			t.Fatalf("semantic fallback missing %q: %q", want, text)
		}
	}
	if strings.TrimSpace(text) == "completed" {
		t.Fatalf("semantic fallback should not be bare completed: %#v", a.conversation.messages[0].Parts[0])
	}
}

func TestApplySemanticToolCompletionSummarizesDirectPayloadEvidence(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_stats",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "Tool sac_compute_trace_statistics completed.",
			"payload": map[string]any{
				"tool":        "sac_compute_trace_statistics",
				"call_id":     "call_stats",
				"ok":          true,
				"duration_ms": 18.0,
				"filepath":    "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_CI_BAR.sac",
				"npts":        12000,
				"min":         -0.14,
				"max":         0.19,
				"mean":        0.003,
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.conversation.messages)
	}
	text := flattenToolResult(a.conversation.messages[0].Parts[0])
	for _, want := range []string{"SAC evidence:", "npts: 12000", "min: -0.14", "max: 0.19", "mean: 0.003", "earthscope_CI_BAR.sac"} {
		if !strings.Contains(text, want) {
			t.Fatalf("direct semantic payload summary missing %q:\n%s", want, text)
		}
	}
	for _, unwanted := range []string{"Tool sac_compute_trace_statistics completed", "args:"} {
		if strings.Contains(text, unwanted) {
			t.Fatalf("direct semantic payload summary kept generic/noisy text %q:\n%s", unwanted, text)
		}
	}
}

func TestApplySemanticToolCompletionSummarizesDirectArtifactEvidence(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_plot",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "sac_plot_traces completed",
			"payload": map[string]any{
				"tool":           "sac_plot_traces",
				"call_id":        "call_plot",
				"ok":             true,
				"duration_ms":    5.0,
				"artifact_path":  "/home/jcernuda/DemoBench/sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
				"traces_plotted": 3,
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.conversation.messages)
	}
	text := flattenToolResult(a.conversation.messages[0].Parts[0])
	for _, want := range []string{"SAC evidence:", "sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png", "traces_plotted: 3"} {
		if !strings.Contains(text, want) {
			t.Fatalf("direct artifact payload summary missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "sac_plot_traces completed") {
		t.Fatalf("direct artifact payload summary kept generic completion:\n%s", text)
	}
}

func TestApplySemanticToolStartedHidesRedactedArgsInline(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.started",
			"status":     "running",
			"actor":      map[string]any{"tool": "sac_plot_traces"},
			"subject":    map[string]any{"call_id": "call_plot"},
			"payload": map[string]any{
				"tool":    "sac_plot_traces",
				"call_id": "call_plot",
				"args":    "[redacted]",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool call message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeToolCall || part.ToolName != "sac_plot_traces" {
		t.Fatalf("semantic tool call = %#v", part)
	}
	if got := ansi.Strip(DefaultTheme().renderPart(part, 80)); strings.Contains(got, "input redacted by runtime") || strings.Contains(got, "[redacted]") {
		t.Fatalf("redacted tool call should keep absent args out of the inline row: %q", got)
	}
	if got := ansi.Strip(DefaultTheme().renderPart(part, 80)); !strings.Contains(got, "running") {
		t.Fatalf("running semantic tool call should show progress state inline: %q", got)
	}
	if part.Metadata["args_preview"] != "input redacted by runtime" {
		t.Fatalf("args preview metadata = %#v", part.Metadata["args_preview"])
	}
}

func TestApplySemanticToolCompletionHidesRedactedArgsInline(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "completed",
			"payload": map[string]any{
				"tool":        "sac_plot_traces",
				"call_id":     "call_plot",
				"ok":          true,
				"duration_ms": 5.0,
				"args":        "[redacted]",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool result message = %#v", a.conversation.messages)
	}
	text := flattenToolResult(a.conversation.messages[0].Parts[0])
	for _, want := range []string{"SAC waveform visualization completed", "5ms"} {
		if !strings.Contains(text, want) {
			t.Fatalf("redacted completion missing %q: %q", want, text)
		}
	}
	if strings.Contains(text, "input redacted by runtime") || strings.Contains(text, "[redacted]") {
		t.Fatalf("redacted completion should keep absent args out of the inline row: %q", text)
	}
}

func TestApplySemanticToolCompletionPrefersPayloadResultSummary(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "completed",
			"payload": map[string]any{
				"tool":    "ndp_search_datasets",
				"call_id": "call_ndp",
				"ok":      true,
				"result": map[string]any{
					"datasets": []any{"earthscope-waveforms", "ucr-seis"},
					"count":    2,
				},
			},
		}},
	})

	text := flattenToolResult(a.conversation.messages[0].Parts[0])
	if strings.TrimSpace(text) == "completed" {
		t.Fatalf("semantic result payload should replace bare completion: %#v", a.conversation.messages[0].Parts[0])
	}
	if !strings.Contains(text, "count: 2") {
		t.Fatalf("semantic result payload summary missing compact result evidence: %q", text)
	}
}

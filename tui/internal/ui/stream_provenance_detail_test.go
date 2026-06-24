package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSemanticEventDetailShowsStructuredLiveProvenance(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		ID:   "sem_1",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_1",
			"session_id":     "s1",
			"workspace_id":   "ws_1",
			"trace_id":       "trace_1",
			"turn_id":        "turn_1",
			"span_id":        "span_tool",
			"parent_span_id": "span_delegate",
			"event_type":     "tool.call.completed",
			"status":         "completed",
			"summary":        "NDP catalog search completed.",
			"detail_level":   "semantic",
			"live_observed":  true,
			"occurred_at":    "2026-06-03T06:00:00Z",
			"actor":          map[string]any{"agent_id": "ndp_catalog", "role": "child_expert", "tool": "ndp_search_datasets"},
			"subject":        map[string]any{"call_id": "call_1", "agent_id": "ndp_catalog"},
			"blueprint":      map[string]any{"pack_id": "seismic", "pack_version": "1.0.0"},
			"provider":       map[string]any{"provider_id": "alcf", "model_id": "sophia"},
			"payload": map[string]any{
				"tool":             "ndp_search_datasets",
				"call_id":          "call_1",
				"ok":               true,
				"duration_ms":      42.0,
				"cached":           false,
				"telemetry_source": "live_observer",
				"args_preview":     "search_terms=seismic",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic event message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeToolResult {
		t.Fatalf("semantic tool event should render as tool result: %#v", part)
	}
	ref := partDetailRef(a.conversation.messages[0].ID, a.conversation.messages[0].Parts[0])
	if ref.title != "NDP catalog search result" {
		t.Fatalf("semantic event detail title = %q, want operator-facing tool label", ref.title)
	}
	for _, want := range []string{
		"Operator view",
		"result: NDP catalog search completed",
		"agent: ndp catalog",
		"tool: NDP catalog search",
		"workflow: seismic",
		"duration: 42ms",
		"input: search_terms=seismic",
		"model: sophia",
		"Event summary",
		"what happened: NDP catalog search completed",
		"status: completed",
		"event: tool.call.completed",
		"stream: live",
		"Workflow trace",
		"format: clio.semantic_event.v1",
		"trace: trace_1",
		"turn: turn_1",
		"span: span_tool",
		"parent span: span_delegate",
		"Technical trace",
		"Actor",
		"agent: ndp_catalog",
		"tool: ndp_search_datasets",
		"Subject",
		"call: call_1",
		"Blueprint",
		"pack: seismic",
		"Provider",
		"provider: alcf",
		"Tool evidence",
		"duration: 42",
		"telemetry: live_observer",
		"input: search_terms=seismic",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("semantic event detail missing %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{
		"raw_event",
		"stream_source",
		"semantic_event:",
		"Payload",
		"args preview:",
		"schema_version:",
		"event_type:",
		"trace_id:",
		"turn_id:",
		"span_id:",
		"parent_span_id:",
		"live_observed:",
		"agent_id:",
		"call_id:",
		"pack_id:",
		"provider_id:",
		"duration_ms:",
		"telemetry_source:",
		"args_preview:",
	} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("semantic event detail should not repeat transport metadata %q:\n%s", unwanted, ref.fullText)
		}
	}
}

func TestSemanticEventDetailUsesReadableControlIntent(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_delegate_detail",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "blueprint.delegation.completed",
			"status":         "completed",
			"summary":        "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces /workspace/tmp/earthscope_CI_BAR.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"blueprint":      map[string]any{"pack_id": "seismic-waveform-review"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 1200.0,
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic event message = %#v", a.conversation.messages)
	}
	ref := partDetailRef(a.conversation.messages[0].ID, a.conversation.messages[0].Parts[0])
	for _, want := range []string{
		"Operator view",
		"result: analysis returned evidence to main · next: visualization - plot SAC traces",
		"Event summary",
		"what happened: analysis returned evidence to main · next: visualization - plot SAC traces",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("semantic detail missing readable intent %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "NEXT_ACTION", "DO_NOT_FINALIZE", "/workspace/tmp/earthscope_CI_BAR.sac"} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("semantic detail leaked control contract %q:\n%s", unwanted, ref.fullText)
		}
	}
	if strings.Contains(ref.fullText, "tool: Tool") {
		t.Fatalf("semantic delegation detail should not invent a generic tool row:\n%s", ref.fullText)
	}
}

func TestSemanticEventDetailCanExposeRawEventBehindDebugFlag(t *testing.T) {
	t.Setenv("GACT_SEMANTIC_RAW_EVENT_DETAIL", "1")
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_delegate_raw",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "blueprint.delegation.completed",
			"status":         "completed",
			"summary":        "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces /workspace/tmp/earthscope_CI_BAR.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"actor":          map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 1200.0,
			},
		}},
	})

	ref := partDetailRef(a.conversation.messages[0].ID, a.conversation.messages[0].Parts[0])
	for _, want := range []string{
		"result: analysis returned evidence to main · next: visualization - plot SAC traces",
		"Raw semantic event:",
		`"event_type": "blueprint.delegation.completed"`,
		"NEXT_EXPERT: visualization",
		"DO_NOT_FINALIZE_BEFORE_VISUALIZATION",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("debug semantic detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

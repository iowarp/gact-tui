package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplyPartDeltaPreservesStreamProvenance(t *testing.T) {
	a := New("http://unused")
	a.messages = []gact.Message{{
		ID: "msg_1",
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
		}},
	}}

	a.applyPartDelta(client.SSEEvent{
		Type: "message.part.delta",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id":      "msg_1",
				"part_id":         "part_1",
				"stream_source":   "synthetic_posthoc",
				"stream_fallback": map[string]any{"reason": "sync_execution_path"},
				"delta":           map[string]any{"text_append": "hello"},
			},
		},
	})

	part := a.messages[0].Parts[0]
	if part.Text != "hello" {
		t.Fatalf("text = %q, want hello", part.Text)
	}
	if part.Metadata["stream_source"] != "synthetic_posthoc" {
		t.Fatalf("stream_source = %#v", part.Metadata["stream_source"])
	}
	fallback, ok := part.Metadata["stream_fallback"].(map[string]any)
	if !ok || fallback["reason"] != "sync_execution_path" {
		t.Fatalf("stream_fallback = %#v", part.Metadata["stream_fallback"])
	}
}

func TestApplyPartAddedPreservesPosthocTextProvenance(t *testing.T) {
	a := New("http://unused")
	a.messages = []gact.Message{{ID: "msg_1"}}

	a.applyPartAdded(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id": "msg_1",
				"part": map[string]any{
					"id":   "part_1",
					"type": "text",
					"text": "complete answer text",
					"metadata": map[string]any{
						"stream_source":   "synthetic_posthoc",
						"stream_fallback": map[string]any{"reason": "stream_completed_without_chunks"},
					},
				},
			},
		},
	})

	part := a.messages[0].Parts[0]
	if part.Text != "complete answer text" {
		t.Fatalf("text = %q, want completed answer text", part.Text)
	}
	if part.Metadata["stream_source"] != "synthetic_posthoc" {
		t.Fatalf("stream_source = %#v", part.Metadata["stream_source"])
	}
	fallback, ok := part.Metadata["stream_fallback"].(map[string]any)
	if !ok || fallback["reason"] != "stream_completed_without_chunks" {
		t.Fatalf("stream_fallback = %#v", part.Metadata["stream_fallback"])
	}
}

func TestRenderPartShowsPosthocTextProvenance(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeText,
		Text: "real answer text",
		Metadata: map[string]any{
			"stream_source":   "synthetic_posthoc",
			"stream_fallback": map[string]any{"reason": "agent_not_streamable"},
		},
	}

	got := DefaultTheme().renderPart(part, 80)
	if !strings.Contains(got, "post-hoc text: agent_not_streamable") {
		t.Fatalf("rendered part did not expose post-hoc provenance: %q", got)
	}
	if !strings.Contains(got, "real answer text") {
		t.Fatalf("rendered part lost answer text: %q", got)
	}
}

func TestRenderPartDoesNotBadgeLiveStream(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeText,
		Text: "live answer text",
		Metadata: map[string]any{
			"stream_source": "live",
		},
	}

	got := DefaultTheme().renderPart(part, 80)
	if strings.Contains(got, "post-hoc text") {
		t.Fatalf("live stream should not render post-hoc badge: %q", got)
	}
}

func TestApplySemanticEventAddsLiveTimelinePart(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		ID:   "7",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"trace_id":     "trace_1",
			"event_type":   "agent.invocation.started",
			"status":       "running",
			"summary":      "Agent data started.",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent": "data"},
		}},
	})

	if len(a.messages) != 1 {
		t.Fatalf("messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeThinking || !strings.Contains(part.Thinking, "agent.invocation.started") || !strings.Contains(part.Thinking, "agent=data") {
		t.Fatalf("semantic part = %#v", part)
	}
	if part.Metadata["semantic_event"] != true || part.Metadata["trace_id"] != "trace_1" {
		t.Fatalf("semantic metadata = %#v", part.Metadata)
	}
}

func TestApplyToolCallEventsAddLiveToolPartsAndDeduplicateMirroredParts(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "tool.call.started",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"call_id":    "call_1",
			"tool":       "ndp_search_datasets",
			"args":       map[string]any{"search_terms": "seismic"},
		}},
	})
	a.applySSE(client.SSEEvent{
		Type: "tool.call.completed",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":       "s1",
			"turn_id":          "turn_1",
			"call_id":          "call_1",
			"tool":             "ndp_search_datasets",
			"ok":               true,
			"duration_ms":      42.0,
			"summary":          "completed",
			"telemetry_source": "live_observer",
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 2 {
		t.Fatalf("live tool parts = %#v", a.messages)
	}
	if a.messages[0].Parts[0].Type != gact.PartTypeToolCall || a.messages[0].Parts[1].Type != gact.PartTypeToolResult {
		t.Fatalf("unexpected live parts = %#v", a.messages[0].Parts)
	}
	if a.messages[0].Parts[1].IsError {
		t.Fatalf("explicit ok=true should not render as an error: %#v", a.messages[0].Parts[1])
	}

	a.messages = append(a.messages, gact.Message{ID: "msg_1", SessionID: "s1", Role: gact.RoleAssistant})
	a.applySSE(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"message_id": "msg_1",
			"part": map[string]any{
				"id":        "real_call",
				"type":      "tool_call",
				"call_id":   "call_1",
				"tool_name": "ndp_search_datasets",
				"input":     map[string]any{"search_terms": "seismic"},
			},
		}},
	})

	if a.hasToolPart("call_1", gact.PartTypeToolResult) {
		t.Fatalf("synthetic semantic result should be removed after mirrored tool part: %#v", a.messages)
	}
	if !a.hasToolPart("call_1", gact.PartTypeToolCall) {
		t.Fatalf("mirrored tool call should remain: %#v", a.messages)
	}
}

func TestApplyToolCallCompletedWithoutOkDoesNotAssumeError(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "tool.call.completed",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"call_id":    "call_1",
			"tool":       "read_file",
			"summary":    "completed",
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("live result = %#v", a.messages)
	}
	if part := a.messages[0].Parts[0]; part.IsError {
		t.Fatalf("missing ok should not imply error unless an error field is present: %#v", part)
	}
}

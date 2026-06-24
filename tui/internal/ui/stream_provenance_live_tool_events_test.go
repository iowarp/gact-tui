package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSemanticLiveMessageLabelsToolProgressAsAssistantTurn(t *testing.T) {
	msg := gact.Message{
		ID:   "semantic_live_turn",
		Role: gact.RoleAssistant,
		Metadata: map[string]any{
			"semantic_live_message": true,
		},
		Parts: []gact.Part{{
			Type:     gact.PartTypeToolCall,
			ToolName: "sac_plot_traces",
			Metadata: map[string]any{
				"args_preview": "input redacted by runtime",
			},
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 90, nil))
	if strings.Contains(out, "● ASSISTANT") {
		t.Fatalf("semantic live transcript should not create a second assistant header:\n%s", out)
	}
	if strings.Contains(out, "◆ TOOL ACTIVITY") || strings.Contains(out, "WORKFLOW ACTIVITY") {
		t.Fatalf("semantic live transcript should not create a separate pseudo-role:\n%s", out)
	}
	if strings.Contains(out, "input redacted by runtime") {
		t.Fatalf("semantic live transcript should not advertise redacted input:\n%s", out)
	}
	if !strings.Contains(out, "SAC waveform visualization()") {
		t.Fatalf("semantic live transcript lost tool call summary:\n%s", out)
	}
}

func TestSemanticLiveMessageLabelsMixedWorkflowProgress(t *testing.T) {
	msg := gact.Message{
		ID:   "semantic_live_turn",
		Role: gact.RoleAssistant,
		Metadata: map[string]any{
			"semantic_live_message": true,
		},
		Parts: []gact.Part{{
			Type:     gact.PartTypeExpertHandoff,
			Text:     "main delegated to analysis",
			Metadata: map[string]any{"agent_id": "analysis", "parent_id": "main"},
		}, {
			Type:     gact.PartTypeToolCall,
			ToolName: "sac_plot_traces",
			Metadata: map[string]any{"args_preview": "input redacted by runtime"},
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 90, nil))
	if strings.Contains(out, "● ASSISTANT") {
		t.Fatalf("mixed semantic live transcript should not create a second assistant header:\n%s", out)
	}
	if strings.Contains(out, "◆ TOOL ACTIVITY") || strings.Contains(out, "WORKFLOW ACTIVITY") {
		t.Fatalf("mixed semantic live transcript should not create a separate pseudo-role:\n%s", out)
	}
}

func TestSemanticToolEventsRenderNestedUnderInvokingAgent(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	base := map[string]any{
		"schema_version": "clio.semantic_event.v1",
		"session_id":     "s1",
		"turn_id":        "turn_1",
		"trace_id":       "trace_1",
		"actor":          map[string]any{"agent_id": "ndp_catalog", "role": "child_expert"},
		"subject":        map[string]any{"call_id": "call_1", "agent_id": "ndp_catalog"},
		"payload": map[string]any{
			"tool":             "ndp_search_datasets",
			"call_id":          "call_1",
			"telemetry_source": "live_observer",
			"args":             map[string]any{"search_terms": "seismic waveform"},
		},
	}
	started := map[string]any{}
	for k, v := range base {
		started[k] = v
	}
	started["event_id"] = "tool_started_1"
	started["event_type"] = "tool.call.started"
	started["status"] = "running"
	a.conversation.applySSE(client.SSEEvent{Type: "semantic.event", Payload: map[string]any{"payload": started}})

	completed := map[string]any{}
	for k, v := range base {
		completed[k] = v
	}
	completed["event_id"] = "tool_completed_1"
	completed["event_type"] = "tool.call.completed"
	completed["status"] = "completed"
	completed["summary"] = "completed"
	completed["payload"] = map[string]any{
		"tool":        "ndp_search_datasets",
		"call_id":     "call_1",
		"duration_ms": 42.0,
		"result": map[string]any{
			"datasets": map[string]any{"items": []any{map[string]any{
				"title": "Southern California seismic waveform archive",
				"id":    "00d66104",
			}}},
		},
	}
	a.conversation.applySSE(client.SSEEvent{Type: "semantic.event", Payload: map[string]any{"payload": completed}})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 2 {
		t.Fatalf("semantic tool parts = %#v", a.conversation.messages)
	}
	for _, part := range a.conversation.messages[0].Parts {
		if got := stringValue(part.Metadata["agent_id"]); got != "ndp_catalog" {
			t.Fatalf("semantic tool part agent_id = %q; part=%#v", got, part)
		}
	}
	out := ansi.Strip(DefaultTheme().renderMessage(a.conversation.messages[0], 120))
	lines := strings.Split(out, "\n")
	var callLine, resultLine string
	for _, line := range lines {
		if strings.Contains(line, "NDP catalog search") {
			callLine = line
		}
		if strings.Contains(line, "datasets:") {
			resultLine = line
		}
	}
	if !strings.HasPrefix(callLine, "  ") {
		t.Fatalf("tool call should be nested under invoking agent, line=%q\n%s", callLine, out)
	}
	if !strings.HasPrefix(resultLine, "  ") {
		t.Fatalf("tool result should be nested under invoking agent, line=%q\n%s", resultLine, out)
	}
	if strings.Contains(out, `"datasets"`) || strings.Contains(out, "raw_event") {
		t.Fatalf("semantic tool render should remain operator-facing:\n%s", out)
	}
}

func TestApplyToolCallEventsAddLiveToolPartsAndDeduplicateMirroredParts(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "tool.call.started",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"call_id":    "call_1",
			"tool":       "ndp_search_datasets",
			"args":       map[string]any{"search_terms": "seismic"},
		}},
	})
	a.conversation.applySSE(client.SSEEvent{
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

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 2 {
		t.Fatalf("live tool parts = %#v", a.conversation.messages)
	}
	if a.conversation.messages[0].Parts[0].Type != gact.PartTypeToolCall || a.conversation.messages[0].Parts[1].Type != gact.PartTypeToolResult {
		t.Fatalf("unexpected live parts = %#v", a.conversation.messages[0].Parts)
	}
	if a.conversation.messages[0].Parts[1].IsError {
		t.Fatalf("explicit ok=true should not render as an error: %#v", a.conversation.messages[0].Parts[1])
	}
	out := ansi.Strip(DefaultTheme().renderMessage(a.conversation.messages[0], 120))
	if strings.Contains(out, "running now") {
		t.Fatalf("paired same-message tool result should clear running status:\n%s", out)
	}
	if !strings.Contains(out, "NDP catalog search") || !strings.Contains(out, "completed") {
		t.Fatalf("paired tool call/result should still render useful evidence:\n%s", out)
	}

	a.conversation.messages = append(a.conversation.messages, gact.Message{ID: "msg_1", SessionID: "s1", Role: gact.RoleAssistant})
	a.conversation.applySSE(client.SSEEvent{
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

	if a.conversation.hasToolPart("call_1", gact.PartTypeToolResult) {
		t.Fatalf("synthetic semantic result should be removed after mirrored tool part: %#v", a.conversation.messages)
	}
	if !a.conversation.hasToolPart("call_1", gact.PartTypeToolCall) {
		t.Fatalf("mirrored tool call should remain: %#v", a.conversation.messages)
	}
	for _, msg := range a.conversation.messages {
		for _, part := range msg.Parts {
			if part.CallID == "call_1" && part.Type == gact.PartTypeToolCall {
				if got := ansi.Strip(DefaultTheme().renderPart(part, 80)); !strings.Contains(got, "running") {
					t.Fatalf("mirrored live tool call should show running state before result: %q", got)
				}
				return
			}
		}
	}
	t.Fatalf("mirrored tool call not found: %#v", a.conversation.messages)
}

func TestApplyToolCallCompletedWithoutOkDoesNotAssumeError(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "tool.call.completed",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"call_id":    "call_1",
			"tool":       "read_file",
			"summary":    "completed",
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("live result = %#v", a.conversation.messages)
	}
	if part := a.conversation.messages[0].Parts[0]; part.IsError {
		t.Fatalf("missing ok should not imply error unless an error field is present: %#v", part)
	} else if text := flattenToolResult(part); text != "ReadFile completed" {
		t.Fatalf("missing ok fallback text = %q, want tool-specific completion", text)
	}
}

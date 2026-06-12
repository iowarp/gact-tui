package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

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

func TestRenderBodySuppressesEmptyAssistantShells(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{
			ID:        "m_empty",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
		},
		{
			ID:        "m_answer",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Parts:     []gact.Part{{ID: "p_answer", Type: gact.PartTypeText, Text: "real answer"}},
		},
	}

	out := ansi.Strip(a.View().Content)
	if strings.Contains(out, "(no parts)") {
		t.Fatalf("empty assistant shell should be hidden:\n%s", out)
	}
	if !strings.Contains(out, "real answer") {
		t.Fatalf("non-empty answer should still render:\n%s", out)
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
	if part.Type != gact.PartTypeExpertHandoff || part.Text != "Agent data started." || part.Metadata["agent_id"] != "data" {
		t.Fatalf("semantic part = %#v", part)
	}
	if part.Metadata["semantic_event"] != true || part.Metadata["trace_id"] != "trace_1" {
		t.Fatalf("semantic metadata = %#v", part.Metadata)
	}
}

func TestApplyNotificationSSESurfacesGlobalEventsWithoutSessionID(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.messages = []gact.Message{{
		ID:        "existing",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "keep me"}},
	}}

	a.applySSE(client.SSEEvent{
		Type: "notification",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "",
			"level":      "info",
			"title":      "MCP server reconnected",
			"body":       "mcp_docs",
		}},
	})

	if got := a.transientHint; !strings.Contains(got, "info: MCP connection reconnected") || !strings.Contains(got, "mcp_docs") {
		t.Fatalf("global notification hint = %q", got)
	}
	if len(a.messages) != 1 || a.messages[0].Parts[0].Text != "keep me" {
		t.Fatalf("notification should not mutate transcript messages: %#v", a.messages)
	}

	a.applySSE(client.SSEEvent{
		Type: "notification",
		Payload: map[string]any{"payload": map[string]any{
			"level": "warning",
			"title": "Provider degraded",
		}},
	})

	if got := a.transientHint; got != "warning: Provider degraded" {
		t.Fatalf("missing-session notification hint = %q", got)
	}
}

func TestApplySemanticEventSurfacesGlobalEventsWithoutSessionID(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		ID:   "global-provider",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":   "",
			"turn_id":      "turn_global",
			"trace_id":     "trace_global",
			"event_type":   "provider.degraded",
			"status":       "warning",
			"summary":      "Provider degraded.",
			"detail_level": "semantic",
			"actor":        map[string]any{"provider": "openai"},
			"payload": map[string]any{
				"reason": "rate limited",
			},
		}},
	})

	if len(a.messages) != 1 || a.messages[0].SessionID != "s1" || len(a.messages[0].Parts) != 1 {
		t.Fatalf("global semantic event should surface on current session: %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "provider.degraded" || part.Message != "Provider degraded." {
		t.Fatalf("global semantic summary = %#v", part)
	}
	if part.Metadata["trace_id"] != "trace_global" || part.Metadata["status"] != "warning" {
		t.Fatalf("global semantic metadata = %#v", part.Metadata)
	}
}

func TestApplySemanticEventSummarizesCLIOSemanticToolPayload(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeToolResult || part.ToolName != "NdpSearchDatasets" || part.CallID != "call_1" {
		t.Fatalf("semantic tool result = %#v", part)
	}
	if part.DurationMS != 42.5 || part.Metadata["telemetry_source"] != "live_observer" {
		t.Fatalf("semantic tool metadata = %#v", part)
	}
}

func TestApplySemanticToolCompletionUsesOperationalFallback(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.messages)
	}
	text := flattenToolResult(a.messages[0].Parts[0])
	for _, want := range []string{"SAC trace statistics completed", "18ms", "args: filepath=earthscope_CI_BAR.sac"} {
		if !strings.Contains(text, want) {
			t.Fatalf("semantic fallback missing %q: %q", want, text)
		}
	}
	if strings.TrimSpace(text) == "completed" {
		t.Fatalf("semantic fallback should not be bare completed: %#v", a.messages[0].Parts[0])
	}
}

func TestApplySemanticToolCompletionSummarizesDirectPayloadEvidence(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.messages)
	}
	text := flattenToolResult(a.messages[0].Parts[0])
	for _, want := range []string{"sac result:", "npts: 12000", "min: -0.14", "max: 0.19", "mean: 0.003", "earthscope_CI_BAR.sac"} {
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
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool message = %#v", a.messages)
	}
	text := flattenToolResult(a.messages[0].Parts[0])
	for _, want := range []string{"sac result:", "sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png", "traces_plotted: 3"} {
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
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool call message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
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
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic tool result message = %#v", a.messages)
	}
	text := flattenToolResult(a.messages[0].Parts[0])
	for _, want := range []string{"SAC waveform visualization completed", "5ms"} {
		if !strings.Contains(text, want) {
			t.Fatalf("redacted completion missing %q: %q", want, text)
		}
	}
	if strings.Contains(text, "input redacted by runtime") || strings.Contains(text, "[redacted]") {
		t.Fatalf("redacted completion should keep absent args out of the inline row: %q", text)
	}
}

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
	if !strings.Contains(out, "● ASSISTANT") {
		t.Fatalf("semantic live transcript should stay inside the assistant turn:\n%s", out)
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
	if !strings.Contains(out, "● ASSISTANT") {
		t.Fatalf("mixed semantic live transcript should stay inside the assistant turn:\n%s", out)
	}
	if strings.Contains(out, "◆ TOOL ACTIVITY") || strings.Contains(out, "WORKFLOW ACTIVITY") {
		t.Fatalf("mixed semantic live transcript should not create a separate pseudo-role:\n%s", out)
	}
}

func TestApplySemanticToolCompletionPrefersPayloadResultSummary(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	text := flattenToolResult(a.messages[0].Parts[0])
	if strings.TrimSpace(text) == "completed" {
		t.Fatalf("semantic result payload should replace bare completion: %#v", a.messages[0].Parts[0])
	}
	if !strings.Contains(text, "count: 2") {
		t.Fatalf("semantic result payload summary missing compact result evidence: %q", text)
	}
}

func TestApplySemanticEventRendersDelegationAsReadableHandoff(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "resume_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"trace_id":     "trace_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces",
			"detail_level": "semantic",
			"actor": map[string]any{
				"kind":     "agent",
				"agent_id": "analysis",
				"role":     "child_expert",
			},
			"subject": map[string]any{
				"agent_id": "main",
				"role":     "parent_expert",
			},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 20353,
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeExpertHandoff || part.Metadata["parent_id"] != "main" || part.Metadata["agent_id"] != "analysis" {
		t.Fatalf("delegation part = %#v", part)
	}
	if strings.Contains(part.Text, "NEXT_EXPERT") || !strings.Contains(part.Text, "analysis returned") {
		t.Fatalf("delegation text should be user-facing: %#v", part)
	}
}

func TestApplySemanticEventSummarizesContractOnlyDelegation(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_contract_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.started",
			"status":       "running",
			"summary":      "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback DO_NOT_DELEGATE_DATA_AGAIN: true",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "main",
				"agent_id":  "analysis",
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Text != "main handed work to analysis · next: analysis - run SAC fallback" {
		t.Fatalf("contract-only delegation summary = %#v", part)
	}
	if strings.Contains(part.Text, "NEXT_EXPERT") || strings.Contains(part.Text, "DO_NOT_DELEGATE") {
		t.Fatalf("delegation leaked control contract: %#v", part)
	}
}

func TestApplySemanticEventKeepsNextActionFromStrippedContract(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_next_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces /home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 20353,
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	for _, want := range []string{"analysis returned evidence to main", "next: visualization - plot SAC traces"} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("next-action delegation summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "NEXT_ACTION", "DO_NOT_FINALIZE", "clio-seismic-staging"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("delegation leaked control contract %q: %#v", unwanted, part)
		}
	}
}

func TestApplySemanticEventDropsDuplicateWorkflowRowsAcrossToolUpdates(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	event := func(eventID, summary string) client.SSEEvent {
		return client.SSEEvent{
			Type: "semantic.event",
			Payload: map[string]any{"payload": map[string]any{
				"event_id":     eventID,
				"session_id":   "s1",
				"turn_id":      "turn_1",
				"event_type":   "blueprint.delegation.completed",
				"status":       "completed",
				"summary":      summary,
				"detail_level": "semantic",
				"actor":        map[string]any{"agent_id": "analysis", "role": "child_expert"},
				"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
				"payload": map[string]any{
					"stage":       "delegate.completed",
					"parent_id":   "main",
					"agent_id":    "analysis",
					"duration_ms": 20353,
				},
			}},
		}
	}

	a.applySSE(event("delegate_done_1", "analysis returned a compact result to main."))
	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "sem_stats",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "tool.call.completed",
			"status":     "completed",
			"summary":    "Tool sac_compute_trace_statistics completed.",
			"payload": map[string]any{
				"tool":    "sac_compute_trace_statistics",
				"call_id": "call_stats",
				"npts":    12000,
			},
		}},
	})
	a.applySSE(event("delegate_done_2", "analysis returned a compact result to main."))
	a.applySSE(event("delegate_next_1", "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces"))

	if len(a.messages) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	parts := a.messages[0].Parts
	if len(parts) != 3 {
		t.Fatalf("duplicate semantic workflow row should be collapsed, got %d parts: %#v", len(parts), parts)
	}
	if parts[0].Text != "analysis returned evidence to main." {
		t.Fatalf("first workflow row = %#v", parts[0])
	}
	if parts[1].Type != gact.PartTypeToolResult || !strings.Contains(flattenToolResult(parts[1]), "npts: 12000") {
		t.Fatalf("interleaved tool result should still render: %#v", parts[1])
	}
	if !strings.Contains(parts[2].Text, "next: visualization - plot SAC traces") {
		t.Fatalf("distinct workflow step should still render: %#v", parts[2])
	}
	if parts[0].Metadata["semantic_duplicate_key"] == "" || parts[2].Metadata["semantic_duplicate_key"] == "" {
		t.Fatalf("semantic duplicate keys should be recorded for workflow rows: %#v", parts)
	}
}

func TestApplySemanticEventPrioritizesReadableBlockerFromContract(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_blocker_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window Blocker: resource_too_large - dataset ID 00d66104-dcb0-4381-86b4-fc62f08b3434, resource size 1503238553 bytes",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":     "delegate.completed",
				"parent_id": "main",
				"agent_id":  "data",
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	for _, want := range []string{"data returned evidence to main", "blocked: resource too large - dataset ID 00d66104-dcb0-4381-86b4-fc62f08b3434"} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("blocker delegation summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"NEXT_EXPERT", "NEXT_ACTION", "Blocker:", "resource_too_large"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("blocker delegation leaked raw contract %q: %#v", unwanted, part)
		}
	}

	ref := partDetailRef(a.messages[0].ID, part)
	if !strings.Contains(ref.fullText, "what happened: data returned evidence to main · blocked: resource too large") {
		t.Fatalf("blocker detail missing readable summary:\n%s", ref.fullText)
	}
	if strings.Contains(ref.fullText, "NEXT_ACTION") || strings.Contains(ref.fullText, "Blocker:") {
		t.Fatalf("blocker detail leaked raw contract:\n%s", ref.fullText)
	}
}

func TestApplySemanticEventHumanizesPlumbingDelegationSummary(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_sync_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.started",
			"status":       "running",
			"summary":      "main delegated sync work to visualization.",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":      map[string]any{"agent_id": "visualization", "role": "child_expert"},
			"payload":      map[string]any{"stage": "delegate.started"},
		}},
	})

	part := a.messages[0].Parts[0]
	if part.Text != "main handed work to visualization." || part.Metadata["parent_id"] != "main" || part.Metadata["agent_id"] != "visualization" {
		t.Fatalf("plumbing delegation summary = %#v", part)
	}
}

func TestApplySemanticEventRendersWorkflowStateSummaryInline(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_state_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary":    "analysis returned a compact result to main.",
			"actor":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":    map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 1200,
				"workflow_state": map[string]any{
					"acquisition": map[string]any{
						"status":     "staged",
						"dataset_id": "00d66104-dcb0-4381-86b4-fc62f08b3434",
					},
					"artifact": map[string]any{
						"status":        "ready",
						"artifact_path": "sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
					},
				},
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if got := stringValue(part.Metadata["workflow_summary"]); !strings.Contains(got, "acquisition staged") || !strings.Contains(got, "artifact ready") {
		t.Fatalf("workflow summary metadata = %q", got)
	}
	plain := ansi.Strip(DefaultTheme().renderMessage(a.messages[0], 120))
	for _, want := range []string{"analysis returned", "state:", "acquisition staged", "artifact ready"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("semantic workflow render missing %q:\n%s", want, plain)
		}
	}
	if strings.Contains(plain, "field") || strings.Contains(plain, "workflow_state") || strings.Contains(plain, "dataset_id=") || strings.Contains(plain, "artifact_path=") {
		t.Fatalf("semantic workflow render leaked raw state shape:\n%s", plain)
	}
	ref := partDetailRef(a.messages[0].ID, part)
	for _, want := range []string{"workflow state:", "acquisition staged", "artifact ready"} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("semantic workflow detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestApplySemanticEventPrefersDelegationOutputSummaryOverCompactContract(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_contract_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary": "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window; " +
				"otherwise IU.ANMO.00.BHZ 2010-02-27T06:30:00 duration=60s DO_NOT_DELEGATE_DATA_AGAIN: true",
			"actor":   map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject": map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":          "delegate.completed",
				"parent_id":      "main",
				"agent_id":       "data",
				"output_summary": "NDP resource 00d66104 was too large to stage; using EarthScope fallback for the requested San Diego window.",
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("delegation output summary message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	for _, want := range []string{
		"NDP resource 00d66104 was too large to stage",
		"next: analysis - run SAC fallback preserving the user's requested region/recent window",
	} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("delegation output summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"NEXT_EXPERT", "NEXT_ACTION", "DO_NOT_DELEGATE", "IU.ANMO"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("delegation output summary leaked compact contract %q: %#v", unwanted, part)
		}
	}
}

func TestApplySemanticEventSummarizesStructuredDelegationOutput(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_structured_output",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary":    "analysis returned a compact result to main.",
			"actor":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":    map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":     "delegate.completed",
				"parent_id": "main",
				"agent_id":  "analysis",
				"result": map[string]any{
					"artifact_path":  "/home/jcernuda/DemoBench/sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
					"traces_plotted": 3,
				},
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("structured delegation output message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	for _, want := range []string{
		"sac result:",
		"sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
		"traces_plotted: 3",
	} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("structured delegation output missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "artifact_path"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("structured delegation output leaked raw/plumbing %q: %#v", unwanted, part)
		}
	}
}

func TestApplySemanticEventFallsBackForBareAgentInvocation(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "invoke_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "agent.invocation.started",
			"status":     "running",
			"summary":    "Invoking main.",
			"actor":      map[string]any{"agent_id": "main"},
		}},
	})

	part := a.messages[0].Parts[0]
	if part.Text != "main started." || part.Metadata["agent_id"] != "main" {
		t.Fatalf("agent invocation fallback = %#v", part)
	}
}

func TestApplySemanticEventPrefersAgentRoutingSummaryOverGenericCompletion(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "invoke_done_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "agent.invocation.completed",
			"status":     "completed",
			"summary":    "main returned a prediction.",
			"actor":      map[string]any{"agent_id": "main"},
			"payload": map[string]any{
				"selected_expert": "data",
				"route_reason":    "Seismic dataset lookup routes to the data expert.",
				"has_answer":      true,
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("agent routing semantic event message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Text != "main selected data - Seismic dataset lookup routes to the data expert." {
		t.Fatalf("agent routing summary = %#v", part)
	}
	if strings.Contains(part.Text, "returned a prediction") || strings.Contains(part.Text, "completed") {
		t.Fatalf("agent routing summary kept generic completion: %#v", part)
	}
}

func TestSemanticLiveTraceRestoresWhenRunningSessionIsRevisited(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusRunning},
		{ID: "s2", Status: gact.StatusIdle},
	}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		ID:   "delegate_1",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.started",
			"status":     "running",
			"actor":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":    map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "main",
				"agent_id":  "analysis",
			},
		}},
	})
	if len(a.messages) != 1 || a.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("live semantic trace not seeded: %#v", a.messages)
	}

	a.selected = 1
	_ = a.selectSession(1)
	if len(a.messages) != 0 {
		t.Fatalf("switching to idle session should not restore s1 trace: %#v", a.messages)
	}
	a.selected = 0
	_ = a.selectSession(0)
	if len(a.messages) != 1 || a.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("running session should restore cached semantic trace: %#v", a.messages)
	}
}

func TestSemanticLiveTraceCacheIsNamespacedAcrossRunningSessions(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusRunning},
		{ID: "s2", Status: gact.StatusRunning},
	}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		ID:   "delegate_s1",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_s1",
			"event_type": "blueprint.delegation.started",
			"status":     "running",
			"actor":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":    map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "main",
				"agent_id":  "analysis",
			},
		}},
	})
	if len(a.semanticLiveMessagesBySession["s1"]) != 1 {
		t.Fatalf("s1 live cache not seeded: %#v", a.semanticLiveMessagesBySession)
	}

	a.selected = 1
	_ = a.selectSession(1)
	if len(a.messages) != 0 {
		t.Fatalf("switching to unrelated running session should not restore s1 trace: %#v", a.messages)
	}
	a.applySSE(client.SSEEvent{
		ID:   "delegate_s2",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s2",
			"turn_id":    "turn_s2",
			"event_type": "blueprint.delegation.started",
			"status":     "running",
			"actor":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":    map[string]any{"agent_id": "visualization", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "main",
				"agent_id":  "visualization",
			},
		}},
	})
	if len(a.semanticLiveMessagesBySession["s2"]) != 1 {
		t.Fatalf("s2 live cache not seeded independently: %#v", a.semanticLiveMessagesBySession)
	}

	a.selected = 0
	_ = a.selectSession(0)
	if len(a.messages) != 1 || a.messages[0].SessionID != "s1" || a.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("s1 revisit should restore only s1 trace: %#v", a.messages)
	}
	a.selected = 1
	_ = a.selectSession(1)
	if len(a.messages) != 1 || a.messages[0].SessionID != "s2" || a.messages[0].Parts[0].Text != "main handed work to visualization." {
		t.Fatalf("s2 revisit should restore only s2 trace: %#v", a.messages)
	}
}

func TestMessagesLoadedMergesSemanticLiveTraceOnlyWhileRunning(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		ID:   "invoke_1",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "agent.invocation.started",
			"status":     "running",
			"summary":    "Invoking main.",
			"actor":      map[string]any{"agent_id": "main"},
		}},
	})

	model, _ := a.Update(messagesLoadedMsg{
		sessionID: "s1",
		messages: []gact.Message{{
			ID:        "backend_user",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "text", Type: gact.PartTypeText, Text: "hello"}},
		}},
	})
	a = model.(*App)
	if len(a.messages) != 2 || a.messages[1].ID != "semantic_live_"+stableIDFragment("turn_1") {
		t.Fatalf("running backend reload should keep live semantic trace: %#v", a.messages)
	}

	a.sessions[0].Status = gact.StatusIdle
	model, _ = a.Update(messagesLoadedMsg{
		sessionID: "s1",
		messages: []gact.Message{{
			ID:        "backend_final",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Parts:     []gact.Part{{ID: "text", Type: gact.PartTypeText, Text: "done"}},
		}},
	})
	a = model.(*App)
	if len(a.messages) != 1 || a.messages[0].ID != "backend_final" {
		t.Fatalf("idle backend reload should drop transient semantic trace: %#v", a.messages)
	}
	if _, ok := a.semanticLiveMessagesBySession["s1"]; ok {
		t.Fatalf("idle reload should clear semantic live cache: %#v", a.semanticLiveMessagesBySession)
	}
}

func TestSemanticEventDetailShowsStructuredLiveProvenance(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic event message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeToolResult {
		t.Fatalf("semantic tool event should render as tool result: %#v", part)
	}
	ref := partDetailRef(a.messages[0].ID, a.messages[0].Parts[0])
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
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
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

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic event message = %#v", a.messages)
	}
	ref := partDetailRef(a.messages[0].ID, a.messages[0].Parts[0])
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

func TestApplySemanticEventReplacesCompactResultPlumbingWithNextAction(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_completed_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces /tmp/clio-seismic-staging/trace.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 20353,
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic delegation message = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeExpertHandoff {
		t.Fatalf("delegation should render as expert handoff: %#v", part)
	}
	for _, want := range []string{
		"analysis returned evidence to main",
		"next: visualization - plot SAC traces",
	} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("operator summary missing %q:\n%s", want, part.Text)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "DO_NOT_FINALIZE", "/tmp/clio-seismic-staging"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("operator summary leaked plumbing %q:\n%s", unwanted, part.Text)
		}
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalizedOut := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{"analysis returned evidence to main", "returned", "20353ms", "next: visualization", "plot SAC traces"} {
		if !strings.Contains(normalizedOut, want) {
			t.Fatalf("rendered timeline missing %q:\n%s", want, out)
		}
	}
}

func TestApplySemanticEventAcceptsDirectPayloadEnvelope(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{
			"event_id":   "sem_direct",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"trace_id":   "trace_1",
			"event_type": "turn.failed",
			"status":     "failed",
			"summary":    "Turn failed.",
		},
	})

	if len(a.messages) != 1 || a.messages[0].Parts[0].Type != gact.PartTypeError || !strings.Contains(a.messages[0].Parts[0].Message, "Turn failed") {
		t.Fatalf("direct semantic payload not reduced: %#v", a.messages)
	}
}

func TestSemanticProviderFailureEventIsOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_provider_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "turn.failed",
			"status":         "failed",
			"summary":        "CLIO turn failed: provider_error.",
			"provider": map[string]any{
				"provider_id": "argonne_sophia",
				"model_id":    "openai/gpt-oss-120b",
				"api_base":    "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			},
			"payload": map[string]any{
				"error_info": map[string]any{
					"error":   "provider_error",
					"message": "live streaming failed before emitting output: unhandled errors in a TaskGroup (1 sub-exception)",
					"metadata": map[string]any{
						"live_streaming": false,
						"stream_fallback": map[string]any{
							"category":    "provider_streaming_error",
							"description": "The live provider stream failed before emitting user-visible output.",
						},
					},
				},
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic provider failure = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeError {
		t.Fatalf("provider failure should render as error: %#v", part)
	}
	for _, want := range []string{
		"Provider error:",
		"before visible output",
		"argonne_sophia",
		"openai/gpt-oss-120b",
	} {
		if !strings.Contains(part.Message, want) {
			t.Fatalf("provider failure message missing %q:\n%s", want, part.Message)
		}
	}
	if strings.Contains(part.Message, "CLIO turn failed: provider_error") {
		t.Fatalf("provider failure message kept generic summary:\n%s", part.Message)
	}

	ref := partDetailRef(a.messages[0].ID, part)
	for _, want := range []string{
		"Operator view",
		"failure: Provider error:",
		"fallback: provider_streaming_error: The live provider stream failed before emitting user-visible output.",
		"provider: argonne_sophia · openai/gpt-oss-120b",
		"endpoint: https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		"Event summary",
		"what happened: Provider error:",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("provider failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{"error_info:", "stream_fallback:", "api_base:", "provider_id:", "model_id:"} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("provider failure detail leaked raw metadata label %q:\n%s", unwanted, ref.fullText)
		}
	}
}

func TestSemanticFailedLLMRequestIsOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_llm_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "llm.request.failed",
			"status":         "failed",
			"summary":        "LLM request failed for main.",
			"provider": map[string]any{
				"provider_id": "argonne_sophia",
				"model_id":    "openai/gpt-oss-120b",
				"api_base":    "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			},
			"payload": map[string]any{
				"error_info": map[string]any{
					"error":   "provider_error",
					"message": "live streaming failed before emitting output: unhandled errors in a TaskGroup (1 sub-exception)",
					"metadata": map[string]any{
						"live_streaming": false,
						"stream_fallback": map[string]any{
							"category":    "provider_streaming_error",
							"description": "The live provider stream failed before emitting user-visible output.",
						},
					},
				},
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("semantic LLM failure = %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "llm.request.failed" {
		t.Fatalf("LLM failure should render as error: %#v", part)
	}
	for _, want := range []string{
		"Provider error:",
		"before visible output",
		"argonne_sophia",
		"openai/gpt-oss-120b",
	} {
		if !strings.Contains(part.Message, want) {
			t.Fatalf("LLM failure message missing %q:\n%s", want, part.Message)
		}
	}

	ref := partDetailRef(a.messages[0].ID, part)
	for _, want := range []string{
		"event: llm.request.failed",
		"failure: Provider error:",
		"fallback: provider_streaming_error: The live provider stream failed before emitting user-visible output.",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("LLM failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestSemanticLLMRequestProgressStaysOutOfDefaultTimeline(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_llm_started",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "llm.request.started",
			"status":         "running",
			"summary":        "LLM request started for main.",
			"provider":       map[string]any{"provider_id": "argonne_sophia", "model_id": "openai/gpt-oss-120b"},
		}},
	})

	if len(a.messages) != 0 {
		t.Fatalf("non-failed LLM request should remain detail/debug noise, got %#v", a.messages)
	}
}

func TestSemanticHookProgressHiddenButFailuresSurface(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_started",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "hook.invocation.started",
			"status":         "running",
			"summary":        "pre_message hook dispatch started.",
			"actor":          map[string]any{"hook": "pre_message"},
		}},
	})
	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_completed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "hook.invocation.completed",
			"status":         "completed",
			"summary":        "pre_message hook dispatch completed.",
			"actor":          map[string]any{"hook": "pre_message"},
		}},
	})
	if len(a.messages) != 0 {
		t.Fatalf("successful hook lifecycle should remain debug noise, got %#v", a.messages)
	}

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "hook.invocation.failed",
			"status":         "failed",
			"summary":        "pre_message hook dispatch failed.",
			"actor":          map[string]any{"hook": "pre_message"},
			"error_info": map[string]any{
				"error":   "hook_error",
				"message": "pre_message hook timed out after 30s",
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("failed hook event should surface as one timeline error, got %#v", a.messages)
	}
	part := a.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "hook.invocation.failed" {
		t.Fatalf("failed hook should render as semantic error: %#v", part)
	}
	if !strings.Contains(part.Message, "pre_message hook timed out after 30s") {
		t.Fatalf("hook failure message should keep actionable error text:\n%s", part.Message)
	}
	if strings.Contains(part.Message, "hook dispatch started") || strings.Contains(part.Message, "hook dispatch completed") {
		t.Fatalf("hook failure should not include successful lifecycle noise:\n%s", part.Message)
	}

	ref := partDetailRef(a.messages[0].ID, part)
	for _, want := range []string{
		"Operator view",
		"failure: Hook error: pre_message hook timed out after 30s.",
		"Event summary",
		"event: hook.invocation.failed",
		"trace: trace_1",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("hook failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestSemanticEventDetailRedactedToolInputStaysOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0

	a.applySSE(client.SSEEvent{
		Type: "tool.call.started",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_redacted",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "tool.call.started",
			"status":         "running",
			"summary":        "SAC waveform visualization started.",
			"detail_level":   "semantic",
			"live_observed":  true,
			"occurred_at":    "2026-06-03T06:00:00Z",
			"actor":          map[string]any{"agent_id": "visualization", "tool": "sac_plot_traces"},
			"subject":        map[string]any{"call_id": "call_redacted"},
			"payload": map[string]any{
				"tool":         "sac_plot_traces",
				"call_id":      "call_redacted",
				"args_preview": "[redacted]",
			},
		}},
	})

	if len(a.messages) != 1 || len(a.messages[0].Parts) != 1 {
		t.Fatalf("redacted semantic tool event = %#v", a.messages)
	}
	ref := partDetailRef(a.messages[0].ID, a.messages[0].Parts[0])
	for _, want := range []string{
		"Operator view",
		"input: input redacted by runtime",
		"Tool evidence",
		"tool: sac_plot_traces",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("redacted semantic detail missing %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{"[redacted]", "args preview:", "Payload"} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("redacted semantic detail leaked backend/redaction copy %q:\n%s", unwanted, ref.fullText)
		}
	}

	plain := ansi.Strip(DefaultTheme().renderMessage(a.messages[0], 96))
	if strings.Contains(plain, "input redacted by runtime") || strings.Contains(plain, "[redacted]") {
		t.Fatalf("inline transcript should not advertise redacted tool input:\n%s", plain)
	}
	if !strings.Contains(plain, "SAC waveform visualization()") {
		t.Fatalf("inline transcript should keep the tool progress row without redacted args:\n%s", plain)
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
	for _, msg := range a.messages {
		for _, part := range msg.Parts {
			if part.CallID == "call_1" && part.Type == gact.PartTypeToolCall {
				if got := ansi.Strip(DefaultTheme().renderPart(part, 80)); !strings.Contains(got, "running") {
					t.Fatalf("mirrored live tool call should show running state before result: %q", got)
				}
				return
			}
		}
	}
	t.Fatalf("mirrored tool call not found: %#v", a.messages)
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
	} else if text := flattenToolResult(part); text != "ReadFile completed" {
		t.Fatalf("missing ok fallback text = %q, want tool-specific completion", text)
	}
}

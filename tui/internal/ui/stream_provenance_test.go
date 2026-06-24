package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplySemanticEventAddsLiveTimelinePart(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		ID:   "7",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"trace_id":     "trace_1",
			"event_type":   "agent.invocation.completed",
			"status":       "completed",
			"summary":      "Agent data completed.",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent": "data"},
		}},
	})

	if len(a.conversation.messages) != 1 {
		t.Fatalf("messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeExpertHandoff || part.Text != "Agent data completed." || part.Metadata["agent_id"] != "data" {
		t.Fatalf("semantic part = %#v", part)
	}
	if part.Metadata["semantic_event"] != true || part.Metadata["trace_id"] != "trace_1" {
		t.Fatalf("semantic metadata = %#v", part.Metadata)
	}
}

func TestApplySemanticTrajectoryEventsProjectIntoTranscript(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	base := map[string]any{
		"schema_version": "clio.semantic_event.v1",
		"session_id":     "s1",
		"turn_id":        "turn_1",
		"trace_id":       "trace_1",
		"actor":          map[string]any{"agent_id": "ndp_dataset_discovery", "role": "expert"},
	}
	started := cloneMap(base)
	started["event_id"] = "expert_started_1"
	started["event_type"] = "expert.lifecycle.started"
	started["status"] = "running"
	started["summary"] = "expert ndp_dataset_discovery started"
	started["payload"] = map[string]any{
		"expert_id":      "ndp_dataset_discovery",
		"expert_span_id": "expert_span_1",
		"input":          map[string]any{"question": "Find EarthScope metadata."},
	}
	a.conversation.applySSE(client.SSEEvent{ID: "1", Type: "semantic.event", Payload: map[string]any{"payload": started}})

	step := cloneMap(base)
	step["event_id"] = "react_step_1"
	step["event_type"] = "react.step.completed"
	step["status"] = "completed"
	step["summary"] = "ndp_dataset_discovery ReAct step 0: ndp_search_datasets"
	step["parent_span_id"] = "expert_span_1"
	step["payload"] = map[string]any{
		"expert_id":      "ndp_dataset_discovery",
		"expert_span_id": "expert_span_1",
		"step_span_id":   "step_span_1",
		"step_index":     0,
		"thought":        "I should search NDP for EarthScope GNSS metadata before staging a resource.",
		"reasoning":      "raw reasoning trace is available",
		"tool_name":      "ndp_search_datasets",
		"tool_args":      map[string]any{"query": "earthscope gnss"},
		"observation":    map[string]any{"count": 1},
	}
	a.conversation.applySSE(client.SSEEvent{ID: "2", Type: "semantic.event", Payload: map[string]any{"payload": step}})

	extract := cloneMap(base)
	extract["event_id"] = "expert_extract_1"
	extract["event_type"] = "expert.extract.completed"
	extract["status"] = "completed"
	extract["summary"] = "expert ndp_dataset_discovery completed"
	extract["parent_span_id"] = "expert_span_1"
	extract["payload"] = map[string]any{
		"expert_id":      "ndp_dataset_discovery",
		"expert_span_id": "expert_span_1",
		"output":         "The EarthScope station metadata catalog has been staged.",
		"step_count":     1,
		"structured": map[string]any{
			"workflow_state": map[string]any{
				"catalog": map[string]any{"status": "metadata_found"},
			},
		},
	}
	a.conversation.applySSE(client.SSEEvent{ID: "3", Type: "semantic.event", Payload: map[string]any{"payload": extract}})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 3 {
		t.Fatalf("semantic trajectory parts = %#v", a.conversation.messages)
	}
	if a.conversation.messages[0].Parts[0].Metadata["transcript_hidden"] != true {
		t.Fatalf("lifecycle part should stay in state but be hidden from transcript: %#v", a.conversation.messages[0].Parts[0])
	}
	if a.conversation.messages[0].Parts[1].Type != gact.PartTypeThinking || a.conversation.messages[0].Parts[1].Metadata["semantic_react_step"] != true {
		t.Fatalf("react step part = %#v", a.conversation.messages[0].Parts[1])
	}
	out := ansi.Strip(DefaultTheme().renderMessage(a.conversation.messages[0], 120))
	for _, want := range []string{
		"ndp_dataset_discovery",
		"I should search NDP for EarthScope GNSS metadata",
		"Ctrl+E reasoning trace",
		"The EarthScope station metadata catalog has been staged.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("semantic trajectory render missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "thinking available") {
		t.Fatalf("semantic ReAct thought should render inline, not as a collapsed marker:\n%s", out)
	}
	var thoughtLine string
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "I should search NDP") {
			thoughtLine = line
			break
		}
	}
	if !strings.HasPrefix(thoughtLine, "      ") {
		t.Fatalf("semantic thinking row should be nested under expert timeline, line=%q\n%s", thoughtLine, out)
	}
	if strings.Contains(out, "expert ndp_dataset_discovery started") {
		t.Fatalf("hidden lifecycle scaffolding leaked into transcript:\n%s", out)
	}
}

func cloneMap(values map[string]any) map[string]any {
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func TestApplyNotificationSSESurfacesGlobalEventsWithoutSessionID(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "existing",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "keep me"}},
	}}

	a.conversation.applySSE(client.SSEEvent{
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
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].Parts[0].Text != "keep me" {
		t.Fatalf("notification should not mutate transcript messages: %#v", a.conversation.messages)
	}

	a.conversation.applySSE(client.SSEEvent{
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
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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

	if len(a.conversation.messages) != 1 || a.conversation.messages[0].SessionID != "s1" || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("global semantic event should surface on current session: %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "provider.degraded" || part.Message != "Provider degraded." {
		t.Fatalf("global semantic summary = %#v", part)
	}
	if part.Metadata["trace_id"] != "trace_global" || part.Metadata["status"] != "warning" {
		t.Fatalf("global semantic metadata = %#v", part.Metadata)
	}
}

func TestApplySemanticEventReplacesCompactResultPlumbingWithNextAction(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic delegation message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
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
	for _, want := range []string{"analysis returned evidence to main", "next: visualization", "plot SAC traces"} {
		if !strings.Contains(normalizedOut, want) {
			t.Fatalf("rendered timeline missing %q:\n%s", want, out)
		}
	}
}

func TestApplySemanticEventAcceptsDirectPayloadEnvelope(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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

	if len(a.conversation.messages) != 1 || a.conversation.messages[0].Parts[0].Type != gact.PartTypeError || !strings.Contains(a.conversation.messages[0].Parts[0].Message, "Turn failed") {
		t.Fatalf("direct semantic payload not reduced: %#v", a.conversation.messages)
	}
}

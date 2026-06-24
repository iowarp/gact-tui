package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplySemanticEventFallsBackForBareAgentInvocation(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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

	part := a.conversation.messages[0].Parts[0]
	if part.Text != "main started." || part.Metadata["agent_id"] != "main" {
		t.Fatalf("agent invocation fallback = %#v", part)
	}
	if part.Metadata["transcript_hidden"] != true {
		t.Fatalf("agent invocation started should stay in state but be hidden from transcript: %#v", part)
	}
}

func TestApplySemanticEventPrefersAgentRoutingSummaryOverGenericCompletion(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("agent routing semantic event message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Text != "main selected data - Seismic dataset lookup routes to the data expert." {
		t.Fatalf("agent routing summary = %#v", part)
	}
	if strings.Contains(part.Text, "returned a prediction") || strings.Contains(part.Text, "completed") {
		t.Fatalf("agent routing summary kept generic completion: %#v", part)
	}
}

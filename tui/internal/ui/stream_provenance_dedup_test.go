package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplySemanticEventDropsDuplicateWorkflowRowsAcrossToolUpdates(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

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

	a.conversation.applySSE(event("delegate_done_1", "analysis returned a compact result to main."))
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
				"tool":    "sac_compute_trace_statistics",
				"call_id": "call_stats",
				"npts":    12000,
			},
		}},
	})
	a.conversation.applySSE(event("delegate_done_2", "analysis returned a compact result to main."))
	a.conversation.applySSE(event("delegate_next_1", "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces"))

	if len(a.conversation.messages) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	parts := a.conversation.messages[0].Parts
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

func TestLoadedMessagesSuppressCachedDuplicateSemanticHandoff(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.connection.semanticLiveMessagesBySession = map[string][]gact.Message{
		"s1": {{
			ID:        "semantic_live_turn_1",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Metadata:  map[string]any{"semantic_live_message": true},
			Parts: []gact.Part{{
				ID:   "semantic_delegate_1",
				Type: gact.PartTypeExpertHandoff,
				Text: "data returned evidence to main.",
				Metadata: map[string]any{
					"semantic_event":  true,
					"agent_id":        "data",
					"parent_id":       "main",
					"stage":           "delegate.completed",
					"status":          "completed",
					"output_summary":  "Resolved Region (Los Angeles)",
					"stream_source":   "semantic_event",
					"semantic_detail": "live",
				},
			}},
		}},
	}
	loaded := []gact.Message{{
		ID:        "msg_final",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "final_handoff",
			Type: gact.PartTypeExpertHandoff,
			Text: "data returned evidence to main.",
			Metadata: map[string]any{
				"agent_id":       "data",
				"parent_id":      "main",
				"stage":          "delegate.completed",
				"status":         "completed",
				"output_summary": "Resolved Region (Los Angeles)",
			},
		}},
	}}

	merged := a.conversation.mergeLoadedMessagesWithSemanticLiveCache("s1", loaded)
	if len(merged) != 1 {
		t.Fatalf("duplicate cached semantic handoff should be suppressed, got %d messages: %#v", len(merged), merged)
	}
	out := ansi.Strip(DefaultTheme().renderMessage(merged[0], 120))
	if strings.Count(out, "data returned evidence to main") != 1 {
		t.Fatalf("merged transcript should show the handoff once:\n%s", out)
	}
}

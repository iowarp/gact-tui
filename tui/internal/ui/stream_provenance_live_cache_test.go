package ui

import (
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSemanticLiveTraceRestoresWhenRunningSessionIsRevisited(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusRunning},
		{ID: "s2", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("live semantic trace not seeded: %#v", a.conversation.messages)
	}

	a.session.selected = 1
	_ = a.session.selectIndex(1)
	if len(a.conversation.messages) != 0 {
		t.Fatalf("switching to idle session should not restore s1 trace: %#v", a.conversation.messages)
	}
	a.session.selected = 0
	_ = a.session.selectIndex(0)
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("running session should restore cached semantic trace: %#v", a.conversation.messages)
	}
}

func TestSemanticLiveTraceCacheIsNamespacedAcrossRunningSessions(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusRunning},
		{ID: "s2", Status: gact.StatusRunning},
	}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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
	if len(a.connection.semanticLiveMessagesBySession["s1"]) != 1 {
		t.Fatalf("s1 live cache not seeded: %#v", a.connection.semanticLiveMessagesBySession)
	}

	a.session.selected = 1
	_ = a.session.selectIndex(1)
	if len(a.conversation.messages) != 0 {
		t.Fatalf("switching to unrelated running session should not restore s1 trace: %#v", a.conversation.messages)
	}
	a.conversation.applySSE(client.SSEEvent{
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
	if len(a.connection.semanticLiveMessagesBySession["s2"]) != 1 {
		t.Fatalf("s2 live cache not seeded independently: %#v", a.connection.semanticLiveMessagesBySession)
	}

	a.session.selected = 0
	_ = a.session.selectIndex(0)
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].SessionID != "s1" || a.conversation.messages[0].Parts[0].Text != "main handed work to analysis." {
		t.Fatalf("s1 revisit should restore only s1 trace: %#v", a.conversation.messages)
	}
	a.session.selected = 1
	_ = a.session.selectIndex(1)
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].SessionID != "s2" || a.conversation.messages[0].Parts[0].Text != "main handed work to visualization." {
		t.Fatalf("s2 revisit should restore only s2 trace: %#v", a.conversation.messages)
	}
}

func TestMessagesLoadedMergesSemanticLiveTraceOnlyWhileRunning(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
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
	if len(a.conversation.messages) != 2 || a.conversation.messages[1].ID != "semantic_live_"+stableIDFragment("turn_1") {
		t.Fatalf("running backend reload should keep live semantic trace: %#v", a.conversation.messages)
	}

	a.session.sessions[0].Status = gact.StatusIdle
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
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].ID != "backend_final" {
		t.Fatalf("idle backend reload should drop transient semantic trace: %#v", a.conversation.messages)
	}
	if _, ok := a.connection.semanticLiveMessagesBySession["s1"]; ok {
		t.Fatalf("idle reload should clear semantic live cache: %#v", a.connection.semanticLiveMessagesBySession)
	}
}

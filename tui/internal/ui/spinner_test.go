package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSpinner_TickAdvancesFrame(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}

	start := a.spinnerFrame
	_, cmd := a.Update(spinnerTickMsg{})
	if a.spinnerFrame != start+1 {
		t.Errorf("frame = %d, want %d", a.spinnerFrame, start+1)
	}
	if cmd == nil {
		t.Error("tick should reschedule while a session is running")
	}
}

func TestSpinner_TickDrainsWhenAllIdle(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.currentStatus = gact.StatusIdle

	_, cmd := a.Update(spinnerTickMsg{})
	if cmd != nil {
		t.Error("tick should NOT reschedule when everything is idle")
	}
}

func TestAnySessionRunning_ReadsHeaderAndSidebar(t *testing.T) {
	// Header currentStatus takes the fast path.
	a := New("http://unused")
	a.session.currentStatus = gact.StatusRunning
	if !a.session.anyRunning() {
		t.Error("currentStatus=running should count as running")
	}

	// Sidebar-only: no currentStatus but one session is running.
	a = New("http://unused")
	a.session.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusIdle},
		{ID: "s2", Status: gact.StatusRunning},
	}
	if !a.session.anyRunning() {
		t.Error("running session in sidebar should count")
	}

	// Everything idle.
	a = New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	if a.session.anyRunning() {
		t.Error("all idle should not count as running")
	}
}

func TestSessionStatusDot_MatchesStatus(t *testing.T) {
	a := New("http://unused")
	// Running dot is the current spinner frame.
	a.spinnerFrame = 0
	dot := a.session.statusDot(gact.StatusRunning)
	if !strings.Contains(dot, spinnerFrames[0]) {
		t.Errorf("running dot = %q, want spinner frame[0] %q", dot, spinnerFrames[0])
	}
	// Waiting gets the warning glyph.
	if !strings.Contains(a.session.statusDot(gact.StatusWaitingPermission), "⚠") {
		t.Error("waiting_permission dot should contain ⚠")
	}
	// Idle gets the same neutral hollow marker as forward-compatible states.
	if !strings.Contains(a.session.statusDot(gact.StatusIdle), "○") {
		t.Error("idle dot should contain hollow circle")
	}
	// Unknown status → forward-compat neutral glyph.
	if !strings.Contains(a.session.statusDot("future_state"), "○") {
		t.Error("unknown status should render ○ not blank")
	}
}

func TestSpinner_RearmsOnIdleToRunningTransition(t *testing.T) {
	// Event arrival flips a.session.currentStatus from idle→running — the
	// sseEventMsg handler should append a spinnerCmd so the tick
	// loop (which had drained during the idle period) restarts.
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusIdle

	// Craft an SSE event payload that applySSE will interpret as a
	// status_changed → running. The emulator wraps events as
	// {type, occurred_at, payload{type, ...}}; the TUI's applySSE
	// reads Event.Payload["payload"] for the inner fields.
	ev := client.SSEEvent{
		Type: "session.status_changed",
		Payload: map[string]any{
			"payload": map[string]any{
				"session_id": "s1",
				"status":     gact.StatusRunning,
			},
		},
	}
	_, cmd := a.Update(sseEventMsg{Event: ev})
	if cmd == nil {
		t.Fatal("sseEventMsg should always return at least the waitForSSE cmd")
	}
	// We can't easily inspect batched cmds without running them, but
	// we CAN assert the state flipped so a follow-up tick would
	// continue rescheduling.
	if !a.session.anyRunning() {
		t.Error("applySSE should have flipped currentStatus to running")
	}
}

func TestSSEStatusChangedDoesNotOverwriteHeaderForSiblingSession(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{
		{ID: "selected", Status: gact.StatusIdle},
		{ID: "sibling", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusIdle

	a.conversation.applySSE(client.SSEEvent{
		Type: "session.status_changed",
		Payload: map[string]any{
			"payload": map[string]any{
				"session_id": "sibling",
				"status":     gact.StatusRunning,
			},
		},
	})

	if a.session.currentStatus != gact.StatusIdle {
		t.Fatalf("currentStatus = %q, want selected session to stay idle", a.session.currentStatus)
	}
	if a.session.sessions[1].Status != gact.StatusRunning {
		t.Fatalf("sibling status = %q, want running", a.session.sessions[1].Status)
	}
}

func TestSSEStatusReplayCannotRegressTerminalSessionToRunning(t *testing.T) {
	updatedAt := time.Date(2026, 5, 25, 4, 37, 48, 0, time.UTC)
	a := New("http://unused")
	a.session.sessions = []gact.Session{{
		ID:        "s1",
		Status:    gact.StopReasonCancelled,
		UpdatedAt: updatedAt,
	}}
	a.session.selected = 0
	a.session.currentStatus = gact.StopReasonCancelled

	a.conversation.applySSE(client.SSEEvent{
		Type: "session.status_changed",
		Payload: map[string]any{
			"occurred_at": updatedAt.Add(-time.Minute).Format(time.RFC3339Nano),
			"payload": map[string]any{
				"session_id": "s1",
				"status":     gact.StatusRunning,
			},
		},
	})

	if a.session.currentStatus != gact.StopReasonCancelled {
		t.Fatalf("currentStatus = %q, want cancelled after stale replay", a.session.currentStatus)
	}
	if a.session.sessions[0].Status != gact.StopReasonCancelled {
		t.Fatalf("session status = %q, want cancelled after stale replay", a.session.sessions[0].Status)
	}
}

func TestSSEMessageCompletedEndTurnSettlesRunningSession(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning

	a.conversation.applySSE(client.SSEEvent{
		Type: "message.completed",
		Payload: map[string]any{
			"payload": map[string]any{
				"session_id":  "s1",
				"message_id":  "msg_final",
				"stop_reason": gact.StopReasonEndTurn,
			},
		},
	})

	if a.session.currentStatus != gact.StatusIdle {
		t.Fatalf("currentStatus = %q, want idle after terminal message completion", a.session.currentStatus)
	}
	if a.session.sessions[0].Status != gact.StatusIdle {
		t.Fatalf("session status = %q, want idle after terminal message completion", a.session.sessions[0].Status)
	}
}

func TestSSEMessageCompletedToolUseKeepsSessionRunning(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning

	a.conversation.applySSE(client.SSEEvent{
		Type: "message.completed",
		Payload: map[string]any{
			"payload": map[string]any{
				"session_id":  "s1",
				"message_id":  "msg_tool_use",
				"stop_reason": gact.StopReasonToolUse,
			},
		},
	})

	if a.session.currentStatus != gact.StatusRunning {
		t.Fatalf("currentStatus = %q, want running while tool use continues", a.session.currentStatus)
	}
	if a.session.sessions[0].Status != gact.StatusRunning {
		t.Fatalf("session status = %q, want running while tool use continues", a.session.sessions[0].Status)
	}
}

func TestSSEMessageReplayCannotResurrectArchivedTranscript(t *testing.T) {
	updatedAt := time.Date(2026, 5, 25, 4, 37, 48, 0, time.UTC)
	a := New("http://unused")
	a.session.sessions = []gact.Session{{
		ID:        "s1",
		Status:    gact.StatusIdle,
		UpdatedAt: updatedAt,
	}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "msg_compact",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{{
			Type:    gact.PartTypeCompaction,
			Summary: "retained compact summary",
		}},
	}}

	a.conversation.applyMessageCreated(client.SSEEvent{
		Type: "message.created",
		Payload: map[string]any{
			"occurred_at": updatedAt.Add(-time.Minute).Format(time.RFC3339Nano),
			"payload": map[string]any{
				"id":         "msg_archived_setup",
				"session_id": "s1",
				"role":       gact.RoleUser,
				"parts": []any{map[string]any{
					"type": "text",
					"text": "old setup message",
				}},
			},
		},
	})

	if len(a.conversation.messages) != 1 {
		t.Fatalf("stale replay appended archived message, messages=%#v", a.conversation.messages)
	}
	if a.conversation.messages[0].ID != "msg_compact" {
		t.Fatalf("current compact ledger was changed: %#v", a.conversation.messages)
	}

	a.conversation.applyMessageCreated(client.SSEEvent{
		Type: "message.created",
		Payload: map[string]any{
			"occurred_at": updatedAt.Add(time.Minute).Format(time.RFC3339Nano),
			"payload": map[string]any{
				"id":         "msg_live",
				"session_id": "s1",
				"role":       gact.RoleAssistant,
				"parts": []any{map[string]any{
					"type": "text",
					"text": "new live message",
				}},
			},
		},
	})

	if len(a.conversation.messages) != 2 || a.conversation.messages[1].ID != "msg_live" {
		t.Fatalf("fresh event should append, messages=%#v", a.conversation.messages)
	}
}

func TestSSEMessageReplayWithoutSessionIDUsesCurrentSession(t *testing.T) {
	updatedAt := time.Date(2026, 5, 25, 4, 37, 48, 0, time.UTC)
	a := New("http://unused")
	a.session.sessions = []gact.Session{{
		ID:        "s1",
		Status:    gact.StatusError,
		UpdatedAt: updatedAt,
	}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "msg_current",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{{Type: gact.PartTypeText, Text: "current ledger"}},
	}}

	a.conversation.applyMessageCreated(client.SSEEvent{
		Type: "message.created",
		Payload: map[string]any{
			"occurred_at": updatedAt.Add(-time.Minute).Format(time.RFC3339Nano),
			"payload": map[string]any{
				"id":   "msg_old_replay",
				"role": gact.RoleAssistant,
				"parts": []any{map[string]any{
					"type": "text",
					"text": "old replay",
				}},
			},
		},
	})

	if len(a.conversation.messages) != 1 || a.conversation.messages[0].ID != "msg_current" {
		t.Fatalf("session-scoped stale replay should be ignored, messages=%#v", a.conversation.messages)
	}
}

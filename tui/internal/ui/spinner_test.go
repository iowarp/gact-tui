package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSpinner_TickAdvancesFrame(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}

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
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.currentStatus = gact.StatusIdle

	_, cmd := a.Update(spinnerTickMsg{})
	if cmd != nil {
		t.Error("tick should NOT reschedule when everything is idle")
	}
}

func TestAnySessionRunning_ReadsHeaderAndSidebar(t *testing.T) {
	// Header currentStatus takes the fast path.
	a := New("http://unused")
	a.currentStatus = gact.StatusRunning
	if !a.anySessionRunning() {
		t.Error("currentStatus=running should count as running")
	}

	// Sidebar-only: no currentStatus but one session is running.
	a = New("http://unused")
	a.sessions = []gact.Session{
		{ID: "s1", Status: gact.StatusIdle},
		{ID: "s2", Status: gact.StatusRunning},
	}
	if !a.anySessionRunning() {
		t.Error("running session in sidebar should count")
	}

	// Everything idle.
	a = New("http://unused")
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	if a.anySessionRunning() {
		t.Error("all idle should not count as running")
	}
}

func TestSessionStatusDot_MatchesStatus(t *testing.T) {
	a := New("http://unused")
	// Running dot is the current spinner frame.
	a.spinnerFrame = 0
	dot := a.sessionStatusDot(gact.StatusRunning)
	if !strings.Contains(dot, spinnerFrames[0]) {
		t.Errorf("running dot = %q, want spinner frame[0] %q", dot, spinnerFrames[0])
	}
	// Waiting gets the warning glyph.
	if !strings.Contains(a.sessionStatusDot(gact.StatusWaitingPermission), "⚠") {
		t.Error("waiting_permission dot should contain ⚠")
	}
	// Idle gets a muted dot.
	if !strings.Contains(a.sessionStatusDot(gact.StatusIdle), "·") {
		t.Error("idle dot should contain middot")
	}
	// Unknown status → forward-compat neutral glyph.
	if !strings.Contains(a.sessionStatusDot("future_state"), "○") {
		t.Error("unknown status should render ○ not blank")
	}
}

func TestSpinner_RearmsOnIdleToRunningTransition(t *testing.T) {
	// Event arrival flips a.currentStatus from idle→running — the
	// sseEventMsg handler should append a spinnerCmd so the tick
	// loop (which had drained during the idle period) restarts.
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.selected = 0
	a.currentStatus = gact.StatusIdle

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
	if !a.anySessionRunning() {
		t.Error("applySSE should have flipped currentStatus to running")
	}
}

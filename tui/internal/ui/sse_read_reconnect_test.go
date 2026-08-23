package ui

// sse_read_reconnect_test.go — regression tests for issue #227: a mid-stream
// SSE error (errs-channel receive → errMsg{stage:"sse-read"}) and a stream-open
// failure (stage "sse") must route into the same jittered backoff-reconnect
// path a clean EOF (sseClosedMsg) takes, instead of dead-ending in a fatal
// full-screen StageError with no retry.

import (
	"errors"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// TestSSEReadError_SchedulesReconnect drives the full pipeline: an error
// arriving on the errs channel is mapped by waitForSSE to an errMsg, and
// routing that errMsg through Update must schedule a backoff reconnect —
// not flip the TUI to StageError with no retry.
func TestSSEReadError_SchedulesReconnect(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	errs := make(chan error, 1)
	errs <- errors.New("unexpected EOF")
	events := make(chan client.SSEEvent)
	msg := waitForSSE(events, errs)()
	em, ok := msg.(errMsg)
	if !ok {
		t.Fatalf("errs receive produced %T, want errMsg", msg)
	}
	if em.stage != "sse-read" {
		t.Fatalf("stage = %q, want sse-read", em.stage)
	}

	model, cmd := a.Update(em)
	a = model.(*App)
	if a.stage == StageError {
		t.Error("sse-read error must not become fatal StageError")
	}
	if cmd == nil {
		t.Fatal("expected a scheduled reconnect cmd; got nil")
	}
	if a.connection.sseBackoffAttempts != 1 {
		t.Errorf("sseBackoffAttempts = %d, want 1 (backoff path armed)", a.connection.sseBackoffAttempts)
	}
	if a.connection.sseDownSince.IsZero() {
		t.Error("sseDownSince should stamp the outage start, got zero time")
	}
	if a.transientHint == "" {
		t.Error("stream error should surface a hint so the user sees why")
	}
}

// TestSSEOpenError_SchedulesReconnect covers the stream-open failure
// (stage "sse" from startSSE): same backoff-reconnect routing.
func TestSSEOpenError_SchedulesReconnect(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	model, cmd := a.Update(errMsg{err: errors.New("connection reset by peer"), stage: "sse"})
	a = model.(*App)
	if a.stage == StageError {
		t.Error("sse open error must not become fatal StageError")
	}
	if cmd == nil {
		t.Fatal("expected a scheduled reconnect cmd; got nil")
	}
	if a.connection.sseBackoffAttempts != 1 {
		t.Errorf("sseBackoffAttempts = %d, want 1 (backoff path armed)", a.connection.sseBackoffAttempts)
	}
}

// TestSSEReadError_NoSessionDoesNotLoop mirrors the sseClosedMsg semantics:
// with no current session there is nothing to reconnect to, so no backoff
// tick is scheduled — but the error must still not become a fatal stage.
func TestSSEReadError_NoSessionDoesNotLoop(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady

	model, _ := a.Update(errMsg{err: errors.New("unexpected EOF"), stage: "sse-read"})
	a = model.(*App)
	if a.stage == StageError {
		t.Error("sse-read error without a session must not become fatal StageError")
	}
	if a.connection.sseBackoffAttempts != 0 {
		t.Errorf("sseBackoffAttempts = %d, want 0 (no session, no reconnect loop)", a.connection.sseBackoffAttempts)
	}
}

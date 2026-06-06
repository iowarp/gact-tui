package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// TestSSEResume_TracksHighestSeqID verifies that processing an
// sseEventMsg updates a.lastSeenSeqID to the event's SeqID. This is
// the data the next reconnect will send as Last-Event-ID.
func TestSSEResume_TracksHighestSeqID(t *testing.T) {
	a := New("http://unused")
	for _, id := range []string{"5", "12", "8", "20"} {
		_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{ID: id, Type: "noop"}})
	}
	if a.lastSeenSeqID != 20 {
		t.Errorf("lastSeenSeqID = %d, want 20 (the highest)", a.lastSeenSeqID)
	}
}

// TestSSEResume_OutOfOrderDoesNotRegress guards the max() defense in
// the Update handler. A late-arriving low-numbered event (say from a
// replay window racing with the live stream) must not push us
// backwards.
func TestSSEResume_OutOfOrderDoesNotRegress(t *testing.T) {
	a := New("http://unused")
	a.lastSeenSeqID = 100
	_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{ID: "42", Type: "noop"}})
	if a.lastSeenSeqID != 100 {
		t.Errorf("lastSeenSeqID = %d after lower-id event, want 100", a.lastSeenSeqID)
	}
}

// TestSSEResume_PassesLastEventIDOnReconnect is the meat: it spies on
// the HTTP requests the TUI makes to /v1/sessions/{id}/events and
// asserts the Last-Event-ID header matches the highest SeqID we've
// processed.
//
// Implementation notes: the mock returns an immediate EOF (empty body)
// so StreamEvents' reader goroutine finishes without requiring the
// test to drive cancellation. This side-steps the HTTP/1.1 keep-alive
// behaviour where a second request can queue behind the first when
// both are held open.
func TestSSEResume_PassesLastEventIDOnReconnect(t *testing.T) {
	var (
		mu      sync.Mutex
		seenIDs []string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/events") {
			http.NotFound(w, r)
			return
		}
		mu.Lock()
		seenIDs = append(seenIDs, r.Header.Get("Last-Event-ID"))
		mu.Unlock()
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		// Return immediately — StreamEvents' reader goroutine will
		// hit EOF and exit cleanly, releasing the connection so the
		// next request gets its own.
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.sessions = []gact.Session{{ID: "ses_resume"}}
	a.selected = 0
	a.lastSeenSeqID = 42

	cmd1 := a.startSSECmd("ses_resume")
	if cmd1 == nil {
		t.Fatal("first startSSECmd returned nil")
	}
	// startSSECmd returns a tea.Cmd; the HTTP request only fires when
	// the cmd is invoked. The mock closes the connection immediately,
	// so cmd1() returns once headers are received -- by which point
	// Last-Event-ID has already been recorded server-side.
	_ = cmd1()

	// Second connect — pretend we processed event 99 in between.
	a.lastSeenSeqID = 99
	cmd2 := a.startSSECmd("ses_resume")
	if cmd2 == nil {
		t.Fatal("second startSSECmd returned nil")
	}
	_ = cmd2()

	// Give the goroutines a moment to flush headers — both requests
	// have been issued synchronously at this point but the wg-less
	// mock can lag slightly under the race detector.
	for i := 0; i < 50; i++ {
		mu.Lock()
		n := len(seenIDs)
		mu.Unlock()
		if n >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	if a.sseCancel != nil {
		a.sseCancel()
	}

	mu.Lock()
	defer mu.Unlock()
	if len(seenIDs) != 2 {
		t.Fatalf("expected 2 SSE requests, got %d (%v)", len(seenIDs), seenIDs)
	}
	if seenIDs[0] != "42" {
		t.Errorf("first reconnect Last-Event-ID = %q, want 42", seenIDs[0])
	}
	if seenIDs[1] != "99" {
		t.Errorf("second reconnect Last-Event-ID = %q, want 99", seenIDs[1])
	}
}

// TestSSEResume_SelectSessionRestoresSessionCounter ensures switching
// sessions uses that session's own high-water mark. Revisiting a
// session must not reset to 0 and replay/re-render the whole ring.
func TestSSEResume_SelectSessionRestoresSessionCounter(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.sessions = []gact.Session{{ID: "s_a"}, {ID: "s_b"}}
	a.selected = 0
	a.lastSeenSeqID = 100
	a.lastSeenSeqIDBySession["s_b"] = 42

	cmd := a.selectSession(1) // switch to s_b
	if a.lastSeenSeqID != 42 {
		t.Errorf("selectSession should restore s_b lastSeenSeqID, got %d", a.lastSeenSeqID)
	}
	if a.sseCancel != nil {
		a.sseCancel()
	}
	_ = cmd
}

func TestSSEResume_TracksHighestSeqIDPerSession(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.selected = 0

	_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{
		ID:   "11",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
		}},
	}})
	a.selected = 1
	_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{
		ID:   "5",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s2",
		}},
	}})

	if a.lastSeenSeqIDBySession["s1"] != 11 || a.lastSeenSeqIDBySession["s2"] != 5 {
		t.Fatalf("per-session seq ids = %#v", a.lastSeenSeqIDBySession)
	}
}

func TestSSEOpenCanceledDoesNotEnterErrorStage(t *testing.T) {
	a := New("http://127.0.0.1:1")
	a.stage = StageReady

	cmd := a.startSSECmd("s_canceled")
	if cmd == nil {
		t.Fatal("startSSECmd returned nil")
	}
	if a.sseCancel == nil {
		t.Fatal("startSSECmd did not install a cancel func")
	}
	a.sseCancel()

	msg := cmd()
	if _, ok := msg.(sseOpenCanceledMsg); !ok {
		t.Fatalf("cmd returned %T, want sseOpenCanceledMsg", msg)
	}

	model, _ := a.Update(msg)
	a = model.(*App)
	if a.stage == StageError {
		t.Fatalf("stage = StageError after benign SSE cancel: %q", a.stageError)
	}
	if a.stageError != "" {
		t.Fatalf("stageError = %q, want empty", a.stageError)
	}
}

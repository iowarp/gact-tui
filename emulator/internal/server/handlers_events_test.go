package server

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// readSSEUntil reads SSE data: lines from rdr until we collect want lines or
// timeout elapses. Returns the lines collected.
func readSSEUntil(t *testing.T, rdr *bufio.Reader, want int, timeout time.Duration) []string {
	t.Helper()
	out := make([]string, 0, want)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) && len(out) < want {
		line, err := rdr.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimRight(line, "\n")
		if strings.HasPrefix(line, "data: ") {
			out = append(out, strings.TrimPrefix(line, "data: "))
		}
	}
	return out
}

func TestSSEServerConnectedFirst(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/v1/sessions/"+sid+"/events", nil)
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("get events: %v", err)
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("content-type = %q", ct)
	}

	rdr := bufio.NewReader(resp.Body)
	lines := readSSEUntil(t, rdr, 1, time.Second)
	if len(lines) != 1 {
		t.Fatalf("got %d data lines, want 1", len(lines))
	}
	if !strings.Contains(lines[0], `"type":"server.connected"`) {
		t.Errorf("first event = %q, want server.connected", lines[0])
	}
}

func TestSSELiveDelivery(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/v1/sessions/"+sid+"/events", nil)
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)

	// Drain the initial server.connected.
	_ = readSSEUntil(t, rdr, 1, time.Second)

	// Publish two custom events on this session.
	srv.Bus().Publish(events.Event{Type: "test.one", SessionID: sid, Payload: 1})
	srv.Bus().Publish(events.Event{Type: "test.two", SessionID: sid, Payload: 2})

	got := readSSEUntil(t, rdr, 2, time.Second)
	if len(got) != 2 {
		t.Fatalf("got %d data lines, want 2: %v", len(got), got)
	}
	if !strings.Contains(got[0], "test.one") || !strings.Contains(got[1], "test.two") {
		t.Errorf("ordering off: %v", got)
	}
}

func TestSSEFiltersOutOtherSessions(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	other, _ := srv.Store().CreateSession(gact.Session{WorkspaceID: "ws_test", Title: "other"})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/v1/sessions/"+sid+"/events", nil)
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("ts.Client().Do: %v", err)
	}
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)
	_ = readSSEUntil(t, rdr, 1, time.Second) // drain greeting

	// Publish on another session — should NOT appear.
	srv.Bus().Publish(events.Event{Type: "noise", SessionID: other.ID})
	// Then publish on ours — should appear.
	srv.Bus().Publish(events.Event{Type: "ours", SessionID: sid})

	got := readSSEUntil(t, rdr, 1, time.Second)
	if len(got) != 1 {
		t.Fatalf("got %d, want 1: %v", len(got), got)
	}
	if !strings.Contains(got[0], "ours") {
		t.Errorf("crosstalk: %v", got)
	}
}

func TestSSEWorkspaceFilter(t *testing.T) {
	// Workspace-scoped SSE only sees events tagged with that workspace ID.
	srv, _ := newServerWithSeededWorkspace(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/v1/events?workspace_id=ws_test", nil)
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("ts.Client().Do: %v", err)
	}
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)
	_ = readSSEUntil(t, rdr, 1, time.Second) // greeting

	srv.Bus().Publish(events.Event{Type: "ws.match", WorkspaceID: "ws_test"})
	srv.Bus().Publish(events.Event{Type: "ws.miss", WorkspaceID: "ws_other"})

	got := readSSEUntil(t, rdr, 1, 800*time.Millisecond)
	if len(got) != 1 || !strings.Contains(got[0], "ws.match") {
		t.Errorf("workspace filter wrong: %v", got)
	}
}

func TestSSELastEventIDResume(t *testing.T) {
	srv, _, sid := newServerWithSession(t)

	// Publish two events BEFORE any subscriber connects, so the bus ring
	// retains them with seq IDs 1 and 2.
	srv.Bus().Publish(events.Event{Type: "early.one", SessionID: sid})
	srv.Bus().Publish(events.Event{Type: "early.two", SessionID: sid})

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/v1/sessions/"+sid+"/events", nil)
	req.Header.Set("Last-Event-ID", "1")
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("ts.Client().Do: %v", err)
	}
	defer resp.Body.Close()
	rdr := bufio.NewReader(resp.Body)

	// First line is the greeting; subsequent lines should include the replayed event #2.
	got := readSSEUntil(t, rdr, 2, 1500*time.Millisecond)
	if len(got) < 2 {
		t.Fatalf("expected greeting + replay, got %d: %v", len(got), got)
	}
	// One of the lines should be early.two; early.one (seq=1) is excluded.
	hasReplay := false
	for _, line := range got {
		if strings.Contains(line, "early.two") {
			hasReplay = true
		}
		if strings.Contains(line, "early.one") {
			t.Errorf("replay leaked seq=1 (Last-Event-ID was 1): %v", got)
		}
	}
	if !hasReplay {
		t.Errorf("missed replay of early.two: %v", got)
	}
}

func TestPostMessagePublishesEvent(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	sub := srv.Bus().Subscribe(events.Filter{SessionID: sid}, 8)
	defer sub.Cancel()

	rec := do(t, srv.Handler(), http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("hi")},
	})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("post: %d", rec.Code)
	}

	select {
	case e := <-sub.C:
		if e.Type != "message.created" {
			t.Errorf("event type = %q", e.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("no event published")
	}
}

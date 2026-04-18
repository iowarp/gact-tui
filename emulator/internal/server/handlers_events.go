package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
)

// SSE constants.
const (
	heartbeatInterval = 15 * time.Second
)

// handleWorkspaceEvents serves GET /v1/events?workspace_id=...
func (s *Server) handleWorkspaceEvents(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	s.serveSSE(w, r, events.Filter{WorkspaceID: wsID})
}

// handleSessionEvents serves GET /v1/sessions/{id}/events
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	s.serveSSE(w, r, events.Filter{SessionID: r.PathValue("id")})
}

// serveSSE upgrades the response to an SSE stream, replays missed events
// per Last-Event-ID, then writes live events from the bus until the client
// disconnects or the server stops.
func (s *Server) serveSSE(w http.ResponseWriter, r *http.Request, filter events.Filter) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "no_streaming",
			"response writer does not support flushing")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering if proxied
	w.WriteHeader(http.StatusOK)

	// Subscribe BEFORE replay so we don't miss events that arrive between
	// the replay snapshot and the live tail.
	sub := s.bus.Subscribe(filter, 256)
	defer sub.Cancel()

	// Greeting event (SPEC §7.3).
	writeSSE(w, flusher, events.Event{
		SeqID:      0, // synthetic — clients shouldn't use this as a resume cursor
		Type:       "server.connected",
		OccurredAt: time.Now().UTC(),
		Payload:    map[string]any{"server_version": EmulatorVersion},
	})

	// Replay anything since Last-Event-ID.
	if cursor := r.Header.Get("Last-Event-ID"); cursor != "" {
		after, err := strconv.ParseUint(cursor, 10, 64)
		if err == nil {
			for _, e := range s.bus.Replay(after, filter) {
				writeSSE(w, flusher, e)
			}
		}
	}

	// Live tail with periodic heartbeats.
	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case e, open := <-sub.C:
			if !open {
				return
			}
			writeSSE(w, flusher, e)
		case <-heartbeat.C:
			writeSSE(w, flusher, events.Event{
				Type:       "server.heartbeat",
				OccurredAt: time.Now().UTC(),
				Payload:    map[string]any{},
			})
		}
	}
}

// writeSSE serializes a single event and flushes it. Errors are swallowed
// because SSE has no recovery for write failures — the client will reconnect.
func writeSSE(w http.ResponseWriter, flusher http.Flusher, e events.Event) {
	buf, err := json.Marshal(e)
	if err != nil {
		return
	}
	if e.SeqID > 0 {
		_, _ = fmt.Fprintf(w, "id: %s\n", e.SeqString())
	}
	_, _ = fmt.Fprintf(w, "event: %s\n", e.Type)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", buf)
	flusher.Flush()
}

// shutdownSSE publishes a final disposed event so subscribers know the
// server is going away.
func (s *Server) shutdownSSE(_ context.Context) {
	s.bus.Publish(events.Event{
		Type:    "server.disposed",
		Payload: map[string]any{"reason": "shutdown"},
	})
}

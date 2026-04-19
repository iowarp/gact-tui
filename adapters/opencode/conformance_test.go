package opencode

import (
	"bufio"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/conformance"
)

// TestConformance_AgainstMockedUpstream boots the OpenCode adapter
// against a mock OpenCode upstream that serves the minimum endpoints
// the conformance suite touches, then runs conformance.Run end-to-end.
//
// This catches translation bugs that the unit tests miss because each
// section walks the full path (request → adapter → upstream → adapter
// response → conformance assert) instead of stopping at adapter input.
func TestConformance_AgainstMockedUpstream(t *testing.T) {
	upstream := mockCompleteOpenCode(t)
	defer upstream.Close()

	adapter := New(upstream.URL, nil)
	adapterServer := httptest.NewServer(adapter.Handler())
	defer adapterServer.Close()

	conformance.Run(conformance.FromTest(t), adapterServer.URL, conformance.Options{
		// OpenCode adapter doesn't expose POST /v1/sessions — the
		// upstream owns session creation. Conformance's session-id
		// fixture is the one our mock returns from /session.
		SkipCreateSession: true,
		SessionID:         "ses_conformance",
		// OpenCode adapter doesn't proxy commands/tools/metrics/agents
		// endpoints; fold them out of the conformance scope so a
		// 501 doesn't fail the suite.
		SkipCommands:      true,
		SkipTools:         true,
		SkipMetrics:       true,
		SkipAgents:        true,
		SkipSessionExport: true,
		// SSE budget bumped from default 3 s — the adapter emits
		// server.connected immediately so this is plenty, but a slow
		// CI runner can still take a moment to wire up sockets.
		SSEBudget: 5 * time.Second,
	})
}

// mockCompleteOpenCode stands up an OpenCode-shaped upstream rich
// enough to satisfy every section of the conformance suite. Per the
// OpenCode wire shape:
//
//	GET /session                          → list of sessions
//	GET /session/{id}/message             → list of messages
//	POST /session/{id}/prompt_async       → 202
//	GET /event                            → SSE stream
func mockCompleteOpenCode(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	listSessions := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `[
			{"id":"ses_conformance","title":"conformance fixture",
			 "projectID":"proj_x","directory":"/repos/conformance",
			 "time":{"created":1700000000000,"updated":1700000010000}}
		]`)
	}
	// /path is what the adapter calls when synthesizing the workspace
	// (list + per-id). Returns the worktree the adapter collapses
	// into a single "default" workspace.
	mux.HandleFunc("GET /path", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{
			"home":"/home/test","state":"/var/state","config":"/etc/cfg",
			"worktree":"/repos/conformance","directory":"/repos/conformance"
		}`)
	})
	// Adapter calls "/session/" (trailing slash); register both so a
	// path-shape regression in the adapter doesn't silently 404 us.
	mux.HandleFunc("GET /session", listSessions)
	mux.HandleFunc("GET /session/", listSessions)
	mux.HandleFunc("GET /session/ses_conformance", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{
			"id":"ses_conformance","title":"conformance fixture",
			"projectID":"proj_x","directory":"/repos/conformance",
			"time":{"created":1700000000000,"updated":1700000010000}
		}`)
	})
	mux.HandleFunc("GET /session/ses_conformance/message", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `[]`)
	})
	mux.HandleFunc("POST /session/ses_conformance/prompt_async", func(w http.ResponseWriter, r *http.Request) {
		// OpenCode returns 204 here, not 202 — see adapter comment at
		// handlePostMessage. The adapter synthesises the 202 itself.
		w.WriteHeader(http.StatusNoContent)
	})

	// SSE — trickle one event then keep the stream open until the
	// client disconnects. The adapter wraps it in server.connected,
	// which is enough for conformance's "see at least one data:".
	var openMu sync.Mutex
	open := map[*http.Request]chan struct{}{}
	mux.HandleFunc("GET /event", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		fmt.Fprintf(w, "data: %s\n\n", `{"type":"server.connected","properties":{}}`)
		flusher.Flush()

		done := make(chan struct{})
		openMu.Lock()
		open[r] = done
		openMu.Unlock()
		select {
		case <-r.Context().Done():
		case <-done:
		}
		openMu.Lock()
		delete(open, r)
		openMu.Unlock()
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(func() {
		// Close any in-flight SSE clients first so srv.Close() doesn't
		// hang. Without this the httptest cleanup races the still-open
		// /event handler.
		openMu.Lock()
		for _, ch := range open {
			close(ch)
		}
		openMu.Unlock()
	})
	return srv
}

// readSSEFrame is unused outside the conformance test but kept here so
// future tests in this file can drain a single SSE frame for assertions.
var _ = bufio.NewReader

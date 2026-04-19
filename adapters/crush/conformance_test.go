package crush

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/conformance"
)

// TestConformance_AgainstMockedUpstream boots the Crush adapter against
// a mock Crush upstream that serves every nested endpoint the
// conformance suite walks, then runs conformance.Run end-to-end.
//
// Catches translation regressions that the unit tests miss: each
// section walks the full path (request → adapter → upstream → adapter
// response → conformance assert).
func TestConformance_AgainstMockedUpstream(t *testing.T) {
	const (
		wsID  = "ws_conformance"
		sesID = "ses_conformance"
	)

	upstream := mockCompleteCrush(t, wsID, sesID)
	defer upstream.Close()

	adapter := New(upstream.URL, wsID, nil)
	adapterServer := httptest.NewServer(adapter.Handler())
	defer adapterServer.Close()

	conformance.Run(conformance.FromTest(t), adapterServer.URL, conformance.Options{
		WorkspaceID: wsID,
		SessionID:   sesID,
		// Crush adapter is read+POST-message; it doesn't expose
		// POST /v1/sessions for creation (Crush owns session lifecycle).
		SkipCreateSession: true,
		// Crush adapter doesn't proxy commands/tools/metrics/agents
		// endpoints yet — they'd all 501. Suite-level skip keeps the
		// conformance assertions scoped to what Crush actually promises.
		SkipCommands: true,
		SkipTools:    true,
		SkipMetrics:  true,
		SkipAgents:   true,
		SSEBudget:    5 * time.Second,
	})
}

// mockCompleteCrush stands up a Crush-shaped upstream with every nested
// endpoint the conformance suite reaches via the adapter. Crush nests
// sessions under workspaces in URL space; we register the full nested
// paths so the adapter's translation layer is exercised end-to-end.
func mockCompleteCrush(t *testing.T, wsID, sesID string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("GET /v1/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[
			{"id":%q,"path":"/repos/conformance","title":"conformance fixture",
			 "created_at":1700000000,"updated_at":1700000010}
		]`, wsID)
	})
	mux.HandleFunc("GET /v1/workspaces/"+wsID, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"id":%q,"path":"/repos/conformance","title":"conformance fixture",
			"created_at":1700000000,"updated_at":1700000010
		}`, wsID)
	})
	mux.HandleFunc("GET /v1/workspaces/"+wsID+"/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `[
			{"id":%q,"title":"conformance session",
			 "created_at":1700000000,"updated_at":1700000010}
		]`, sesID)
	})
	mux.HandleFunc("GET /v1/workspaces/"+wsID+"/sessions/"+sesID, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":%q,"title":"conformance session"}`, sesID)
	})
	mux.HandleFunc("GET /v1/workspaces/"+wsID+"/sessions/"+sesID+"/messages", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	})
	mux.HandleFunc("POST /v1/workspaces/"+wsID+"/agent", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// SSE — emit one event then keep the stream open until the adapter
	// disconnects. The adapter wraps the connection in its own
	// server.connected message which already satisfies conformance's
	// "see at least one data: line" assertion, but we also send a real
	// session event so this exercises the translator too.
	var openMu sync.Mutex
	open := map[*http.Request]chan struct{}{}
	mux.HandleFunc("GET /v1/workspaces/"+wsID+"/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		// Crush envelope shape: {type, payload:{type, payload}}.
		fmt.Fprintf(w, "data: %s\n\n",
			`{"type":"session","payload":{"type":"created","payload":{"id":"`+sesID+`","title":"hi"}}}`)
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
		// hang on goroutines still sitting in the select above.
		openMu.Lock()
		for _, ch := range open {
			close(ch)
		}
		openMu.Unlock()
	})
	return srv
}

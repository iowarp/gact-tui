package goose

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/conformance"
)

// TestConformance_AgainstMockedUpstream boots the Goose adapter
// against a mocked goosed upstream rich enough to satisfy every
// section of the conformance suite the adapter advertises, then
// runs conformance.Run end-to-end. Catches translation regressions
// the unit tests miss because each section walks the full path
// (request -> adapter -> upstream -> adapter response -> assert).
//
// Sections we don't implement yet (POST messages, SSE, the
// cap=false ones) are skipped explicitly so the run is honest about
// scope.
func TestConformance_AgainstMockedUpstream(t *testing.T) {
	upstream := mockCompleteGoose(t)
	defer upstream.Close()

	adapter := New(upstream.URL, t.TempDir(), nil)
	adapterServer := httptest.NewServer(adapter.Handler())
	defer adapterServer.Close()

	conformance.Run(conformance.FromTest(t), adapterServer.URL, conformance.Options{
		// Pin the conformance session id; Goose owns session lifecycle
		// (the adapter doesn't expose POST /v1/sessions). Without
		// this pin, conformance's Sessions_Get + Messages_List would
		// be skipped because no sid is in scope.
		SessionID:         "ses_conformance",
		SkipCreateSession: true,
		// Goose's POST + SSE wiring lands in subsequent iterations
		// (NNNNNNN+) — out of scope for this conformance check.
		SkipPostMessage: true,
		SkipSSE:         true,
		// Endpoints the adapter doesn't proxy yet — they'd 501 and
		// the conformance suite treats 501 as failure.
		SkipCommands:      true,
		SkipTools:         true,
		SkipMetrics:       true,
		SkipAgents:        true,
		SkipSessionExport: true,
		SkipMessageList:   false, // wired in MMMMMMM1
	})
}

// mockCompleteGoose stands up a Goose-shaped upstream with every
// nested endpoint the conformance suite reaches via the adapter.
func mockCompleteGoose(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"healthy":true}`))
	})
	mux.HandleFunc("GET /sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"sessions": [
				{
					"id":"ses_conformance",
					"name":"conformance session",
					"working_dir":"/repos/conformance",
					"created_at":"2026-01-01T00:00:00Z",
					"updated_at":"2026-01-01T01:00:00Z"
				}
			]
		}`))
	})
	mux.HandleFunc("GET /sessions/ses_conformance", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"ses_conformance",
			"name":"conformance session",
			"working_dir":"/repos/conformance",
			"created_at":"2026-01-01T00:00:00Z",
			"updated_at":"2026-01-01T01:00:00Z",
			"conversation":[
				{"id":"msg_conformance_a","role":"User","created":1735689600,
				 "content":[{"type":"text","text":"hi from conformance"}]}
			]
		}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

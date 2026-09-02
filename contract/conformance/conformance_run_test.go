package conformance

import (
	"net"
	"net/http"
	"testing"
)

// TestConformance_OptionsSkip verifies the skip-flag plumbing — a backend that
// only wires /v1/health must still pass the suite when every other section is
// skipped. It stands up its own mux (no emulator, no binary, no build step),
// and is the only coverage Run's section dispatch has in this repo: it fails if
// a Skip* flag stops short-circuiting its section, or if Run starts calling a
// section it was told to skip.
func TestConformance_OptionsSkip(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"healthy":true,"uptime_s":0}`))
	})
	mux.HandleFunc("/v1/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"not implemented"}`, http.StatusNotImplemented)
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: mux}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	Run(FromTest(t), "http://"+ln.Addr().String(), Options{
		SkipCapabilities:  true,
		SkipWorkspaces:    true,
		SkipSessions:      true,
		SkipCreateSession: true,
		SkipPostMessage:   true,
		SkipMessageList:   true,
		SkipSessionExport: true,
		SkipSSE:           true,
		SkipCommands:      true,
		SkipTools:         true,
		SkipMetrics:       true,
		SkipAgents:        true,
	})
}

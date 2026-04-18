package crush

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestResolveUpstream_TCPPassthrough(t *testing.T) {
	base, client := ResolveUpstream("http://127.0.0.1:8080", 5*time.Second)
	if base != "http://127.0.0.1:8080" {
		t.Errorf("base = %q", base)
	}
	if client.Timeout != 5*time.Second {
		t.Errorf("timeout = %v, want 5s", client.Timeout)
	}
	// TCP path uses the default transport — any Transport-less client
	// is fine. We don't assert the transport identity here, just that
	// it works against a real TCP server below in TestAdapter_TCPUpstream.
}

func TestResolveUpstream_TCPTrailingSlashStripped(t *testing.T) {
	base, _ := ResolveUpstream("http://x:1/", 5*time.Second)
	if base != "http://x:1" {
		t.Errorf("base = %q, want trailing slash stripped", base)
	}
}

func TestResolveUpstream_UnixScheme(t *testing.T) {
	base, client := ResolveUpstream("unix:///tmp/crush.sock", 5*time.Second)
	if base != "http://unix" {
		t.Errorf("base = %q, want http://unix placeholder", base)
	}
	if client.Transport == nil {
		t.Fatal("unix scheme should populate a custom Transport")
	}
	if _, ok := client.Transport.(*http.Transport); !ok {
		t.Errorf("transport = %T, want *http.Transport", client.Transport)
	}
}

func TestResolveUpstream_EmptyReturnsEmptyBase(t *testing.T) {
	base, client := ResolveUpstream("", 5*time.Second)
	if base != "" {
		t.Errorf("base = %q", base)
	}
	if client == nil {
		t.Fatal("client should be non-nil even with empty upstream")
	}
}

// TestAdapter_UnixSocketUpstream is the end-to-end proof: we boot a
// real httptest.Server listening on a Unix socket that speaks the
// Crush wire shape for /v1/workspaces, then point the adapter at that
// socket and assert the adapter's /v1/workspaces returns the expected
// GACT-shaped response.
//
// Skipped on Windows — net.Listen("unix", …) isn't portable there.
func TestAdapter_UnixSocketUpstream(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix sockets not supported on Windows")
	}
	dir := t.TempDir()
	sockPath := filepath.Join(dir, "crush.sock")

	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	// httptest uses a standard HTTP handler — the Listener can be any
	// net.Listener, so this just works over the Unix socket.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/workspaces", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[
			{"id":"ws_unix","path":"/repos/unix","title":"from-unix-sock","created_at":1700000000}
		]`)
	})
	srv := &http.Server{Handler: mux}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() {
		_ = srv.Close()
		_ = ln.Close()
		_ = os.Remove(sockPath)
	})

	adapter := New("unix://"+sockPath, "ws_unix", nil)
	rec := do(t, adapter.Handler(), "/v1/workspaces")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Workspaces []gact.Workspace `json:"workspaces"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Workspaces) != 1 || body.Workspaces[0].Name != "from-unix-sock" {
		t.Errorf("workspaces = %+v", body.Workspaces)
	}
}

func TestResolveUpstreamTransport_UnixDialsSocket(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix sockets not supported on Windows")
	}
	dir := t.TempDir()
	sockPath := filepath.Join(dir, "probe.sock")
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	defer ln.Close()
	defer os.Remove(sockPath)

	// Serve a single request then exit.
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		// Drain request line + headers (we don't parse — we just need
		// to respond with something valid so the client's Do returns).
		buf := make([]byte, 4096)
		_, _ = conn.Read(buf)
		_, _ = io.WriteString(conn,
			"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi")
	}()

	tr := ResolveUpstreamTransport("unix://" + sockPath)
	client := &http.Client{Timeout: 2 * time.Second, Transport: tr}
	resp, err := client.Get("http://unix/probe")
	if err != nil {
		t.Fatalf("GET over unix sock: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status %d", resp.StatusCode)
	}
}

// TestResolveUpstreamTransport_HTTPFallsBackToDefault smoke-tests the
// TCP path: ResolveUpstreamTransport should return http.DefaultTransport
// (or an equivalent) for non-unix URLs. We just probe a real httptest
// TCP server to verify the round-tripper actually works end-to-end.
func TestResolveUpstreamTransport_HTTPFallsBackToDefault(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	}))
	defer srv.Close()

	tr := ResolveUpstreamTransport(srv.URL)
	client := &http.Client{Timeout: 2 * time.Second, Transport: tr}
	resp, err := client.Get(srv.URL + "/any")
	if err != nil {
		t.Fatalf("GET over tcp: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("status %d", resp.StatusCode)
	}
}

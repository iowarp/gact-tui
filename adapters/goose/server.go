// Package goose is a GACT v0.1 → Goose HTTP adapter. Goose is a
// Rust agent (https://github.com/block/goose) with an axum-based
// HTTP server (`/sessions`, `/reply`, `/recipes`, etc.). The adapter
// proxies between GACT v0.1 and that surface.
//
// v0.1 scope: read-only health/capabilities/workspaces. Sessions
// list/get + messages POST + SSE wired in subsequent KKKKKKK
// follow-ups so this PR stays bite-sized and the conformance test
// fixture stays small.
package goose

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	contractVersion = "0.1"
	backendName     = "goose-adapter"
	backendVersion  = "0.1.0"
)

// Server holds adapter state. Construct with New().
type Server struct {
	mux      *http.ServeMux
	upstream string // Goose HTTP base URL
	client   *http.Client
	wsRoot   string // workspace root path advertised to GACT clients
	started  time.Time

	// OOOOOOO1: per-session SSE subscribers. Each turn from
	// upstream /reply pumps events into the matching subscriber
	// list; gact GET /events readers consume them. Keyed by GACT
	// session id (== Goose session id, since the adapter is a
	// pass-through on the session axis).
	mu          sync.Mutex
	subscribers map[string][]chan map[string]any
}

// New builds a Server bound to the given upstream Goose URL.
// wsRoot is the workspace root (defaults to "/" — single synthetic
// workspace per adapter). cli may be nil for the default client.
func New(upstream, wsRoot string, cli *http.Client) *Server {
	if cli == nil {
		cli = &http.Client{Timeout: 30 * time.Second}
	}
	if wsRoot == "" {
		wsRoot = "/"
	}
	abs, err := filepath.Abs(wsRoot)
	if err == nil {
		wsRoot = abs
	}
	s := &Server{
		mux:         http.NewServeMux(),
		upstream:    strings.TrimRight(upstream, "/"),
		client:      cli,
		wsRoot:      wsRoot,
		started:     time.Now(),
		subscribers: make(map[string][]chan map[string]any),
	}
	s.routes()
	return s
}

// Handler returns the http.Handler for embedding.
func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}", s.handleGetMessage)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
	s.mux.HandleFunc("GET /v1/sessions/{id}/diffs", s.handleListDiffs)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}/diffs", s.handleListMessageDiffs)
	s.mux.HandleFunc("GET /v1/tools", s.handleListTools)
	s.mux.HandleFunc("GET /v1/tools/{id}", s.handleGetTool)
	// Catchall 501 so TUI degrades cleanly for unimplemented sections.
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// Probe upstream to confirm Goose is reachable; surface that as
	// our healthy=false rather than lying to the TUI.
	healthy := true
	if _, err := s.upstreamGet("/health"); err != nil {
		healthy = false
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"healthy":  healthy,
		"uptime_s": int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"contract_version": contractVersion,
		"backend": map[string]any{
			"name":    backendName,
			"version": backendVersion,
		},
		"capabilities": map[string]any{
			// Wired:
			"workspaces": true,
			"sessions":   true,
			// What's coming:
			"messages":           true,
			"sse":                true,
			"tools":              true,
			"files":              false,
			"diffs":              true,
			"providers":          false,
			"agents":             false,
			"commands":           false,
			"metrics":            false,
			"mcp":                false,
			"voice":              false,
			"lsp":                false,
			"hooks":              false,
			"permissions":        false,
			"session_tasks":      false,
			"search_messages":    false,
			"scheduled_sessions": false,
		},
	})
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" not yet wired in goose adapter")
}

// upstreamGet hits the Goose HTTP server. Returns the body bytes.
func (s *Server) upstreamGet(path string) ([]byte, error) {
	resp, err := s.client.Get(s.upstream + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		panic(err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

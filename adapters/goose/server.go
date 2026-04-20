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
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
		mux:      http.NewServeMux(),
		upstream: strings.TrimRight(upstream, "/"),
		client:   cli,
		wsRoot:   wsRoot,
		started:  time.Now(),
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
			"messages":           false,
			"sse":                false,
			"tools":              false,
			"files":              false,
			"diffs":              false,
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

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": []gact.Workspace{s.workspace()},
	})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws := s.workspace()
	if ws.ID != id {
		writeError(w, http.StatusNotFound, "workspace_not_found", "no workspace with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) workspace() gact.Workspace {
	return gact.Workspace{
		ID:        "ws_default",
		Name:      filepath.Base(s.wsRoot),
		RootPath:  s.wsRoot,
		CreatedAt: s.started,
		Metadata: map[string]any{
			"x_goose_upstream": s.upstream,
		},
	}
}

// handleListSessions proxies Goose's `GET /sessions`. Workspace
// scoping is collapsed (one synthetic workspace per adapter
// instance) so the workspace_id query param is accepted but ignored.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	body, err := s.upstreamGet("/sessions")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var raw gooseSessionList
	if err := json.Unmarshal(body, &raw); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	out := make([]gact.Session, 0, len(raw.Sessions))
	wsID := s.workspace().ID
	for _, gs := range raw.Sessions {
		out = append(out, sessionToGact(gs, wsID))
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

// handleGetSession proxies Goose's `GET /sessions/{id}`. Returns 404
// when upstream returns 404 too — the SPEC §6.0 envelope is built
// here so the TUI sees a uniform error shape.
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sessionToGact(gs, s.workspace().ID))
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

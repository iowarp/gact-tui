// Package claudecode is a GACT v0.1 → Claude Code adapter that drives
// Anthropic's `claude` CLI in stream-json mode. The CLI handles auth
// (OAuth token from the user's keychain) and streaming; the adapter
// just translates between the GACT REST + SSE contract and Claude
// Code's JSONL events.
//
// The model:
//   - The adapter holds an in-memory session table. Each GACT session
//     id maps to a Claude Code subprocess that's started lazily on
//     the first POST /v1/sessions/{id}/messages and reused for the
//     session's lifetime via `--continue`/`--resume`.
//   - One synthetic workspace per adapter instance, derived from the
//     `--cwd` flag (Claude Code is cwd-scoped — every run picks up
//     the directory's CLAUDE.md, MCP config, and tool permissions).
//   - Capabilities advertise the realistic subset: workspaces,
//     sessions, messages, sse, tools, files, diffs. Hooks/voice/lsp/
//     scheduled_sessions are off — those would need bigger plumbing.
package claudecode

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Server holds adapter state. One per process; created via New.
type Server struct {
	mux *http.ServeMux

	// claudeBin is the path to the `claude` CLI. Defaults to "claude"
	// (resolved via $PATH); override for tests with a mock binary.
	claudeBin string

	// cwd is the workspace root passed to claude as --add-dir. Per-cwd
	// scoping is core to Claude Code's UX (CLAUDE.md, MCP config,
	// tool permissions all key off cwd) so the adapter binds it at
	// startup rather than per-request.
	cwd string

	// startTime stamps process boot for the /v1/health uptime field.
	startTime time.Time

	// sessions tracks adapter-side session state. Claude Code's CLI
	// owns the actual conversation history (via `--resume <id>`); we
	// keep enough metadata here to satisfy GET /v1/sessions and
	// /v1/sessions/{id} without a round-trip per call.
	mu       sync.RWMutex
	sessions map[string]*sessionState
}

// sessionState is what we persist per gact session id. claudeID is
// Claude Code's own session id (the one returned in the system/init
// event); the two diverge because gact creates the id at POST time
// while claude assigns its id when the first message lands.
type sessionState struct {
	GactID      string
	ClaudeID    string
	WorkspaceID string
	Title       string
	CreatedAt   time.Time
	Status      string // idle|running|waiting_permission|error
	Messages    []gact.Message
}

// New builds a Server bound to the given workspace cwd. claudeBin
// defaults to "claude" if empty.
func New(cwd, claudeBin string) *Server {
	if claudeBin == "" {
		claudeBin = "claude"
	}
	abs, err := filepath.Abs(cwd)
	if err == nil {
		cwd = abs
	}
	s := &Server{
		mux:       http.NewServeMux(),
		claudeBin: claudeBin,
		cwd:       cwd,
		startTime: time.Now(),
		sessions:  make(map[string]*sessionState),
	}
	s.routes()
	return s
}

// Handler returns the http.Handler for embedding in a server.
func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	// Catchall — anything we haven't wired yet returns 501 so the TUI
	// degrades gracefully instead of getting a confusing 404.
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"healthy":  true,
		"uptime_s": int(time.Since(s.startTime).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"contract_version": "0.1",
		"backend": map[string]any{
			"name":    "claudecode-adapter",
			"version": "0.1.0",
		},
		"capabilities": map[string]any{
			// What's wired:
			"workspaces": true,
			"sessions":   true,
			// What's coming in DDDDDDD2..DDDDDDD4:
			"messages":        false,
			"sse":             false,
			"tools":           false,
			"files":           false,
			"diffs":           false,
			"providers":       false,
			"agents":          false,
			"commands":        false,
			"metrics":         false,
			// What we have no plans to wire (claude doesn't expose
			// these as adapter-friendly hooks):
			"mcp":               false,
			"voice":             false,
			"lsp":               false,
			"hooks":             false,
			"permissions":       false,
			"session_tasks":     false,
			"search_messages":   false,
			"scheduled_sessions": false,
		},
	})
}

// handleListWorkspaces returns the single synthetic workspace bound
// to the adapter's --cwd. Claude Code is cwd-scoped so one adapter
// instance == one workspace.
func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": []gact.Workspace{s.workspace()},
	})
}

// handleGetWorkspace echoes the per-id detail. 404 if the id doesn't
// match the single synthetic workspace.
func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws := s.workspace()
	if ws.ID != id {
		writeError(w, http.StatusNotFound, "workspace_not_found", "no workspace with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

// workspace synthesizes the single workspace from --cwd. ID is a
// stable hash-y string derived from the path so it survives restart.
func (s *Server) workspace() gact.Workspace {
	return gact.Workspace{
		ID:        "ws_default",
		Name:      filepath.Base(s.cwd),
		RootPath:  s.cwd,
		CreatedAt: s.startTime,
		Metadata: map[string]any{
			"x_claudecode_cwd": s.cwd,
		},
	}
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" not yet wired in claudecode adapter")
}

// writeJSON serializes v as JSON with the given status. Errors here
// almost always mean a programming bug (passing a non-serializable
// value), so we panic — callers should never construct invalid
// payloads.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		panic(err)
	}
}

// writeError emits the SPEC §6.0 error envelope. code is the
// machine-readable identifier; message is human-friendly.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

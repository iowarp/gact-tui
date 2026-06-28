package claudecode

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"
	"time"
)

const (
	contractVersion = "0.1"
	backendName     = "claudecode-adapter"
	backendVersion  = "0.1.0"
)

// Server is the HTTP entry point. New() constructs one bound to a
// workspace cwd; Handler() returns the http.Handler for embedding.
type Server struct {
	mux     *http.ServeMux
	cwd     string
	bin     string
	started time.Time

	mu       sync.Mutex
	sessions map[string]*sessionState

	// Catalogs discovered from claude's first system/init frame.
	// Lazily populated by the first turn — cwd-dependent.
	toolNames     []string
	mcpServers    []map[string]any
	agentNames    []string
	slashCmdNames []string

	// TTTTTTT3: pending permission requests, keyed by GACT perm_id.
	// Lookup path: claude sends control_request -> adapter parks
	// here + broadcasts permission.requested -> TUI POSTs decision
	// -> we close the chan + write control_response back to claude.
	perms map[string]*pendingPerm
}

type sessionState struct {
	id          string
	workspaceID string
	title       string
	createdAt   time.Time
	status      string

	mu             sync.Mutex
	cachedMessages []map[string]any
	subscribers    []chan map[string]any
	turnLock       sync.Mutex
	proc           *claudeProcess
	// TTTTTTT4: in-flight streaming message id from message_start.
	// Used by stream_event translation to target deltas/completes
	// at the right Part. Cleared on message_stop.
	activeStreamMsgID string
}

// New builds a Server bound to the given workspace cwd and claude
// binary path (empty = "claude" via $PATH).
func New(cwd, bin string) *Server {
	if abs, err := filepath.Abs(cwd); err == nil {
		cwd = abs
	}
	s := &Server{
		mux:      http.NewServeMux(),
		cwd:      cwd,
		bin:      bin,
		started:  time.Now(),
		sessions: make(map[string]*sessionState),
		perms:    make(map[string]*pendingPerm),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

// Close releases subprocesses owned by active sessions.
func (s *Server) Close() {
	s.mu.Lock()
	sessions := make([]*sessionState, 0, len(s.sessions))
	for _, sess := range s.sessions {
		sessions = append(sessions, sess)
	}
	s.sessions = make(map[string]*sessionState)
	s.mu.Unlock()

	for _, sess := range sessions {
		if sess.proc != nil {
			sess.proc.close()
		}
	}
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("POST /v1/sessions", s.handleCreateSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}", s.handleDeleteSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{mid}", s.handleGetMessage)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
	s.mux.HandleFunc("GET /v1/tools", s.handleListTools)
	s.mux.HandleFunc("GET /v1/tools/{id}", s.handleGetTool)
	s.mux.HandleFunc("GET /v1/agents", s.handleListAgents)
	s.mux.HandleFunc("GET /v1/agents/{id}", s.handleGetAgent)
	s.mux.HandleFunc("GET /v1/commands", s.handleListCommands)
	s.mux.HandleFunc("GET /v1/metrics", s.handleMetrics)
	s.mux.HandleFunc("GET /v1/mcp/servers", s.handleListMcp)
	s.mux.HandleFunc("GET /v1/mcp/servers/{id}", s.handleGetMcp)
	s.mux.HandleFunc("GET /v1/sessions/{id}/export", s.handleExportSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/diffs", s.handleListDiffs)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{mid}/diffs", s.handleListMessageDiffs)
	s.mux.HandleFunc("GET /v1/permissions", s.handleListPermissions)
	s.mux.HandleFunc("GET /v1/permissions/{pid}", s.handleGetPermission)
	s.mux.HandleFunc("POST /v1/permissions/{pid}", s.handleRespondPermission)
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"healthy":  true,
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
			"workspaces":         true,
			"sessions":           true,
			"messages":           true,
			"sse":                true,
			"tools":              true,
			"files":              false,
			"diffs":              true,
			"providers":          false,
			"agents":             true,
			"commands":           true,
			"metrics":            true,
			"mcp":                true,
			"voice":              false,
			"lsp":                false,
			"hooks":              false,
			"permissions":        true,
			"session_tasks":      false,
			"search_messages":    false,
			"scheduled_sessions": false,
		},
	})
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" not yet wired in claudecode adapter")
}

// --- session helpers --------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{"code": code, "message": message},
	})
}

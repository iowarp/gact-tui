// Package server hosts the GACT v0.1 HTTP server for the emulator.
package server

import (
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
)

// Config configures a Server.
type Config struct {
	// Scenario is the scenario name to load (e.g. "default"). Reserved for
	// the scenario engine in PLAN A11.
	Scenario string
	// EventRingCapacity is the size of the bus replay ring (events). Pass 0
	// for the default (1024).
	EventRingCapacity int
	// OnUserMessage is invoked after a user message is stored via
	// POST /v1/sessions/{id}/messages. Used by scenario engines to drive
	// assistant responses. nil = no-op (emulator just stores user messages).
	OnUserMessage func(sessionID, messageID string)
	// OnCancel is invoked by POST /v1/sessions/{id}/cancel before the
	// session status is reset. Used by scenario engines to halt in-flight
	// scripts. nil = no-op.
	OnCancel func(sessionID string)
}

// Server is the GACT emulator HTTP server.
type Server struct {
	cfg     Config
	started time.Time
	mux     *http.ServeMux
	store   *store.Store
	bus     *events.Bus
	perms   *store.Permissions

	onUserMessage func(sessionID, messageID string)
	onCancel      func(sessionID string)
}

// New constructs a Server with routes registered, owning a fresh in-memory
// store and a fresh event bus.
func New(cfg Config) *Server {
	return NewWithStore(cfg, store.New())
}

// NewWithStore is like New but uses the provided store. The bus is always
// created internally; use Bus() to access it.
func NewWithStore(cfg Config, st *store.Store) *Server {
	s := &Server{
		cfg:           cfg,
		started:       time.Now(),
		mux:           http.NewServeMux(),
		store:         st,
		bus:           events.NewBus(cfg.EventRingCapacity),
		perms:         store.NewPermissions(),
		onUserMessage: cfg.OnUserMessage,
		onCancel:      cfg.OnCancel,
	}
	s.routes()
	return s
}

// Handler returns the HTTP handler for the server.
func (s *Server) Handler() http.Handler { return s.mux }

// Store returns the underlying store. Useful for callers that want to seed
// state before serving requests.
func (s *Server) Store() *store.Store { return s.store }

// Bus returns the underlying event bus. Useful for tests and the scenario
// engine that needs to publish events.
func (s *Server) Bus() *events.Bus { return s.bus }

// Permissions returns the underlying permissions store.
func (s *Server) Permissions() *store.Permissions { return s.perms }

// SetOnCancel installs/updates the post-cancel hook.
func (s *Server) SetOnCancel(fn func(sessionID string)) { s.onCancel = fn }

// Scenario returns the configured scenario name.
func (s *Server) Scenario() string { return s.cfg.Scenario }

// SetOnUserMessage installs/updates the post-user-message hook. Safe to call
// before serving traffic.
func (s *Server) SetOnUserMessage(fn func(sessionID, messageID string)) {
	s.onUserMessage = fn
}

// routes registers all GACT v0.1 endpoints. Each route uses Go 1.22+ method-
// prefixed pattern matching.
func (s *Server) routes() {
	// §3 — Capability discovery + health
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)

	// §6.1 — Workspaces
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("POST /v1/workspaces", s.handleCreateWorkspace)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("PATCH /v1/workspaces/{id}", s.handlePatchWorkspace)
	s.mux.HandleFunc("DELETE /v1/workspaces/{id}", s.handleDeleteWorkspace)

	// §6.2 — Sessions (must be registered before /v1/sessions/import to avoid
	// "import" being interpreted as a session ID; Go 1.22+ ServeMux is
	// pattern-matched, so explicit /v1/sessions/import wins over /{id}).
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("POST /v1/sessions", s.handleCreateSession)
	s.mux.HandleFunc("POST /v1/sessions/import", s.handleImportSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	s.mux.HandleFunc("PATCH /v1/sessions/{id}", s.handlePatchSession)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}", s.handleDeleteSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/fork", s.handleForkSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/cancel", s.handleCancelSession)
	s.mux.HandleFunc("POST /v1/sessions/{id}/summarize", s.handleSummarizeSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/export", s.handleExportSession)

	// §6.3 — Messages
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/search", s.handleSearchMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}", s.handleGetMessage)
	s.mux.HandleFunc("DELETE /v1/sessions/{id}/messages/{msg_id}", s.handleDeleteMessage)
	s.mux.HandleFunc("PATCH /v1/sessions/{id}/messages/{msg_id}/parts/{part_id}", s.handlePatchPart)

	// §6.11 — Permissions
	s.mux.HandleFunc("GET /v1/permissions", s.handleListPermissions)
	s.mux.HandleFunc("GET /v1/permissions/{id}", s.handleGetPermission)
	s.mux.HandleFunc("POST /v1/permissions/{id}", s.handleRespondPermission)

	// §7 — SSE event streams
	s.mux.HandleFunc("GET /v1/events", s.handleWorkspaceEvents)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
}

// Package server hosts the GACT v0.1 HTTP server for the emulator.
package server

import (
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
)

// Config configures a Server.
type Config struct {
	// Scenario is the scenario name to load (e.g. "default"). Reserved for
	// future use by the scenario engine in PLAN A11.
	Scenario string
}

// Server is the GACT emulator HTTP server.
type Server struct {
	cfg     Config
	started time.Time
	mux     *http.ServeMux
	store   *store.Store
}

// New constructs a Server with routes registered, owning a fresh in-memory
// store. Use NewWithStore if you want to inject a pre-populated store.
func New(cfg Config) *Server {
	return NewWithStore(cfg, store.New())
}

// NewWithStore is like New but uses the provided store. Useful for tests.
func NewWithStore(cfg Config, st *store.Store) *Server {
	s := &Server{
		cfg:     cfg,
		started: time.Now(),
		mux:     http.NewServeMux(),
		store:   st,
	}
	s.routes()
	return s
}

// Handler returns the HTTP handler for the server.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Store returns the underlying store. Useful for callers that want to seed
// state before serving requests.
func (s *Server) Store() *store.Store { return s.store }

// Scenario returns the configured scenario name.
func (s *Server) Scenario() string { return s.cfg.Scenario }

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
}

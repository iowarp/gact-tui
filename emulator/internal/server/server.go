// Package server hosts the GACT v0.1 HTTP server for the emulator.
package server

import (
	"net/http"
	"time"
)

// Config configures a Server.
type Config struct {
	// Scenario is the scenario name to load (e.g. "default"). Reserved for
	// future use; currently unused by the server but plumbed through for the
	// scenario engine in PLAN A11.
	Scenario string
}

// Server is the GACT emulator HTTP server.
type Server struct {
	cfg     Config
	started time.Time
	mux     *http.ServeMux
}

// New constructs a Server with routes registered.
func New(cfg Config) *Server {
	s := &Server{
		cfg:     cfg,
		started: time.Now(),
		mux:     http.NewServeMux(),
	}
	s.routes()
	return s
}

// Handler returns the HTTP handler for the server.
func (s *Server) Handler() http.Handler {
	return s.mux
}

// Scenario returns the configured scenario name.
func (s *Server) Scenario() string { return s.cfg.Scenario }

// routes registers all GACT v0.1 endpoints. Each route uses Go 1.22+ method-
// prefixed pattern matching.
func (s *Server) routes() {
	// §3 — Capability discovery + health
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)

	// Future routes register here as PLAN tasks A6+ are implemented.
}

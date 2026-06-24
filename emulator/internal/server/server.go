// Package server hosts the GACT v0.1 HTTP server for the emulator.
package server

import (
	"context"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
	// WalkWorkspaceFiles, when true, makes GET /v1/workspaces/{id}/files
	// walk the workspace's RootPath on disk. When false (default), the
	// handler returns a static demo list. Opt-in because deterministic
	// tests rely on the static fixture.
	WalkWorkspaceFiles bool
	// EmptyExpertPacks suppresses the static expert-pack fixtures. This is
	// used by visual-loop tests to exercise the operator empty state.
	EmptyExpertPacks bool
	// ExpertPackFailures enables deterministic expert-pack lifecycle
	// failures for visual-loop tests.
	ExpertPackFailures bool
	// EmptyPrompts suppresses the static prompt registry fixtures. This is
	// used by visual-loop tests to exercise the operator empty state.
	EmptyPrompts bool
	// EmptySkills suppresses static skill-source agents while leaving normal
	// experts available. This is used by visual-loop tests to exercise the
	// skills catalog empty state without removing the whole agent catalog.
	EmptySkills bool
	// PromptStress appends workspace/session/provider/invalid prompt registry
	// fixtures for visual-loop prompt catalog stress states.
	PromptStress bool
	// PromptSaveFailures makes prompt save requests fail deterministically.
	// Used by visual-loop tests to prove save errors remain visible.
	PromptSaveFailures bool
	// EmptyTools suppresses the static tool catalog. This is used by
	// visual-loop tests to exercise the operator empty state.
	EmptyTools bool
	// EmptyMcpConnections suppresses the static MCP connection catalog. This
	// is used by visual-loop tests to exercise the operator empty state.
	EmptyMcpConnections bool
	// PermissionStress seeds pending/resolved permission requests and
	// overlapping policies for visual-loop permission inspector demos.
	PermissionStress bool
	// MemoryUnavailable makes memory endpoints report unsupported. This is
	// used by visual-loop tests to exercise the operator fallback state.
	MemoryUnavailable bool
	// LongCommands appends a deterministic batch of commands in one
	// category. This is used by visual-loop tests to exercise palette
	// category scrolling without changing the default command catalog.
	LongCommands bool
	// AgentBlueprintFailures enables deterministic blueprint lifecycle
	// failures for visual-loop tests. Disabled by default so normal demos
	// keep the happy-path catalog.
	AgentBlueprintFailures bool
	// LongAgentBlueprints appends large, long-name blueprint/source
	// fixtures for visual-loop hierarchy and truncation tests.
	LongAgentBlueprints bool
	// LongAgents appends a deep, long-name agent hierarchy for visual-loop
	// tests that exercise tree indentation, scrolling, and rich detail rows.
	LongAgents bool
	// AgentFailures enables deterministic user-agent lifecycle failures for
	// visual-loop tests. Disabled by default so normal demos keep the
	// happy-path catalog.
	AgentFailures bool
	// CancelFailures makes session cancellation fail deterministically for
	// visual-loop tests that prove operator-visible cancel errors.
	CancelFailures bool
	// SessionCreateFailures makes POST /v1/sessions fail deterministically
	// after startup seeding, so visual-loop tests can prove create-session
	// errors without losing an already-attached session.
	SessionCreateFailures bool
	// SessionRenameFailures makes PATCH /v1/sessions title updates fail
	// deterministically for visual-loop tests that prove manual rename
	// failures remain operator-visible.
	SessionRenameFailures bool
	// ContextAddFailures makes POST /context/files fail deterministically for
	// visual-loop tests that prove add-context errors remain readable.
	ContextAddFailures bool
	// ProviderEdgeStates enables deterministic provider/auth/model catalog
	// warnings for visual-loop tests.
	ProviderEdgeStates bool
	// ProviderAuthSucceeds makes the provider edge-state auth endpoint mark
	// ALCF Sophia ready instead of returning a deterministic failure.
	ProviderAuthSucceeds bool
}

// Server is the GACT emulator HTTP server.
type Server struct {
	cfg              Config
	started          time.Time
	mux              *http.ServeMux
	store            *store.Store
	bus              *events.Bus
	perms            *store.Permissions
	contextFiles     *contextFileSet
	latency          *latencyTracker
	hooks            *hooksStore // §6.17 — MMM3
	tasks            *tasksStore // §6.18 — MMM5
	prompts          map[string]gact.PromptDefinition
	agents           map[string]gact.AgentDef
	agentsMu         sync.Mutex
	blueprintMu      sync.Mutex
	blueprintSources []gact.AgentBlueprintSource
	userQuestions    map[string]gact.UserQuestion
	providerAuthed   map[string]bool

	// v0.2 — synthetic memory cache counters (CLIO-BBBBBBBBBB3).
	// The emulator has no real cache; these are bumped by scenario
	// code to produce realistic-looking /v1/memory/stats output.
	memHits   int64
	memMisses int64

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
		cfg:            cfg,
		started:        time.Now(),
		mux:            http.NewServeMux(),
		store:          st,
		bus:            events.NewBus(cfg.EventRingCapacity),
		perms:          store.NewPermissions(),
		contextFiles:   newContextFileSet(),
		latency:        newLatencyTracker(1024),
		hooks:          newHooksStore(),
		tasks:          newTasksStore(),
		prompts:        staticPromptDefinitions(),
		agents:         map[string]gact.AgentDef{},
		userQuestions:  map[string]gact.UserQuestion{},
		providerAuthed: map[string]bool{},
		onUserMessage:  cfg.OnUserMessage,
		onCancel:       cfg.OnCancel,
	}
	if cfg.EmptyPrompts {
		s.prompts = map[string]gact.PromptDefinition{}
	} else if cfg.PromptStress {
		for id, prompt := range staticPromptStressDefinitions() {
			s.prompts[id] = prompt
		}
	}
	if cfg.LongAgents || cfg.AgentFailures {
		for _, agent := range staticAgentStressDefinitions() {
			if cfg.LongAgents || agent.ID == "fragile-user-expert" {
				s.agents[agent.ID] = agent
			}
		}
	}
	if cfg.PermissionStress {
		seedPermissionStress(s.perms)
	}
	s.routes()
	// MMM3: kick off the hook dispatcher. Background ctx — runs for the
	// server's lifetime; relies on bus.Subscribe being closed on bus
	// shutdown to signal exit.
	s.startHookDispatcher(context.Background())
	return s
}

// Handler returns the HTTP handler for the server. The mux is wrapped
// with timingMiddleware so per-route latency reservoirs feed into the
// /v1/metrics endpoint (SPEC §6.16).
func (s *Server) Handler() http.Handler {
	h := timingMiddleware(s.latency, s.mux)
	if os.Getenv("GACT_EMULATOR_LOG_REQUESTS") != "1" {
		return h
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("request %s %s", r.Method, r.URL.RequestURI())
		h.ServeHTTP(w, r)
	})
}

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

// Package acp is a GACT v0.2 adapter that fronts any ACP v1 agent. It
// exposes the GACT REST + SSE wire to a TUI / web / desktop client and
// translates each session into one agent subprocess speaking ACP
// (newline-delimited JSON-RPC over stdio).
//
//	desktop/web/tui  --GACT v0.2 (HTTP+SSE)-->  this adapter  --ACP v1 (stdio)-->  agent
//
// It is backend-agnostic. Point it at any ACP launch command — clio-coder
// (`clio acp`), Gemini CLI, etc. — and it works with no per-backend code.
// The backend identity reported to GACT is read from the ACP `initialize`
// handshake, so the agent needs no changes to be driven this way.
//
// Scope (v0.1 of the bridge): workspaces, sessions, messages (POST + the
// list/get cache), per-session SSE, the modal permission flow, cancel, and
// structured errors. Endpoints outside ACP's surface (providers, mcp,
// agents catalog, files, diffs, lsp) return 501 and are advertised false in
// /v1/capabilities so a well-behaved client never asks. See DESIGN.md.
package acp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"sync"
	"time"
)

const (
	contractVersion = "0.2"
	adapterVersion  = "0.1.0"

	promptTimeout = 10 * time.Minute // one assistant turn (model + tools)
	rpcTimeout    = 60 * time.Second // handshake / control requests
)

// Server is the HTTP entry point. New() binds it to a workspace cwd and an
// ACP launch command; Handler() returns the mux for embedding.
type Server struct {
	mux     *http.ServeMux
	cwd     string
	argv    []string // ACP launch command, e.g. ["clio","acp"]
	started time.Time

	// Backend identity, learned from the ACP initialize handshake at New().
	agentName    string
	agentVersion string
	agentTitle   string

	mu       sync.Mutex
	sessions map[string]*sessionState
	perms    map[string]*pendingPerm
}

type sessionState struct {
	id          string
	workspaceID string
	title       string
	model       string
	createdAt   time.Time

	mu             sync.Mutex
	status         string
	cachedMessages []map[string]any
	subscribers    []chan map[string]any

	turnLock sync.Mutex // serialises turns (ACP is single-prompt-at-a-time)
	proc     *agentProc
	acpID    string // the agent's ACP session id

	turn turnState // turn-scoped translation state (reset each runTurn)
}

type turnState struct {
	assistantMsgID string
	textPart       map[string]any
	thinkingPart   map[string]any
	toolParts      map[string]string // acp toolCallId -> gact part id
	parts          []map[string]any  // assembled parts for the cached message
}

// pendingPerm parks an ACP permission request until the client POSTs a
// decision. respCh carries the chosen ACP optionId back to the request
// goroutine ("" cancels).
type pendingPerm struct {
	id        string
	sessionID string
	record    map[string]any
	options   []permOption
	respCh    chan string
}

type permOption struct {
	optionID string
	kind     string
}

// New builds a Server bound to cwd. argv launches the ACP agent (defaults
// to ["clio","acp"]). It probes the agent once to learn its identity and
// returns a server that reports those values via /v1/capabilities.
func New(cwd string, argv []string) *Server {
	if abs, err := filepath.Abs(cwd); err == nil {
		cwd = abs
	}
	if len(argv) == 0 {
		argv = []string{"clio", "acp"}
	}
	s := &Server{
		mux:          http.NewServeMux(),
		cwd:          cwd,
		argv:         argv,
		started:      time.Now(),
		agentName:    "acp-agent",
		agentVersion: "unknown",
		sessions:     make(map[string]*sessionState),
		perms:        make(map[string]*pendingPerm),
	}
	s.probe()
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

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

// probe spawns a throwaway ACP process, runs `initialize`, and records the
// agent's reported identity. Best-effort: on failure the server keeps the
// generic defaults and the first real session will surface the error.
func (s *Server) probe() {
	ctx, cancel := context.WithTimeout(context.Background(), rpcTimeout)
	defer cancel()
	proc, err := newAgentProc(ctx, s.cwd, s.argv)
	if err != nil {
		return
	}
	defer proc.close()
	raw, err := proc.request("initialize", map[string]any{
		"protocolVersion": 1, "clientCapabilities": map[string]any{},
	}, rpcTimeout)
	if err != nil {
		return
	}
	var init struct {
		AgentInfo struct {
			Name    string `json:"name"`
			Title   string `json:"title"`
			Version string `json:"version"`
		} `json:"agentInfo"`
	}
	if json.Unmarshal(raw, &init) == nil {
		if init.AgentInfo.Name != "" {
			s.agentName = init.AgentInfo.Name
		}
		if init.AgentInfo.Version != "" {
			s.agentVersion = init.AgentInfo.Version
		}
		s.agentTitle = init.AgentInfo.Title
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
	s.mux.HandleFunc("POST /v1/sessions/{id}/cancel", s.handleCancelSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{mid}", s.handleGetMessage)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
	s.mux.HandleFunc("GET /v1/permissions", s.handleListPermissions)
	s.mux.HandleFunc("GET /v1/permissions/{pid}", s.handleGetPermission)
	s.mux.HandleFunc("POST /v1/permissions/{pid}", s.handleRespondPermission)
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"healthy": true, "uptime_s": int(time.Since(s.started).Seconds()), "overall_status": "ready",
	})
}

// handleCapabilities advertises the generic ACP feature set. ACP always
// gives sessions, streaming text/thinking, tool calls, and a synchronous
// permission gate; everything else is out of ACP's surface and 501s.
func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"contract_version": contractVersion,
		"backend": map[string]any{
			"name":    s.agentName, // e.g. "clio-coder", read from ACP initialize
			"version": s.agentVersion,
			"vendor":  "acp",
		},
		"capabilities": map[string]any{
			"workspaces":         true,
			"sessions":           true,
			"permissions":        true,
			"thinking_blocks":    true,
			"structured_errors":  true,
			"cost_tracking":      true,
			"subagents":          false,
			"mcp":                false,
			"lsp":                false,
			"files":              false,
			"diffs":              false,
			"providers":          false,
			"agents":             false,
			"commands":           false,
			"voice":              false,
			"metrics":            false,
			"search_messages":    false,
			"scheduled_sessions": false,
			"session_tasks":      false,
			"hooks":              false,
			"agent_routing":      false,
		},
		"transports": map[string]any{"events_sse": true, "events_websocket": false},
		"auth":       map[string]any{"schemes": []string{"trust_socket"}, "current": "trust_socket"},
		"extensions": []any{},
	})
}

func (s *Server) workspace() map[string]any {
	return map[string]any{
		"id":         "ws_default",
		"name":       filepath.Base(s.cwd),
		"root_path":  s.cwd,
		"created_at": s.started.UTC().Format(time.RFC3339),
		"updated_at": s.started.UTC().Format(time.RFC3339),
		"metadata":   map[string]any{"x_acp_cwd": s.cwd, "x_acp_command": s.argv},
	}
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": []any{s.workspace()}})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	ws := s.workspace()
	if r.PathValue("id") != ws["id"] {
		writeError(w, http.StatusNotFound, "not_found", "no workspace with id "+r.PathValue("id"))
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspace_id")
	out := make([]map[string]any, 0)
	s.mu.Lock()
	for _, sess := range s.sessions {
		if workspaceID != "" && sess.workspaceID != workspaceID {
			continue
		}
		out = append(out, sess.record())
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req struct {
		WorkspaceID string          `json:"workspace_id"`
		Title       string          `json:"title"`
		Model       json.RawMessage `json:"model"`
	}
	_ = json.Unmarshal(body, &req)
	if req.WorkspaceID == "" {
		req.WorkspaceID = "ws_default"
	}
	if req.Title == "" {
		req.Title = s.agentName + "-session"
	}
	sess := &sessionState{
		id:          "sess_" + newID(12),
		workspaceID: req.WorkspaceID,
		title:       req.Title,
		model:       modelLabel(req.Model),
		createdAt:   time.Now().UTC(),
		status:      "idle",
	}
	s.mu.Lock()
	s.sessions[sess.id] = sess
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, sess.record())
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	writeJSON(w, http.StatusOK, sess.record())
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	if ok {
		delete(s.sessions, id)
	}
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+id)
		return
	}
	if sess.proc != nil {
		sess.proc.notify("session/close", map[string]any{"sessionId": sess.acpID})
		sess.proc.close()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCancelSession(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	if sess.proc != nil && sess.acpID != "" {
		sess.proc.notify("session/cancel", map[string]any{"sessionId": sess.acpID})
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	sess.mu.Lock()
	out := append([]map[string]any{}, sess.cachedMessages...)
	sess.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"messages": out})
}

func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	mid := r.PathValue("mid")
	sess.mu.Lock()
	defer sess.mu.Unlock()
	for _, m := range sess.cachedMessages {
		if m["id"] == mid {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "no message with id "+mid)
}

// handlePostMessage echoes the user message, acks 202, and runs the
// assistant turn asynchronously (streamed over SSE per §7.4).
func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	defer r.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	var req struct {
		Text  string `json:"text"`
		Parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"parts"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", err.Error())
		return
	}
	text := req.Text
	for _, p := range req.Parts {
		if p.Type == "text" {
			text += p.Text
		}
	}
	if text == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "need text or a text part")
		return
	}

	userMsgID := "msg_" + newID(12)
	userMsg := map[string]any{
		"id": userMsgID, "session_id": sess.id, "role": "user", "created_at": nowISO(),
		"parts": []map[string]any{{"id": "part_" + newID(12), "type": "text", "text": text}},
	}
	sess.appendMessage(userMsg)
	sess.broadcast("message.created", map[string]any{"message": userMsg})

	go s.runTurn(sess, text)

	writeJSON(w, http.StatusAccepted, map[string]any{"message_id": userMsgID, "accepted_at": nowISO()})
}

// runTurn drives one assistant turn end to end: lazy-spawn the agent
// subprocess, send session/prompt, and let the bound onUpdate/onPermission
// callbacks translate the agent's streaming ACP into GACT SSE events.
func (s *Server) runTurn(sess *sessionState, text string) {
	sess.turnLock.Lock()
	defer sess.turnLock.Unlock()

	sess.setStatus("running")
	sess.broadcastStatus("running", "idle")

	if sess.proc == nil {
		if err := s.spawn(sess); err != nil {
			sess.fail(fmt.Sprintf("failed to start agent: %v", err))
			return
		}
	}

	sess.turn = turnState{assistantMsgID: "msg_" + newID(12), toolParts: make(map[string]string)}
	assistant := map[string]any{
		"id": sess.turn.assistantMsgID, "session_id": sess.id, "role": "assistant",
		"created_at": nowISO(), "parts": []map[string]any{},
	}
	sess.appendMessage(assistant)
	sess.broadcast("message.created", map[string]any{"message": assistant})

	resp, err := sess.proc.request("session/prompt", map[string]any{
		"sessionId": sess.acpID,
		"prompt":    []map[string]any{{"type": "text", "text": text}},
	}, promptTimeout)
	if err != nil {
		// A failed turn surfaces as a JSON-RPC error on session/prompt.
		sess.finishParts()
		sess.broadcast("message.completed", map[string]any{
			"message_id": sess.turn.assistantMsgID, "stop_reason": "error",
			"error_info": map[string]any{"error": "agent_error", "message": err.Error(), "recoverable": false},
		})
		sess.fail(err.Error())
		return
	}

	sess.finishParts()
	stop, tokens := parsePromptResult(resp)
	sess.broadcast("message.completed", map[string]any{
		"message_id": sess.turn.assistantMsgID, "stop_reason": stop, "tokens": tokens, "cost_usd": 0,
	})
	sess.setStatus("idle")
	sess.broadcastStatus("idle", "running")
}

// spawn starts the agent subprocess for a session, performs the ACP
// handshake (initialize + session/new), and binds the streaming callbacks.
func (s *Server) spawn(sess *sessionState) error {
	proc, err := newAgentProc(context.Background(), s.cwd, s.argv)
	if err != nil {
		return err
	}
	proc.onUpdate = func(update map[string]any) { sess.translateUpdate(update) }
	proc.onPermission = func(params map[string]any) string { return s.handlePermission(sess, params) }

	if _, err := proc.request("initialize", map[string]any{
		"protocolVersion": 1, "clientCapabilities": map[string]any{},
	}, rpcTimeout); err != nil {
		proc.close()
		return err
	}
	raw, err := proc.request("session/new", map[string]any{"cwd": s.cwd, "mcpServers": []any{}}, rpcTimeout)
	if err != nil {
		proc.close()
		return err
	}
	var sn struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(raw, &sn); err != nil || sn.SessionID == "" {
		proc.close()
		return fmt.Errorf("session/new returned no sessionId")
	}
	sess.proc = proc
	sess.acpID = sn.SessionID
	return nil
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" is outside the ACP bridge surface")
}

func (s *Server) lookup(id string) *sessionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[id]
}

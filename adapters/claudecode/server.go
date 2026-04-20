package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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

	// Tool catalog discovered from claude's first system/init frame.
	// Lazily populated by the first turn.
	toolNames []string
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
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

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
		Name:      filepath.Base(s.cwd),
		RootPath:  s.cwd,
		CreatedAt: s.started,
		Metadata:  map[string]any{"x_claudecode_cwd": s.cwd},
	}
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
		WorkspaceID string `json:"workspace_id"`
		Title       string `json:"title"`
	}
	_ = json.Unmarshal(body, &req)
	if req.WorkspaceID == "" {
		req.WorkspaceID = "ws_default"
	}
	if req.Title == "" {
		req.Title = "claude-session"
	}
	sess := &sessionState{
		id:          "sess_" + newID(12),
		workspaceID: req.WorkspaceID,
		title:       req.Title,
		createdAt:   time.Now().UTC(),
		status:      "idle",
	}
	s.mu.Lock()
	s.sessions[sess.id] = sess
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, sess.record())
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
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
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if sess.proc != nil {
		sess.proc.close()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	sess.mu.Lock()
	out := append([]map[string]any{}, sess.cachedMessages...)
	sess.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"messages": out})
}

func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("mid")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	for _, m := range sess.cachedMessages {
		if mid == m["id"] {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	defer r.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req struct {
		Parts []struct {
			Type string `json:"type"`
			Text string `json:"text,omitempty"`
		} `json:"parts"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	var text string
	for _, p := range req.Parts {
		if p.Type == "text" {
			text += p.Text
		}
	}
	if text == "" {
		writeError(w, http.StatusBadRequest, "empty_message", "need at least one text part")
		return
	}
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}

	// User echo — broadcast + cache immediately so SSE consumers
	// see the user message before claude's reply lands.
	userMsgID := "msg_" + newID(12)
	userRecord := map[string]any{
		"id":         userMsgID,
		"session_id": sess.id,
		"role":       "user",
		"parts": []map[string]any{
			{"id": "part_" + newID(12), "type": "text", "text": text},
		},
		"created_at": nowISO(),
	}
	sess.appendMessage(userRecord)
	sess.broadcast(gactEvent{Type: "message.created", Payload: userRecord})

	go s.runTurn(sess, text)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"message_id":  userMsgID,
		"accepted_at": nowISO(),
	})
}

// runTurn drives one assistant turn: lazy-spawn the claude
// subprocess on first use, send the user text, drain output frames
// until result, broadcast each as a GACT event.
func (s *Server) runTurn(sess *sessionState, text string) {
	sess.turnLock.Lock()
	defer sess.turnLock.Unlock()

	sess.setStatus("running")
	sess.broadcast(gactEvent{Type: "session.status_changed", Payload: map[string]any{
		"session_id": sess.id, "status": "running", "prev_status": "idle",
	}})

	if sess.proc == nil {
		ctx := context.Background()
		proc, err := newClaudeProcess(ctx, claudeOptions{cwd: s.cwd, bin: s.bin})
		if err != nil {
			sess.setStatus("error")
			sess.broadcast(gactEvent{Type: "session.status_changed", Payload: map[string]any{
				"session_id": sess.id, "status": "error", "prev_status": "running",
				"error": err.Error(),
			}})
			return
		}
		sess.proc = proc
	}

	if err := sess.proc.sendUserText(text); err != nil {
		sess.setStatus("error")
		sess.broadcast(gactEvent{Type: "session.status_changed", Payload: map[string]any{
			"session_id": sess.id, "status": "error", "prev_status": "running",
			"error": err.Error(),
		}})
		return
	}

	for ev := range sess.proc.events {
		// Capture catalogs from system/init.
		if t, _ := ev["type"].(string); t == "system" {
			if sub, _ := ev["subtype"].(string); sub == "init" {
				s.captureCatalogs(ev)
			}
		}
		for _, gactEv := range translateClaudeEvent(ev, sess.id) {
			sess.broadcast(gactEv)
			if gactEv.Type == "message.created" {
				sess.appendMessage(gactEv.Payload)
			}
			if gactEv.Type == "session.status_changed" {
				if st, _ := gactEv.Payload["status"].(string); st == "idle" || st == "error" {
					sess.setStatus(st)
					return
				}
			}
		}
	}
}

func (s *Server) captureCatalogs(initEv map[string]any) {
	tools, _ := initEv["tools"].([]any)
	if len(tools) == 0 {
		return
	}
	s.mu.Lock()
	if len(s.toolNames) == 0 {
		for _, t := range tools {
			if name, ok := t.(string); ok {
				s.toolNames = append(s.toolNames, name)
			}
		}
	}
	s.mu.Unlock()
}

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.toolNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "name": n, "source": "builtin",
			"input_schema": map[string]any{"type": "object"},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": out})
}

func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	ch := make(chan map[string]any, 64)
	sess.subscribe(ch)
	defer sess.unsubscribe(ch)

	writeSSE(w, "server.connected", map[string]any{"session_id": id})
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			writeSSE(w, "server.heartbeat", map[string]any{})
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			t, _ := ev["type"].(string)
			pl, _ := ev["payload"].(map[string]any)
			writeSSE(w, t, pl)
			flusher.Flush()
		}
	}
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" not yet wired in claudecode adapter")
}

// --- session helpers --------------------------------------------------

func (sess *sessionState) record() map[string]any {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	return map[string]any{
		"id":           sess.id,
		"workspace_id": sess.workspaceID,
		"title":        sess.title,
		"status":       sess.status,
		"created_at":   sess.createdAt.UTC().Format(time.RFC3339),
	}
}

func (sess *sessionState) setStatus(s string) {
	sess.mu.Lock()
	sess.status = s
	sess.mu.Unlock()
}

func (sess *sessionState) appendMessage(m map[string]any) {
	sess.mu.Lock()
	sess.cachedMessages = append(sess.cachedMessages, m)
	sess.mu.Unlock()
}

func (sess *sessionState) subscribe(ch chan map[string]any) {
	sess.mu.Lock()
	sess.subscribers = append(sess.subscribers, ch)
	sess.mu.Unlock()
}

func (sess *sessionState) unsubscribe(ch chan map[string]any) {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	for i, c := range sess.subscribers {
		if c == ch {
			sess.subscribers = append(sess.subscribers[:i], sess.subscribers[i+1:]...)
			break
		}
	}
	close(ch)
}

func (sess *sessionState) broadcast(ev gactEvent) {
	wrapped := map[string]any{"type": ev.Type, "payload": ev.Payload}
	sess.mu.Lock()
	subs := append([]chan map[string]any{}, sess.subscribers...)
	sess.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- wrapped:
		default: // drop rather than backpressure
		}
	}
}

// --- HTTP helpers -----------------------------------------------------

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

func writeSSE(w io.Writer, eventType string, payload map[string]any) {
	if eventType == "" {
		eventType = "message"
	}
	body := map[string]any{
		"type":        eventType,
		"occurred_at": nowISO(),
		"payload":     payload,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return
	}
	id := time.Now().UnixNano()
	fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", id, eventType, buf)
}

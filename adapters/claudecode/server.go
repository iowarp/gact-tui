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

// pendingPerm tracks a permission request mid-flight: the metadata
// the GET /v1/permissions list exposes plus the request_id we need
// to send back in the control_response and a chan to wake up the
// goroutine that's blocking on the user's decision.
type pendingPerm struct {
	id        string         // GACT permission id (perm_xxx)
	requestID string         // claude's control_request request_id
	sessionID string
	record    map[string]any // PermissionRequest dict for GET /v1/permissions
	resp      chan permResp
}

// permResp is the user's allow/deny decision flowing back to the
// goroutine that's mid-control_request.
type permResp struct {
	allowed bool
	action  string // allow|deny|allow_session|allow_workspace
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
		t, _ := ev["type"].(string)
		// TTTTTTT3: control_request handshake — claude asks the
		// adapter (via stdio control protocol) whether a tool may
		// run. Park the request, broadcast permission.requested,
		// wait for the user's POST decision, write control_response
		// back. Concurrent — runs in its own goroutine so the
		// event loop keeps draining (heartbeats, status, etc.).
		if t == "control_request" {
			go s.handleControlRequest(sess, ev)
			continue
		}
		// Capture catalogs from system/init.
		if t == "system" {
			if sub, _ := ev["subtype"].(string); sub == "init" {
				s.captureCatalogs(ev)
			}
		}
		// TTTTTTT4: stream_event frames carry the Anthropic
		// streaming protocol. Threaded session.activeStreamMsgID
		// because message_start is the only frame with the id.
		if t == "stream_event" {
			events, newID := translateStreamEvent(ev, sess.id, sess.activeStreamMsgID)
			sess.activeStreamMsgID = newID
			for _, gactEv := range events {
				sess.broadcast(gactEv)
			}
			continue
		}
		for _, gactEv := range translateClaudeEvent(ev, sess.id, s.cwd) {
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

// handleControlRequest is the adapter side of the can_use_tool
// control protocol. claude sends:
//
//	{"type":"control_request","request_id":"req_xx",
//	 "request":{"subtype":"can_use_tool","tool_name":"Write",
//	            "input":{...},"tool_use_id":"toolu_xx"}}
//
// We park the request, broadcast a SPEC §6.11 permission.requested
// event, await the user's POST /v1/permissions/{pid} decision,
// then write back:
//
//	{"type":"control_response",
//	 "response":{"request_id":"req_xx",
//	             "data":{"behavior":"allow","updated_input":null}}}
func (s *Server) handleControlRequest(sess *sessionState, raw map[string]any) {
	requestID, _ := raw["request_id"].(string)
	req, _ := raw["request"].(map[string]any)
	subtype, _ := req["subtype"].(string)
	if subtype != "can_use_tool" {
		// Other control requests aren't ours to answer; ignore.
		return
	}
	toolName, _ := req["tool_name"].(string)
	input, _ := req["input"].(map[string]any)
	toolUseID, _ := req["tool_use_id"].(string)

	pid := "perm_" + newID(12)
	rec := map[string]any{
		"id":         pid,
		"session_id": sess.id,
		"tool_call": map[string]any{
			"call_id":     toolUseID,
			"tool_name":   toolName,
			"input":       input,
			"annotations": map[string]any{},
		},
		"summary":    "Run tool: " + toolName,
		"created_at": nowISO(),
		"resolved":   false,
	}
	respCh := make(chan permResp, 1)
	pp := &pendingPerm{
		id: pid, requestID: requestID, sessionID: sess.id,
		record: rec, resp: respCh,
	}
	s.mu.Lock()
	s.perms[pid] = pp
	s.mu.Unlock()

	// Status flip + broadcast.
	prev := sess.statusSnap()
	sess.setStatus("waiting_permission")
	sess.broadcast(gactEvent{Type: "session.status_changed", Payload: map[string]any{
		"session_id": sess.id, "status": "waiting_permission", "prev_status": prev,
	}})
	sess.broadcast(gactEvent{Type: "permission.requested", Payload: rec})

	decision := <-respCh

	sess.setStatus("running")
	sess.broadcast(gactEvent{Type: "session.status_changed", Payload: map[string]any{
		"session_id": sess.id, "status": "running", "prev_status": "waiting_permission",
	}})

	// Build + send the control_response back to claude over stdin.
	var data map[string]any
	if decision.allowed {
		data = map[string]any{
			"behavior":            "allow",
			"updated_input":       nil,
			"updated_permissions": nil,
		}
	} else {
		data = map[string]any{
			"behavior":  "deny",
			"message":   "denied via gact TUI permission flow",
			"interrupt": false,
		}
	}
	frame := map[string]any{
		"type": "control_response",
		"response": map[string]any{
			"request_id": requestID,
			"data":       data,
		},
	}
	if err := sess.proc.send(frame); err != nil {
		// Best-effort — if the subprocess died mid-way the next
		// receive_response iteration will surface it as ResultMessage.
		_ = err
	}
}

// statusSnap reads sess.status under the lock — used by the perm
// flow which updates status under a fresh lock.
func (sess *sessionState) statusSnap() string {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	return sess.status
}

func (s *Server) handleListPermissions(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	status := r.URL.Query().Get("status")
	out := make([]map[string]any, 0)
	s.mu.Lock()
	for _, pp := range s.perms {
		if sessionID != "" && pp.sessionID != sessionID {
			continue
		}
		if status == "pending" {
			if resolved, _ := pp.record["resolved"].(bool); resolved {
				continue
			}
		}
		out = append(out, pp.record)
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"permissions": out})
}

func (s *Server) handleGetPermission(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	s.mu.Lock()
	pp, ok := s.perms[pid]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "permission_not_found", "no permission with id "+pid)
		return
	}
	writeJSON(w, http.StatusOK, pp.record)
}

func (s *Server) handleRespondPermission(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	defer r.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<10))
	var req struct {
		Action string `json:"action"`
	}
	_ = json.Unmarshal(body, &req)
	switch req.Action {
	case "allow", "deny", "allow_session", "allow_workspace":
	default:
		writeError(w, http.StatusBadRequest, "invalid_action",
			"action must be allow|deny|allow_session|allow_workspace")
		return
	}
	s.mu.Lock()
	pp, ok := s.perms[pid]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "permission_not_found", "no permission with id "+pid)
		return
	}
	if resolved, _ := pp.record["resolved"].(bool); resolved {
		writeError(w, http.StatusConflict, "already_resolved",
			"permission "+pid+" already resolved")
		return
	}
	allowed := req.Action == "allow" || req.Action == "allow_session" || req.Action == "allow_workspace"
	pp.record["resolved"] = true
	pp.record["action"] = req.Action
	pp.resp <- permResp{allowed: allowed, action: req.Action}

	// Broadcast permission.resolved on the session's SSE.
	s.mu.Lock()
	sess, sok := s.sessions[pp.sessionID]
	s.mu.Unlock()
	if sok {
		sess.broadcast(gactEvent{Type: "permission.resolved", Payload: map[string]any{
			"permission_id": pid, "session_id": pp.sessionID, "action": req.Action,
		}})
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": pid, "action": req.Action})
}

func (s *Server) captureCatalogs(initEv map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.toolNames) == 0 {
		if tools, _ := initEv["tools"].([]any); len(tools) > 0 {
			for _, t := range tools {
				if name, ok := t.(string); ok {
					s.toolNames = append(s.toolNames, name)
				}
			}
		}
	}
	if len(s.agentNames) == 0 {
		if agents, _ := initEv["agents"].([]any); len(agents) > 0 {
			for _, a := range agents {
				if name, ok := a.(string); ok {
					s.agentNames = append(s.agentNames, name)
				}
			}
		}
	}
	if len(s.slashCmdNames) == 0 {
		if cmds, _ := initEv["slash_commands"].([]any); len(cmds) > 0 {
			for _, c := range cmds {
				if name, ok := c.(string); ok {
					s.slashCmdNames = append(s.slashCmdNames, name)
				}
			}
		}
	}
	if len(s.mcpServers) == 0 {
		if servers, _ := initEv["mcp_servers"].([]any); len(servers) > 0 {
			statusMap := map[string]string{
				"connected":  "ready",
				"needs-auth": "error",
				"failed":     "error",
				"pending":    "connecting",
			}
			for _, raw := range servers {
				m, ok := raw.(map[string]any)
				if !ok {
					continue
				}
				name, _ := m["name"].(string)
				if name == "" {
					continue
				}
				rawStatus, _ := m["status"].(string)
				gactStatus := statusMap[rawStatus]
				if gactStatus == "" {
					gactStatus = "disconnected"
				}
				s.mcpServers = append(s.mcpServers, map[string]any{
					"id":                       slugify(name),
					"name":                     name,
					"transport":                "stdio",
					"status":                   gactStatus,
					"x_claudecode_raw_status":  rawStatus,
				})
			}
		}
	}
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

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.toolNames {
		if n == id {
			writeJSON(w, http.StatusOK, map[string]any{
				"id": n, "name": n, "source": "builtin",
				"input_schema": map[string]any{"type": "object"},
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.agentNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "source": "builtin", "title": n,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": out})
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.agentNames {
		if n == id {
			writeJSON(w, http.StatusOK, map[string]any{
				"id": n, "source": "builtin", "title": n,
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "agent_not_found", "no agent with id "+id)
}

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.slashCmdNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "title": n, "source": "builtin",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": out})
}

func (s *Server) handleListMcp(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	out := append([]map[string]any{}, s.mcpServers...)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"servers": out})
}

func (s *Server) handleGetMcp(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, srv := range s.mcpServers {
		if srv["id"] == id {
			writeJSON(w, http.StatusOK, srv)
			return
		}
	}
	writeError(w, http.StatusNotFound, "server_not_found", "no mcp server with id "+id)
}

// handleMetrics synthesises a SPEC §6.16 metrics envelope from
// adapter state — uptime + per-status session counters + per-role
// message counters + token usage rolled up from cached assistant
// messages.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	sessionsCopy := make([]*sessionState, 0, len(s.sessions))
	for _, sess := range s.sessions {
		sessionsCopy = append(sessionsCopy, sess)
	}
	s.mu.Unlock()

	byStatus := map[string]int{
		"idle": 0, "running": 0, "waiting_permission": 0, "error": 0,
	}
	byRole := map[string]int{"user": 0, "assistant": 0, "system": 0, "tool": 0}
	var inputTot, outputTot, cacheReadTot, cacheWriteTot int64
	var msgTotal, active int
	for _, sess := range sessionsCopy {
		sess.mu.Lock()
		st := sess.status
		msgs := append([]map[string]any{}, sess.cachedMessages...)
		sess.mu.Unlock()
		if _, ok := byStatus[st]; ok {
			byStatus[st]++
		}
		if st == "running" || st == "waiting_permission" {
			active++
		}
		for _, m := range msgs {
			msgTotal++
			if role, _ := m["role"].(string); byRole[role] >= 0 {
				byRole[role]++
			}
			usage, _ := m["usage"].(map[string]any)
			inputTot += int64Of(usage["input_tokens"])
			outputTot += int64Of(usage["output_tokens"])
			cacheReadTot += int64Of(usage["cache_read_input_tokens"])
			cacheWriteTot += int64Of(usage["cache_creation_input_tokens"])
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uptime_s": int(time.Since(s.started).Seconds()),
		"sessions": map[string]any{
			"total":     len(sessionsCopy),
			"active":    active,
			"by_status": byStatus,
		},
		"messages": map[string]any{
			"total":   msgTotal,
			"by_role": byRole,
		},
		"tokens": map[string]any{
			"input_total":       inputTot,
			"output_total":      outputTot,
			"cache_read_total":  cacheReadTot,
			"cache_write_total": cacheWriteTot,
		},
	})
}

// handleExportSession serialises a session as a SPEC §6.2 export
// blob — session record + cached messages + timestamp.
func (s *Server) handleExportSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	sess.mu.Lock()
	msgs := append([]map[string]any{}, sess.cachedMessages...)
	sess.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"session":              sess.record(),
		"messages":             msgs,
		"exported_at":          nowISO(),
		"x_claudecode_version": backendVersion,
	})
}

// handleListDiffs aggregates every file_diff Part across the
// session's cached messages.
func (s *Server) handleListDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	sess, ok := s.sessions[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	sess.mu.Lock()
	msgs := append([]map[string]any{}, sess.cachedMessages...)
	sess.mu.Unlock()
	out := []map[string]any{}
	for _, m := range msgs {
		parts, _ := m["parts"].([]map[string]any)
		for _, p := range parts {
			if p["type"] == "file_diff" {
				out = append(out, p)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"diffs": out})
}

func (s *Server) handleListMessageDiffs(w http.ResponseWriter, r *http.Request) {
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
		if m["id"] != mid {
			continue
		}
		out := []map[string]any{}
		parts, _ := m["parts"].([]map[string]any)
		for _, p := range parts {
			if p["type"] == "file_diff" {
				out = append(out, p)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"diffs": out})
		return
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

// slugify produces a stable URL-safe id from a free-form name —
// used for synthetic MCP server ids since the SDK only gives names.
func slugify(name string) string {
	b := make([]byte, 0, len(name)+4)
	b = append(b, 'm', 'c', 'p', '_')
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b = append(b, byte(r))
		case r >= 'A' && r <= 'Z':
			b = append(b, byte(r-'A'+'a'))
		default:
			b = append(b, '_')
		}
	}
	// Trim trailing underscores.
	for len(b) > 4 && b[len(b)-1] == '_' {
		b = b[:len(b)-1]
	}
	return string(b)
}

// int64Of coerces a JSON-decoded number to int64 (json.Number,
// float64, or int land here depending on decode path).
func int64Of(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	}
	return 0
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

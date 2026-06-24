package claudecode

import (
	"encoding/json"
	"io"
	"net/http"
)

// pendingPerm tracks a permission request mid-flight: the metadata
// the GET /v1/permissions list exposes plus the request_id we need
// to send back in the control_response and a chan to wake up the
// goroutine that's blocking on the user's decision.
type pendingPerm struct {
	id        string // GACT permission id (perm_xxx)
	requestID string // claude's control_request request_id
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
		// Best-effort: if the subprocess died mid-way, receive_response will surface it.
		_ = err
	}
}

// statusSnap reads sess.status under the lock. The permission flow
// updates status from a separate goroutine.
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

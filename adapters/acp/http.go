package acp

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// --- permission flow (SPEC §6.11) ------------------------------------------

// handlePermission parks an ACP permission request, broadcasts
// permission.requested, and blocks (on the ACP reader's request goroutine)
// until the client POSTs a decision. It returns the agent-supplied optionId
// to select — chosen generically from the request's own `options` array by
// kind ("allow*" vs "reject*"/"deny*"), so it works with any ACP agent.
func (s *Server) handlePermission(sess *sessionState, params map[string]any) string {
	tc, _ := params["toolCall"].(map[string]any)
	callID, _ := tc["toolCallId"].(string)
	toolName, _ := tc["title"].(string)
	input, _ := tc["rawInput"].(map[string]any)
	options := parseOptions(params["options"])

	pid := "perm_" + newID(12)
	record := map[string]any{
		"id": pid, "session_id": sess.id,
		"tool_call": map[string]any{
			"call_id": callID, "tool_name": toolName, "input": input, "annotations": map[string]any{},
		},
		"summary": "Run tool: " + toolName, "created_at": nowISO(), "resolved": false,
	}
	respCh := make(chan string, 1)
	s.mu.Lock()
	s.perms[pid] = &pendingPerm{id: pid, sessionID: sess.id, record: record, options: options, respCh: respCh}
	s.mu.Unlock()

	sess.setStatus("waiting_permission")
	sess.broadcastStatus("waiting_permission", "running")
	sess.broadcast("permission.requested", map[string]any{"permission": record})

	decision := <-respCh // "allow" | "deny"

	sess.setStatus("running")
	sess.broadcastStatus("running", "waiting_permission")
	sess.broadcast("permission.resolved", map[string]any{
		"permission_id": pid, "session_id": sess.id, "action": decision,
	})

	return pickOption(options, decision == "allow")
}

func parseOptions(v any) []permOption {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]permOption, 0, len(arr))
	for _, e := range arr {
		m, ok := e.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["optionId"].(string)
		kind, _ := m["kind"].(string)
		if id != "" {
			out = append(out, permOption{optionID: id, kind: kind})
		}
	}
	return out
}

// pickOption selects an allow/reject optionId by kind, preferring the
// "_once" variant. Falls back to "" (cancel) if no matching option exists.
func pickOption(options []permOption, allow bool) string {
	want := "reject"
	if allow {
		want = "allow"
	}
	var match string
	for _, o := range options {
		if !strings.HasPrefix(o.kind, want) && !(want == "reject" && strings.HasPrefix(o.kind, "deny")) {
			continue
		}
		if strings.HasSuffix(o.kind, "once") {
			return o.optionID // best match
		}
		if match == "" {
			match = o.optionID
		}
	}
	return match
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
		writeError(w, http.StatusNotFound, "not_found", "no permission with id "+pid)
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
		writeError(w, http.StatusBadRequest, "validation_error",
			"action must be allow|deny|allow_session|allow_workspace")
		return
	}
	s.mu.Lock()
	pp, ok := s.perms[pid]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "no permission with id "+pid)
		return
	}
	if resolved, _ := pp.record["resolved"].(bool); resolved {
		writeError(w, http.StatusConflict, "conflict", "permission "+pid+" already resolved")
		return
	}
	pp.record["resolved"] = true
	pp.record["action"] = req.Action
	decision := "deny"
	if strings.HasPrefix(req.Action, "allow") {
		decision = "allow"
	}
	pp.respCh <- decision
	writeJSON(w, http.StatusOK, map[string]any{"id": pid, "action": req.Action})
}

// --- SSE (SPEC §7) ---------------------------------------------------------

func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	sess := s.lookup(r.PathValue("id"))
	if sess == nil {
		writeError(w, http.StatusNotFound, "not_found", "no session with id "+r.PathValue("id"))
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	ch := make(chan map[string]any, 256)
	sess.subscribe(ch)
	defer sess.unsubscribe(ch)

	// On connect: server.connected, then an authoritative session.snapshot
	// so the client can reconcile (SPEC §7.1).
	writeSSE(w, "server.connected", map[string]any{"server_version": adapterVersion})
	writeSSE(w, "session.snapshot", map[string]any{
		"session_id": sess.id, "status": sess.statusSnap(), "updated_at": nowISO(), "authoritative": true,
	})
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

// --- session helpers -------------------------------------------------------

func (sess *sessionState) record() map[string]any {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	return map[string]any{
		"id": sess.id, "workspace_id": sess.workspaceID, "title": sess.title, "status": sess.status,
		"model": map[string]any{"model_id": sess.model}, "message_count": len(sess.cachedMessages),
		"created_at": sess.createdAt.UTC().Format(time.RFC3339), "updated_at": nowISO(),
	}
}

func (sess *sessionState) statusSnap() string {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	return sess.status
}

func (sess *sessionState) setStatus(st string) {
	sess.mu.Lock()
	sess.status = st
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

// broadcast fans a GACT event out to every SSE subscriber. Slow consumers
// are dropped rather than backpressuring the translator.
func (sess *sessionState) broadcast(eventType string, payload map[string]any) {
	wrapped := map[string]any{"type": eventType, "payload": payload}
	sess.mu.Lock()
	subs := append([]chan map[string]any{}, sess.subscribers...)
	sess.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- wrapped:
		default:
		}
	}
}

func (sess *sessionState) broadcastStatus(status, prev string) {
	sess.broadcast("session.status_changed", map[string]any{
		"session_id": sess.id, "status": status, "prev_status": prev,
	})
}

func (sess *sessionState) fail(msg string) {
	sess.setStatus("error")
	sess.broadcast("session.status_changed", map[string]any{
		"session_id": sess.id, "status": "error", "error": msg,
	})
}

// --- HTTP / SSE wire helpers -----------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// writeError emits the GACT error envelope. The discriminator is written to
// both `code` (v0.1) and `error` (v0.2 §14) so either-reading clients and
// the conformance suite accept it.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code": code, "error": code, "message": message,
			"details": map[string]any{}, "recoverable": status >= 500,
		},
	})
}

var sseSeq int64

func writeSSE(w io.Writer, eventType string, payload map[string]any) {
	if eventType == "" {
		eventType = "message"
	}
	body, err := json.Marshal(map[string]any{"type": eventType, "occurred_at": nowISO(), "payload": payload})
	if err != nil {
		return
	}
	sseSeq++
	fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", sseSeq, eventType, body)
}

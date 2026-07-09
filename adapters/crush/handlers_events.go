package crush

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// handleSessionEvents proxies Crush's workspace event stream as a
// per-session SSE feed, dropping events that don't belong to the
// requested session ID. Crush only exposes a workspace-scoped stream
// (`/v1/workspaces/{id}/events`); GACT clients want
// `/v1/sessions/{id}/events`, so we filter at the adapter.
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = s.defaultWsID
	}
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "missing_workspace",
			"adapter requires workspace_id query for session events stream")
		return
	}
	s.proxySSE(w, r, wsID, r.PathValue("id"))
}

// handleWorkspaceEvents is the unfiltered variant — any event in the
// workspace passes through. workspace_id query OR --default-workspace
// must be set.
func (s *Server) handleWorkspaceEvents(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = s.defaultWsID
	}
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "missing_workspace",
			"adapter requires workspace_id query for events stream")
		return
	}
	s.proxySSE(w, r, wsID, "")
}

// proxySSE pumps Crush's workspace SSE through the GACT translator.
// sessionFilter, if non-empty, drops events not matching that session.
//
// We don't reuse Server.client (timeout=10s) for the upstream connection
// because SSE is long-lived; a fresh client with Timeout=0 keeps the
// connection open until either the GACT client disconnects or Crush
// closes the stream.
func (s *Server) proxySSE(w http.ResponseWriter, r *http.Request, wsID, sessionFilter string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "no_streaming",
			"response writer doesn't support flushing")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	upURL := s.upstream + "/v1/workspaces/" + wsID + "/events"
	upReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upURL, nil)
	if err != nil {
		writeSSELine(w, flusher, "server.error", map[string]any{"error": err.Error()})
		return
	}
	upReq.Header.Set("Accept", "text/event-stream")
	// SSE is long-lived — can't reuse the RPC client's 10 s timeout.
	// ResolveUpstreamTransport yields a fresh Transport that speaks
	// the right wire (TCP or Unix socket) for the original --upstream.
	streamClient := &http.Client{Timeout: 0, Transport: ResolveUpstreamTransport(s.rawUpstream)}
	resp, err := streamClient.Do(upReq)
	if err != nil {
		writeSSELine(w, flusher, "server.error", map[string]any{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		writeSSELine(w, flusher, "server.error", map[string]any{
			"status": resp.StatusCode, "url": upURL,
		})
		return
	}

	writeSSELine(w, flusher, "server.connected", map[string]any{"upstream": s.upstream, "workspace_id": wsID})
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	rdr := bufio.NewReader(resp.Body)
	dataLines := make(chan []byte, 32)

	go func() {
		defer close(dataLines)
		for {
			line, err := rdr.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimRight(line, "\n")
			if strings.HasPrefix(line, "data: ") {
				select {
				case dataLines <- []byte(strings.TrimPrefix(line, "data: ")):
				case <-r.Context().Done():
					return
				}
			}
		}
	}()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			writeSSELine(w, flusher, "server.heartbeat", map[string]any{})
		case raw, ok := <-dataLines:
			if !ok {
				writeSSELine(w, flusher, "server.disposed", map[string]any{
					"reason": "upstream_closed",
				})
				return
			}
			ev, payload, sid, ok := translateCrushEvent(raw, sessionFilter)
			if !ok {
				continue
			}
			if sessionFilter != "" && sid != "" && sid != sessionFilter {
				continue
			}
			writeSSELine(w, flusher, ev, payload)
		}
	}
}

// translateCrushEvent maps a Crush SSE data line to a GACT event.
// Returns (eventType, payload, sessionID, ok). ok=false means the
// envelope was unparseable and should be dropped.
//
// Crush wraps every event as:
//
//	{"type":"<payload_type>", "payload":{"type":"<lifecycle>", "payload":<resource>}}
//
// where payload_type is session/message/permission_request/etc. and
// lifecycle is created/updated/deleted (per pubsub.EventType).
//
// fallbackSessionID lets the translator fill in the SessionID for
// outer envelopes that don't carry one (e.g. session lifecycle events
// where the resource itself IS the session).
func translateCrushEvent(raw []byte, fallbackSessionID string) (string, map[string]any, string, bool) {
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return "", nil, "", false
	}
	var inner struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(env.Payload, &inner); err != nil {
		return "", nil, "", false
	}

	// Pull the resource shape so we can extract a session_id where
	// applicable. A bare map is enough — the proxy doesn't inspect
	// individual fields beyond session_id.
	var resource map[string]any
	_ = json.Unmarshal(inner.Payload, &resource)

	sid := extractSessionID(env.Type, resource)

	switch env.Type {

	case "session":
		// Session lifecycle — created/updated/deleted on the session itself.
		// `id` is the session ID; we use it as the routing sid too.
		if sid == "" {
			sid, _ = resource["id"].(string)
		}
		switch inner.Type {
		case "created":
			return "session.created", map[string]any{"session_id": sid, "session": resource}, sid, true
		case "updated":
			// Surface as status_changed when status is present (most common
			// case is the agent flipping busy↔idle), else as session.updated.
			if status, ok := resource["status"].(string); ok && status != "" {
				return "session.status_changed", map[string]any{
					"session_id": sid, "status": status, "session": resource,
				}, sid, true
			}
			return "session.updated", map[string]any{"session_id": sid, "session": resource}, sid, true
		case "deleted":
			return "session.deleted", map[string]any{"session_id": sid}, sid, true
		}

	case "message":
		switch inner.Type {
		case "created":
			// Codified shape (clio gact/types.py, emulator, claudecode — 3 of 4
			// implementations): the payload IS the message resource, flat.
			// Never nest it under a "message" key (iowarp/gact-tui#232).
			payload := make(map[string]any, len(resource)+1)
			for k, v := range resource {
				payload[k] = v
			}
			if _, ok := payload["session_id"]; !ok {
				if sid != "" {
					payload["session_id"] = sid
				} else if fallbackSessionID != "" {
					payload["session_id"] = fallbackSessionID
				}
			}
			return "message.created", payload, sid, true
		case "updated":
			return "message.updated", map[string]any{"session_id": sid, "message": resource}, sid, true
		case "deleted":
			return "message.deleted", map[string]any{
				"session_id": sid, "message_id": resource["id"],
			}, sid, true
		}

	case "permission_request":
		return "permission.requested", map[string]any{"session_id": sid, "permission": resource}, sid, true

	case "permission_notification":
		// Crush distinguishes granted vs denied with separate booleans;
		// GACT just uses an action string.
		action := "deny"
		if g, _ := resource["granted"].(bool); g {
			action = "allow"
		}
		return "permission.resolved", map[string]any{
			"session_id":   sid,
			"tool_call_id": resource["tool_call_id"],
			"action":       action,
		}, sid, true

	default:
		// Forward-compat (SPEC §8.4): unknown Crush envelope types
		// pass through namespaced so clients can introspect without
		// the adapter pretending to understand them.
		out := map[string]any{
			"crush_lifecycle": inner.Type,
			"resource":        resource,
		}
		if fallbackSessionID != "" {
			out["session_id"] = fallbackSessionID
		}
		return "x.crush." + env.Type, out, sid, true
	}

	// Unknown lifecycle on a known payload type — preserve everything.
	return "x.crush." + env.Type + "." + inner.Type, map[string]any{
		"session_id": sid,
		"resource":   resource,
	}, sid, true
}

// extractSessionID pulls a session_id from the resource, looking in the
// standard places per Crush's proto types (Message.session_id,
// PermissionRequest.session_id, Session.id).
func extractSessionID(payloadType string, resource map[string]any) string {
	if resource == nil {
		return ""
	}
	if sid, ok := resource["session_id"].(string); ok && sid != "" {
		return sid
	}
	if payloadType == "session" {
		if id, ok := resource["id"].(string); ok {
			return id
		}
	}
	return ""
}

// writeSSELine emits a single SSE event with id/event/data lines.
// Mirrors the GACT emulator's writeSSE: payload is wrapped in
// {type, occurred_at, payload} so the GACT client's existing decoder
// handles adapter output identically to native emulator output.
func writeSSELine(w http.ResponseWriter, flusher http.Flusher, ev string, payload map[string]any) {
	body := map[string]any{
		"type":        ev,
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
		"payload":     payload,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\n", ev)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", buf)
	flusher.Flush()
}

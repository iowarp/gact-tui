package opencode

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// handleEvents proxies OpenCode's /event SSE stream, translating each
// BusEvent envelope into a GACT-shaped event. The optional workspace_id
// query param is currently ignored (the adapter speaks one workspace
// at a time per instance — see handleListWorkspaces).
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.proxySSE(w, r, "")
}

// handleSessionEvents is the per-session variant. Filters upstream events
// to those carrying the matching session_id (when discoverable from the
// envelope), and drops the rest.
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	s.proxySSE(w, r, r.PathValue("id"))
}

// proxySSE opens an upstream SSE connection to OpenCode and pipes
// translated events to the GACT client. sessionFilter, if non-empty,
// drops events that don't reference that session ID.
func (s *Server) proxySSE(w http.ResponseWriter, r *http.Request, sessionFilter string) {
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

	// Open upstream.
	upReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, s.upstream+"/event", nil)
	if err != nil {
		writeSSELine(w, flusher, "server.error", map[string]any{"error": err.Error()})
		return
	}
	upReq.Header.Set("Accept", "text/event-stream")
	streamClient := &http.Client{Timeout: 0, Transport: s.client.Transport}
	resp, err := streamClient.Do(upReq)
	if err != nil {
		writeSSELine(w, flusher, "server.error", map[string]any{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		writeSSELine(w, flusher, "server.error", map[string]any{
			"status": resp.StatusCode, "url": s.upstream + "/event",
		})
		return
	}

	// Greeting + heartbeat ticker (so clients see we're alive even when
	// upstream is quiet).
	writeSSELine(w, flusher, "server.connected", map[string]any{"upstream": s.upstream})
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	rdr := bufio.NewReader(resp.Body)
	dataLines := make(chan []byte, 32)

	// Reader goroutine — parses upstream SSE into per-event data lines.
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
			ev, payload, sid, ok := translateEvent(raw)
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

// translateEvent maps an OpenCode BusEvent JSON line to a GACT event
// type + payload. Returns (eventType, payload, sessionID, ok) where ok
// is false if the line was unparseable. Unknown OpenCode event types
// are passed through with the prefix "x.opencode." per SPEC §8.4.
func translateEvent(raw []byte) (string, map[string]any, string, bool) {
	var env struct {
		Type       string         `json:"type"`
		Properties map[string]any `json:"properties,omitempty"`
		// Some OpenCode events have flat `payload` instead.
		Payload map[string]any `json:"payload,omitempty"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return "", nil, "", false
	}
	props := env.Properties
	if props == nil {
		props = env.Payload
	}
	if props == nil {
		props = map[string]any{}
	}

	// Try to extract session_id for routing.
	sid, _ := props["sessionID"].(string)
	if sid == "" {
		if info, ok := props["info"].(map[string]any); ok {
			sid, _ = info["sessionID"].(string)
		}
	}

	switch env.Type {
	case "server.connected", "server.heartbeat":
		// Already produced by the proxy itself; drop upstream's version
		// to avoid double-emission.
		return "", nil, "", false
	case "session.idle":
		return "session.status_changed", map[string]any{
			"session_id": sid, "status": "idle",
		}, sid, true
	case "session.error":
		return "message.error", map[string]any{
			"session_id": sid, "error": props["error"],
		}, sid, true
	case "message.updated":
		return "message.created", map[string]any{
			"session_id": sid, "payload": props["info"],
		}, sid, true
	case "message.removed":
		return "message.error", map[string]any{
			"session_id": sid, "message_id": props["messageID"],
			"error": map[string]any{"code": "removed", "message": "message removed upstream"},
		}, sid, true
	case "message.part.updated":
		return "message.part.added", map[string]any{
			"session_id": sid, "part": props["part"],
		}, sid, true
	case "message.part.delta":
		return "message.part.delta", map[string]any{
			"session_id": sid, "delta": props,
		}, sid, true
	case "permission.asked":
		return "permission.requested", map[string]any{
			"session_id": sid, "payload": props,
		}, sid, true
	case "permission.replied":
		return "permission.resolved", map[string]any{
			"session_id":    sid,
			"permission_id": props["permissionID"],
			"action":        props["action"],
		}, sid, true
	default:
		// Unknown — namespace per SPEC §8.4 so clients can ignore safely.
		return "x.opencode." + env.Type, props, sid, true
	}
}

// writeSSELine emits one event with id, event, data lines.
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

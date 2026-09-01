package goose

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// postMessageRequest mirrors the GACT POST body shape.
// Only the parts the upstream consumes are decoded.
type postMessageRequest struct {
	Parts []postPart `json:"parts"`
}

type postPart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// handlePostMessage accepts a GACT POST, translates the parts into a
// Goose ChatRequest, fires POST /reply on upstream in a background
// goroutine, and returns 202 immediately. The goroutine pumps the
// upstream SSE response into per-session subscribers.
func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	var req postMessageRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	text := extractText(req.Parts)
	if text == "" {
		writeError(w, http.StatusBadRequest, "empty_message",
			"need at least one text part")
		return
	}

	msgID := "msg_" + sid + "_" + time.Now().UTC().Format("150405.000")
	go s.runUpstreamReply(sid, text)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"message_id":  msgID,
		"accepted_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func extractText(parts []postPart) string {
	var out []string
	for _, p := range parts {
		if p.Type == "text" && p.Text != "" {
			out = append(out, p.Text)
		}
	}
	return strings.Join(out, "")
}

// runUpstreamReply POSTs to Goose's /reply with a synthesized
// ChatRequest, then reads the SSE response line-by-line. Each
// MessageEvent variant is translated to a GACT event and broadcast
// to the session's subscribers.
func (s *Server) runUpstreamReply(sid, text string) {
	chatReq := map[string]any{
		"user_message": map[string]any{
			"role":    "User",
			"created": time.Now().Unix(),
			"content": []map[string]any{
				{"type": "text", "text": text},
			},
		},
		"session_id": sid,
	}
	payload, _ := json.Marshal(chatReq)

	s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
		"session_id":  sid,
		"status":      gact.StatusRunning,
		"prev_status": gact.StatusIdle,
	}))

	resp, err := s.client.Post(s.upstream+"/reply",
		"application/json", bytes.NewReader(payload))
	if err != nil {
		s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
			"session_id":  sid,
			"status":      "error",
			"prev_status": "running",
			"error":       err.Error(),
		}))
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
			"session_id":  sid,
			"status":      "error",
			"prev_status": "running",
			"error":       fmt.Sprintf("upstream %d: %s", resp.StatusCode, body),
		}))
		return
	}

	rd := bufio.NewReaderSize(resp.Body, 64<<10)
	for {
		line, err := rd.ReadString('\n')
		if line != "" {
			line = strings.TrimRight(line, "\r\n")
			if strings.HasPrefix(line, "data: ") {
				rawJSON := []byte(strings.TrimPrefix(line, "data: "))
				var ev map[string]any
				if jErr := json.Unmarshal(rawJSON, &ev); jErr == nil {
					for _, gactEv := range translateMessageEvent(ev, sid, s.wsRoot) {
						s.broadcast(sid, gactEv)
					}
				}
			}
		}
		if err != nil {
			break
		}
	}

	s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
		"session_id":  sid,
		"status":      gact.StatusIdle,
		"prev_status": gact.StatusRunning,
	}))
}

// handleSessionEvents writes SSE for the GACT TUI. Subscribes to
// the session's broadcast channel and writes each event as a
// SPEC §7.2 envelope.
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	ch := make(chan map[string]any, 64)
	s.mu.Lock()
	s.subscribers[sid] = append(s.subscribers[sid], ch)
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		subs := s.subscribers[sid]
		for i, c := range subs {
			if c == ch {
				s.subscribers[sid] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		s.mu.Unlock()
		close(ch)
	}()

	writeSSE(w, "server.connected", map[string]any{
		"session_id": sid,
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

// writeSSE emits a SPEC §7.2 event envelope (event:, id:, data:).
func writeSSE(w io.Writer, eventType string, payload map[string]any) {
	if eventType == "" {
		eventType = "message"
	}
	body := map[string]any{
		"type":        eventType,
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
		"payload":     payload,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return
	}
	id := time.Now().UnixNano()
	fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", id, eventType, buf)
}

// eventEnvelope wraps a payload in our internal queue shape. The
// SSE writer unwraps it back into the SPEC envelope on emit.
func eventEnvelope(eventType string, payload map[string]any) map[string]any {
	return map[string]any{"type": eventType, "payload": payload}
}

// broadcast pushes an event to every subscriber on this session.
// Non-blocking: subscribers that fall behind drop events rather than
// backpressure the producer.
func (s *Server) broadcast(sid string, ev map[string]any) {
	s.mu.Lock()
	subs := append([]chan map[string]any(nil), s.subscribers[sid]...)
	s.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

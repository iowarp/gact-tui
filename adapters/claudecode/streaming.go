package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

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
		if t == "control_request" {
			go s.handleControlRequest(sess, ev)
			continue
		}
		if t == "system" {
			if sub, _ := ev["subtype"].(string); sub == "init" {
				s.captureCatalogs(ev)
			}
		}
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
		default:
		}
	}
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

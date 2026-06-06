package server

import (
	"net/http"
	"strconv"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListContextFrames(w http.ResponseWriter, r *http.Request) {
	frame, ok := s.contextFrameForSession(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"frames": []map[string]any{frame}})
}

func (s *Server) handleGetContextFrame(w http.ResponseWriter, r *http.Request) {
	frame, ok := s.contextFrameForSession(w, r)
	if !ok {
		return
	}
	frameID := r.PathValue("frame_id")
	if frameID != "" && frameID != frame["id"] {
		writeError(w, http.StatusNotFound, "not_found", "context frame not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"frame": frame})
}

func (s *Server) contextFrameForSession(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return nil, false
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	msgs, _, err := s.store.ListMessages(store.MessageFilter{
		SessionID:     id,
		Limit:         limit,
		IncludeSystem: true,
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return nil, false
	}
	files := s.contextFiles.get(id)
	items := make([]map[string]any, 0, len(msgs)+len(files))
	for i := len(msgs) - 1; i >= 0; i-- {
		msg := msgs[i]
		items = append(items, map[string]any{
			"kind":             "message",
			"source_id":        msg.ID,
			"role":             msg.Role,
			"included":         true,
			"reason":           "visible_transcript",
			"tokens_estimated": max(1, len(messageTextForFrame(msg))/4),
			"metadata": map[string]any{
				"part_count": len(msg.Parts),
			},
		})
	}
	for _, file := range files {
		items = append(items, contextFileFrameItem(file))
	}
	frame := map[string]any{
		"id":                   "ctx_emulator_latest",
		"session_id":           id,
		"turn_id":              latestMessageID(msgs),
		"user_message_id":      latestMessageID(msgs),
		"created_at":           time.Now().UTC().Format(time.RFC3339),
		"updated_at":           time.Now().UTC().Format(time.RFC3339),
		"status":               "completed",
		"model":                sess.Model,
		"agent":                sess.Agent,
		"prompt":               map[string]any{"profile": "default", "source": "emulator"},
		"items":                items,
		"tokens_estimated":     contextFrameTokenTotal(items),
		"metadata":             map[string]any{"retained_context_source": "visible_gact_transcript"},
		"assistant_message_id": latestAssistantMessageID(msgs),
	}
	return frame, true
}

func messageTextForFrame(msg gact.Message) string {
	out := ""
	for _, part := range msg.Parts {
		out += part.Text + " " + part.Summary + " "
	}
	return out
}

func latestMessageID(msgs []gact.Message) string {
	if len(msgs) == 0 {
		return ""
	}
	return msgs[0].ID
}

func latestAssistantMessageID(msgs []gact.Message) string {
	for _, msg := range msgs {
		if msg.Role == gact.RoleAssistant {
			return msg.ID
		}
	}
	return ""
}

func contextFrameTokenTotal(items []map[string]any) int {
	total := 0
	for _, item := range items {
		switch v := item["tokens_estimated"].(type) {
		case int:
			total += v
		case int64:
			total += int(v)
		case float64:
			total += int(v)
		}
	}
	return total
}

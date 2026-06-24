package claudecode

import (
	"encoding/json"
	"io"
	"net/http"
	"time"
)

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

// handleMetrics synthesises a SPEC §6.16 metrics envelope from
// adapter state — uptime + per-status session counters + per-role
// message counters + token usage rolled up from cached assistant

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

// --- HTTP helpers -----------------------------------------------------

package claudecode

import "net/http"

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

// int64Of coerces a JSON-decoded number to int64 (json.Number,

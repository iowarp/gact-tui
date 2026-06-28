package goose

import (
	"encoding/json"
	"net/http"
)

// handleListTools serves /v1/tools by proxying Goose's
// /agent/tools?session_id=X. Tools are session-scoped in Goose;
// we pick the first session from /sessions when no session_id is
// passed in. Returns an empty envelope (rather than 5xx) when no
// session exists yet, which both conformance and the TUI handle cleanly.
func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	sid := r.URL.Query().Get("session_id")
	if sid == "" {
		sid = s.firstSessionID()
	}
	tools, err := s.fetchTools(sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	out := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		out = append(out, toolToGact(t))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": out})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sid := r.URL.Query().Get("session_id")
	if sid == "" {
		sid = s.firstSessionID()
	}
	tools, err := s.fetchTools(sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	for _, t := range tools {
		if t.Name == id {
			writeJSON(w, http.StatusOK, toolToGact(t))
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

// firstSessionID returns the first session id from /sessions, or
// empty when none exist / upstream is unreachable. Used as a
// fallback when callers don't pass session_id.
func (s *Server) firstSessionID() string {
	body, err := s.upstreamGet("/sessions")
	if err != nil {
		return ""
	}
	var raw gooseSessionList
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}
	if len(raw.Sessions) == 0 {
		return ""
	}
	return raw.Sessions[0].ID
}

// fetchTools hits Goose's /agent/tools for the given session. Empty
// session id returns an empty list rather than calling upstream
// because Goose's handler requires session_id.
func (s *Server) fetchTools(sid string) ([]gooseTool, error) {
	if sid == "" {
		return nil, nil
	}
	body, err := s.upstreamGet("/agent/tools?session_id=" + sid)
	if err != nil {
		return nil, err
	}
	var tools []gooseTool
	if err := json.Unmarshal(body, &tools); err != nil {
		return nil, err
	}
	return tools, nil
}

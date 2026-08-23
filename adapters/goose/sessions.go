package goose

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	body, err := s.upstreamGet("/sessions")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var raw gooseSessionList
	if err := json.Unmarshal(body, &raw); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	out := make([]gact.Session, 0, len(raw.Sessions))
	wsID := s.workspace().ID
	for _, gs := range raw.Sessions {
		out = append(out, sessionToGact(gs, wsID))
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

// handleGetSession proxies Goose's `GET /sessions/{id}`. Returns 404
// when upstream returns 404 too — the SPEC §6.0 envelope is built
// here so the TUI sees a uniform error shape.
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sessionToGact(gs, s.workspace().ID))
}

// handleListMessages reads the conversation off Goose's
// `GET /sessions/{id}` (which already includes the conversation
// inline) and translates each message to GACT shape.
func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	out := make([]gact.Message, 0, len(gs.Conversation))
	for i, gm := range gs.Conversation {
		out = append(out, messageToGact(gm, id, i, s.wsRoot))
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": out})
}

// handleListDiffs aggregates every file_diff Part across the
// session's conversation. SPEC §6.10: GET /v1/sessions/{id}/diffs
// returns {diffs: FileDiff[]} of "proposed-but-not-applied" diffs.
// Goose doesn't track applied state in the wire shape, so we emit
// every file_diff with applied=false; the gact TUI's a/r handlers

func (s *Server) fetchMessages(sid string) ([]gact.Message, error) {
	resp, err := s.client.Get(s.upstream + "/sessions/" + sid)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream %s", resp.Status)
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		return nil, err
	}
	out := make([]gact.Message, 0, len(gs.Conversation))
	for i, gm := range gs.Conversation {
		out = append(out, messageToGact(gm, sid, i, s.wsRoot))
	}
	return out, nil
}

// handleGetMessage walks the same conversation array
// handleListMessages does and returns the matching message by id.
// Not the most efficient (we refetch the whole session) but the
// adapter is read-only and the data is small.
func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	mid := r.PathValue("msg_id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+sid)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	for i, gm := range gs.Conversation {
		m := messageToGact(gm, sid, i, s.wsRoot)
		if m.ID == mid {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

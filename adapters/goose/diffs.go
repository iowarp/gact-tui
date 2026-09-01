package goose

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (s *Server) handleListDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	msgs, err := s.fetchMessages(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	if msgs == nil {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	var diffs []gact.Part
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				diffs = append(diffs, p)
			}
		}
	}
	if diffs == nil {
		diffs = []gact.Part{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

// handleListMessageDiffs is the per-message variant of handleListDiffs.
// Walks the requested message's parts and emits its file_diff Parts.
func (s *Server) handleListMessageDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("msg_id")
	msgs, err := s.fetchMessages(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	if msgs == nil {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	for _, m := range msgs {
		if m.ID != mid {
			continue
		}
		var diffs []gact.Part
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				diffs = append(diffs, p)
			}
		}
		if diffs == nil {
			diffs = []gact.Part{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
		return
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

// fetchMessages reads the session conversation off Goose and projects
// it to GACT messages. Returns (nil, nil) when upstream returns 404

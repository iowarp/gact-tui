package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.10 Diffs -----------------------------------------------------------

// Diffs are stored in messages (file_diff parts). The handlers below scan
// the session's messages and aggregate.

func (s *Server) handleSessionDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, "")
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

func (s *Server) handleMessageDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("msg_id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, mid)
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

type applyRejectRequest struct {
	Paths []string `json:"paths,omitempty"`
}

func (s *Server) handleDiffApply(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	applied := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = true
		})
		applied = append(applied, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"applied": applied})
}

func (s *Server) handleDiffReject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	rejected := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = false
			if pp.Metadata == nil {
				pp.Metadata = map[string]any{}
			}
			pp.Metadata["rejected"] = true
		})
		rejected = append(rejected, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"rejected": rejected})
}

type undoRequest struct {
	Count int `json:"count,omitempty"`
}

// rewindRequest is the body for POST /v1/sessions/{id}/rewind (MMM7).
type rewindRequest struct {
	ToMessageID   string `json:"to_message_id"`
	IncludeTarget bool   `json:"include_target,omitempty"`
}

func (s *Server) handleSessionRewind(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req rewindRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ToMessageID == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "to_message_id required")
		return
	}
	// Pull the full ordered list (newest-first per ListMessages
	// contract). Find the target, then delete every message AFTER it
	// (= everything ahead of it in newest-first order, since "after"
	// in time is "before" in the slice).
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: 100000, IncludeSystem: true,
	})
	targetIdx := -1
	for i, m := range msgs {
		if m.ID == req.ToMessageID {
			targetIdx = i
			break
		}
	}
	if targetIdx < 0 {
		writeError(w, http.StatusNotFound, "message_not_found",
			"message "+req.ToMessageID+" not found in session "+id)
		return
	}
	deleted := []string{}
	// msgs[0..targetIdx-1] are newer than the target → delete them all.
	for i := 0; i < targetIdx; i++ {
		if err := s.store.DeleteMessage(msgs[i].ID); err == nil {
			deleted = append(deleted, msgs[i].ID)
		}
	}
	if req.IncludeTarget {
		if err := s.store.DeleteMessage(req.ToMessageID); err == nil {
			deleted = append(deleted, req.ToMessageID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted_messages": deleted})
}

func (s *Server) handleSessionUndo(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req undoRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	count := req.Count
	if count <= 0 {
		count = 1
	}
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: count, IncludeSystem: true,
	})
	reverted := []string{}
	for _, m := range msgs {
		if err := s.store.DeleteMessage(m.ID); err == nil {
			reverted = append(reverted, m.ID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reverted_messages": reverted})
}

func collectDiffs(s *Server, sessionID, onlyMsgID string) []gact.FileDiff {
	out := []gact.FileDiff{}
	walkDiffParts(s, sessionID, onlyMsgID, func(_, _ string, p *gact.Part) {
		out = append(out, gact.FileDiff{
			Path:     p.Path,
			Before:   p.Before,
			After:    p.After,
			Language: p.Language,
			Applied:  p.Applied,
		})
	})
	return out
}

func walkDiffParts(s *Server, sessionID, onlyMsgID string, fn func(msgID, partID string, p *gact.Part)) {
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: sessionID, Limit: 100000, IncludeSystem: true,
	})
	for _, m := range msgs {
		if onlyMsgID != "" && m.ID != onlyMsgID {
			continue
		}
		for i := range m.Parts {
			if m.Parts[i].Type == gact.PartTypeFileDiff {
				fn(m.ID, m.Parts[i].ID, &m.Parts[i])
			}
		}
	}
}

func setOf(s []string) map[string]bool {
	if len(s) == 0 {
		return nil
	}
	m := make(map[string]bool, len(s))
	for _, v := range s {
		m[v] = true
	}
	return m
}

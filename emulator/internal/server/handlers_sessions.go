package server

import (
	"net/http"
	"strconv"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CreateSessionRequest is the body for POST /v1/sessions (SPEC §6.2).
type CreateSessionRequest struct {
	WorkspaceID     string         `json:"workspace_id"`
	Title           string         `json:"title,omitempty"`
	Agent           *gact.AgentRef `json:"agent,omitempty"`
	Model           *gact.ModelRef `json:"model,omitempty"`
	ParentSessionID string         `json:"parent_session_id,omitempty"`
	ForkAtMessageID string         `json:"fork_at_message_id,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// UpdateSessionRequest is the body for PATCH /v1/sessions/{id}.
type UpdateSessionRequest struct {
	Title    *string        `json:"title,omitempty"`
	Archived *bool          `json:"archived,omitempty"`
	Agent    *gact.AgentRef `json:"agent,omitempty"`
	Model    *gact.ModelRef `json:"model,omitempty"`
	Status   *string        `json:"status,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// SummarizeSessionRequest is the body for POST /v1/sessions/{id}/summarize.
type SummarizeSessionRequest struct {
	Auto         bool   `json:"auto,omitempty"`
	Instructions string `json:"instructions,omitempty"` // MMM6
}

// ListSessionsResponse is the body for GET /v1/sessions.
type ListSessionsResponse struct {
	Sessions   []gact.Session `json:"sessions"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := store.SessionFilter{
		WorkspaceID:     q.Get("workspace_id"),
		ParentSessionID: q.Get("parent_session_id"),
		IncludeArchived: parseBool(q.Get("archived")),
	}
	writeJSON(w, http.StatusOK, ListSessionsResponse{
		Sessions: s.store.ListSessions(filter),
	})
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if s.cfg.SessionCreateFailures {
		writeError(w, http.StatusBadGateway, "session_create_failed", "session create failed: workspace registry is temporarily unavailable")
		return
	}
	if req.WorkspaceID == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "workspace_id is required")
		return
	}

	// Fork-at-message: requires parent_session_id to be set.
	if req.ForkAtMessageID != "" && req.ParentSessionID == "" {
		writeError(w, http.StatusBadRequest, "invalid_body",
			"fork_at_message_id requires parent_session_id")
		return
	}

	sess := gact.Session{
		WorkspaceID:     req.WorkspaceID,
		Title:           req.Title,
		ParentSessionID: req.ParentSessionID,
		Metadata:        req.Metadata,
	}
	if req.Agent != nil {
		sess.Agent = *req.Agent
	}
	if req.Model != nil {
		sess.Model = *req.Model
	}

	created, err := s.store.CreateSession(sess)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}

	// Fork: copy parent's messages up to and including ForkAtMessageID
	// (or all if empty) into the new session.
	if req.ParentSessionID != "" {
		if err := s.copyForkMessages(req.ParentSessionID, created.ID, req.ForkAtMessageID); err != nil {
			// Roll back the empty session; surfacing the error is more useful
			// than leaving a half-forked session.
			_ = s.store.DeleteSession(created.ID)
			writeStoreError(w, err, "session_not_found", "invalid_fork")
			return
		}
		// Re-fetch to pick up updated message_count.
		fresh, _ := s.store.GetSession(created.ID)
		if fresh != nil {
			created = fresh
		}
	}

	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func (s *Server) handlePatchSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req UpdateSessionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if s.cfg.SessionRenameFailures && req.Title != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "session title failed validation: reserved demo failure")
		return
	}
	updated, err := s.store.UpdateSession(id, func(sess *gact.Session) {
		if req.Title != nil {
			sess.Title = *req.Title
		}
		if req.Archived != nil {
			if *req.Archived {
				now := time.Now().UTC()
				sess.ArchivedAt = &now
			} else {
				sess.ArchivedAt = nil
			}
		}
		if req.Agent != nil {
			sess.Agent = *req.Agent
		}
		if req.Model != nil {
			sess.Model = *req.Model
		}
		if req.Status != nil {
			sess.Status = *req.Status
		}
		if req.Metadata != nil {
			sess.Metadata = req.Metadata
		}
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.store.DeleteSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCancelSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.CancelFailures {
		writeError(w, http.StatusBadGateway, "cancel_failed", "cancel failed: runtime supervisor did not acknowledge the request")
		return
	}
	if s.onCancel != nil {
		s.onCancel(id)
	}
	_, err := s.store.UpdateSession(id, func(sess *gact.Session) {
		sess.Status = gact.StatusIdle
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	// Publish status change so subscribers see the reset.
	s.bus.Publish(events.Event{
		Type:      "session.status_changed",
		SessionID: id,
		Payload: map[string]any{
			"session_id": id,
			"status":     gact.StatusIdle,
			"reason":     "cancelled",
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSummarizeSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req SummarizeSessionRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	_, err := s.store.UpdateSession(id, func(sess *gact.Session) {
		// Placeholder summary. MMM6: when --instructions is supplied,
		// echo them into the placeholder so test/scripted callers can
		// verify the field round-tripped end-to-end. Real scenario
		// engines would feed the instructions into the summarizer
		// prompt rather than literally emit them.
		if req.Instructions != "" {
			sess.Summary = "[auto-summary, instructions: " + req.Instructions + "]"
		} else if sess.Summary == "" {
			sess.Summary = "[auto-summary placeholder]"
		}
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	_ = req.Auto // reserved
	w.WriteHeader(http.StatusNoContent)
}

func parseBool(v string) bool {
	if v == "" {
		return false
	}
	b, err := strconv.ParseBool(v)
	if err == nil {
		return b
	}
	return false
}

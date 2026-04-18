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
	WorkspaceID      string         `json:"workspace_id"`
	Title            string         `json:"title,omitempty"`
	Agent            *gact.AgentRef `json:"agent,omitempty"`
	Model            *gact.ModelRef `json:"model,omitempty"`
	ParentSessionID  string         `json:"parent_session_id,omitempty"`
	ForkAtMessageID  string         `json:"fork_at_message_id,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
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

// ForkSessionRequest is the body for POST /v1/sessions/{id}/fork.
type ForkSessionRequest struct {
	AtMessageID string `json:"at_message_id,omitempty"`
	Title       string `json:"title,omitempty"`
}

// SummarizeSessionRequest is the body for POST /v1/sessions/{id}/summarize.
type SummarizeSessionRequest struct {
	Auto bool `json:"auto,omitempty"`
}

// ListSessionsResponse is the body for GET /v1/sessions.
type ListSessionsResponse struct {
	Sessions   []gact.Session `json:"sessions"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

// SessionExport is the body for GET /v1/sessions/{id}/export and POST
// /v1/sessions/import. Carries the session and all its messages, with a
// format tag so future versions can migrate.
type SessionExport struct {
	Format     string         `json:"format"`     // "gact-v1"
	ExportedAt time.Time      `json:"exported_at"`
	Session    gact.Session   `json:"session"`
	Messages   []gact.Message `json:"messages"` // chronological (oldest-first)
}

const sessionExportFormat = "gact-v1"

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

// copyForkMessages copies messages from parent to child up to (and including)
// upToID. If upToID is empty all messages are copied. Messages keep their
// original IDs for forward-compat (clients can still reference old IDs that
// existed at fork time); the store treats this as ErrAlreadyExists, so we
// generate fresh IDs for the copies.
func (s *Server) copyForkMessages(parentID, childID, upToID string) error {
	st := s.store
	// Pull oldest-first by repeatedly paging from newest then reversing.
	// Simpler: use ListMessages with a high limit and IncludeSystem=true.
	page, _, err := st.ListMessages(store.MessageFilter{
		SessionID:     parentID,
		Limit:         10000,
		IncludeSystem: true,
	})
	if err != nil {
		return err
	}
	// page is newest-first; iterate reverse to copy oldest-first.
	for i := len(page) - 1; i >= 0; i-- {
		m := page[i]
		// Reset IDs so the store assigns new ones.
		m.ID = ""
		m.SessionID = childID
		for j := range m.Parts {
			m.Parts[j].ID = ""
		}
		if _, err := st.AppendMessage(m); err != nil {
			return err
		}
		if upToID != "" && page[i].ID == upToID {
			break
		}
	}
	return nil
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

func (s *Server) handleForkSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	parent, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req ForkSessionRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	title := req.Title
	if title == "" {
		title = parent.Title + " (fork)"
	}
	child, err := s.store.CreateSession(gact.Session{
		WorkspaceID:     parent.WorkspaceID,
		ParentSessionID: parent.ID,
		Title:           title,
		Agent:           parent.Agent,
		Model:           parent.Model,
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	if err := s.copyForkMessages(parent.ID, child.ID, req.AtMessageID); err != nil {
		_ = s.store.DeleteSession(child.ID)
		writeStoreError(w, err, "session_not_found", "invalid_fork")
		return
	}
	fresh, _ := s.store.GetSession(child.ID)
	if fresh != nil {
		child = fresh
	}
	writeJSON(w, http.StatusCreated, child)
}

func (s *Server) handleCancelSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
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
		// Placeholder summary. The scenario engine (A11) will replace this
		// with real summary content emitted via session.summarized event.
		if sess.Summary == "" {
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

func (s *Server) handleExportSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	page, _, err := s.store.ListMessages(store.MessageFilter{
		SessionID:     id,
		Limit:         10000,
		IncludeSystem: true,
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_export")
		return
	}
	// page is newest-first; reverse for chronological export.
	chrono := make([]gact.Message, len(page))
	for i, m := range page {
		chrono[len(page)-1-i] = m
	}
	writeJSON(w, http.StatusOK, SessionExport{
		Format:     sessionExportFormat,
		ExportedAt: time.Now().UTC(),
		Session:    *sess,
		Messages:   chrono,
	})
}

func (s *Server) handleImportSession(w http.ResponseWriter, r *http.Request) {
	var blob SessionExport
	if !decodeJSON(w, r, &blob) {
		return
	}
	if blob.Format != sessionExportFormat {
		writeError(w, http.StatusBadRequest, "unsupported_format",
			"unsupported export format: "+blob.Format)
		return
	}
	// Reset IDs so the import doesn't collide with existing sessions/messages.
	imported := blob.Session
	imported.ID = ""
	created, err := s.store.CreateSession(imported)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	for _, m := range blob.Messages {
		m.ID = ""
		m.SessionID = created.ID
		for j := range m.Parts {
			m.Parts[j].ID = ""
		}
		if _, err := s.store.AppendMessage(m); err != nil {
			_ = s.store.DeleteSession(created.ID)
			writeStoreError(w, err, "session_not_found", "invalid_message")
			return
		}
	}
	fresh, _ := s.store.GetSession(created.ID)
	if fresh != nil {
		created = fresh
	}
	writeJSON(w, http.StatusCreated, created)
}

// parseBool returns true if v is "1", "true", "yes" (case-insensitive).
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

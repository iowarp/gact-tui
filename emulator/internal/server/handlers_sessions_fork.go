package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ForkSessionRequest is the body for POST /v1/sessions/{id}/fork.
type ForkSessionRequest struct {
	AtMessageID string `json:"at_message_id,omitempty"`
	Title       string `json:"title,omitempty"`
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

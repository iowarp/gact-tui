package server

import (
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// SessionExport is the body for GET /v1/sessions/{id}/export and POST
// /v1/sessions/import. Carries the session and all its messages, with a
// format tag so future versions can migrate.
type SessionExport struct {
	Format     string         `json:"format"` // "gact-v1"
	ExportedAt time.Time      `json:"exported_at"`
	Session    gact.Session   `json:"session"`
	Messages   []gact.Message `json:"messages"` // chronological (oldest-first)
}

const sessionExportFormat = "gact-v1"

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

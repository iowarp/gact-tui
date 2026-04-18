package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
)

// PermissionResponseRequest is the body for POST /v1/permissions/{id}.
type PermissionResponseRequest struct {
	Action store.PermissionAction `json:"action"`
}

// ListPermissionsResponse is the body for GET /v1/permissions.
type ListPermissionsResponse struct {
	Permissions []store.PermissionRequest `json:"permissions"`
}

func (s *Server) handleListPermissions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.PermissionFilter{
		SessionID:   q.Get("session_id"),
		OnlyPending: q.Get("status") == "pending",
	}
	writeJSON(w, http.StatusOK, ListPermissionsResponse{Permissions: s.perms.List(f)})
}

func (s *Server) handleGetPermission(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	pr, ok := s.perms.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "permission_not_found", "permission "+id+" not found")
		return
	}
	writeJSON(w, http.StatusOK, pr)
}

func (s *Server) handleRespondPermission(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req PermissionResponseRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	switch req.Action {
	case store.PermAllow, store.PermDeny, store.PermAllowSession, store.PermAllowWorkspace:
	default:
		writeError(w, http.StatusBadRequest, "invalid_action",
			"action must be allow, deny, allow_session, or allow_workspace")
		return
	}
	pr, ok := s.perms.Resolve(id, req.Action)
	if !ok {
		writeError(w, http.StatusNotFound, "permission_not_found",
			"permission "+id+" not found or already resolved")
		return
	}
	s.bus.Publish(events.Event{
		Type:      "permission.resolved",
		SessionID: pr.SessionID,
		Payload: map[string]any{
			"permission_id": pr.ID,
			"action":        string(req.Action),
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

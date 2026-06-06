package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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

// MMM4: §6.11 policies. PUT replaces the entire list (per spec body
// `{policies: Policy[]}`). GET returns the current list.

type policiesBody struct {
	Policies []gact.Policy `json:"policies"`
}

func (s *Server) handleListPolicies(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, policiesBody{Policies: s.perms.Policies()})
}

func (s *Server) handlePutPolicies(w http.ResponseWriter, r *http.Request) {
	var req policiesBody
	if !decodeJSON(w, r, &req) {
		return
	}
	for _, p := range req.Policies {
		switch p.Action {
		case "allow", "deny", "ask":
		default:
			writeError(w, http.StatusBadRequest, "invalid_body",
				"each policy.action must be allow|deny|ask")
			return
		}
	}
	s.perms.SetPolicies(req.Policies)
	writeJSON(w, http.StatusOK, policiesBody{Policies: s.perms.Policies()})
}

func seedPermissionStress(perms *store.Permissions) {
	if perms == nil {
		return
	}
	sessionID := "ses_seed_ws_default_1"
	perms.SetPolicies([]gact.Policy{{
		Scope:           "workspace",
		ToolNamePattern: "shell",
		PathPattern:     "/tmp/**",
		Action:          "ask",
	}, {
		Scope:           "workspace",
		ToolNamePattern: "shell",
		PathPattern:     "/tmp/**",
		Action:          "deny",
	}, {
		Scope:           "session",
		ScopeID:         sessionID,
		ToolNamePattern: "web_fetch",
		Action:          "ask",
	}, {
		Scope:           "workspace",
		ToolNamePattern: "read_file",
		PathPattern:     "/workspace/**",
		Action:          "allow",
	}})
	perms.Create(gact.PermissionRequest{
		ID:        "perm_stress_shell_delete",
		SessionID: sessionID,
		Summary:   "Delete the temporary SAC staging directory",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_stress_shell_delete",
			ToolName: "shell",
			ServerID: "local",
			Input:    map[string]any{"command": "rm -rf /tmp/clio-seismic-staging", "path": "/tmp/clio-seismic-staging"},
			Annotations: gact.ToolAnnotations{
				DestructiveHint: true,
			},
		},
	})
	perms.Create(gact.PermissionRequest{
		ID:        "perm_stress_web_fetch",
		SessionID: sessionID,
		Summary:   "Fetch live NWS warning features from a public endpoint",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_stress_web_fetch",
			ToolName: "web_fetch",
			ServerID: "mcp_docs",
			Input:    map[string]any{"url": "https://api.weather.gov/alerts/active?area=CA"},
			Annotations: gact.ToolAnnotations{
				ReadOnlyHint:  true,
				OpenWorldHint: true,
			},
		},
	})
	allowed := perms.Create(gact.PermissionRequest{
		ID:        "perm_stress_allow_session",
		SessionID: sessionID,
		Summary:   "Read staged CIMIS CSV",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_stress_allow_session",
			ToolName: "read_file",
			Input:    map[string]any{"path": "/workspace/tmp/cimis_fresno.csv"},
			Annotations: gact.ToolAnnotations{
				ReadOnlyHint: true,
			},
		},
	})
	perms.Resolve(allowed.ID, gact.PermAllowSession)
	denied := perms.Create(gact.PermissionRequest{
		ID:        "perm_stress_denied",
		SessionID: sessionID,
		Summary:   "Delete benchmark artifact manifest",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_stress_denied",
			ToolName: "shell",
			Input:    map[string]any{"command": "rm /workspace/artifacts/manifest.json", "path": "/workspace/artifacts/manifest.json"},
			Annotations: gact.ToolAnnotations{
				DestructiveHint: true,
			},
		},
	})
	perms.Resolve(denied.ID, gact.PermDeny)
	allowedWorkspace := perms.Create(gact.PermissionRequest{
		ID:        "perm_stress_allow_workspace",
		SessionID: sessionID,
		Summary:   "Read workspace report",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_stress_allow_workspace",
			ToolName: "read_file",
			Input:    map[string]any{"path": "/workspace/README.md"},
			Annotations: gact.ToolAnnotations{
				ReadOnlyHint: true,
			},
		},
	})
	perms.Resolve(allowedWorkspace.ID, gact.PermAllowWorkspace)
}

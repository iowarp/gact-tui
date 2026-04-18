package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ContractVersion is the GACT contract version this emulator implements.
const ContractVersion = "0.1"

// EmulatorVersion is the emulator binary's own version (SemVer).
const EmulatorVersion = "0.1.0"

// --- Encoding helpers -------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

// writeError responds with the standard SPEC §6.0 error envelope.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, gact.Error{Error: gact.ErrorBody{Code: code, Message: message}})
}

// writeStoreError maps a store-layer error onto an appropriate HTTP status.
func writeStoreError(w http.ResponseWriter, err error, notFoundCode, validationCode string) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, notFoundCode, err.Error())
	case errors.Is(err, store.ErrAlreadyExists):
		writeError(w, http.StatusConflict, "already_exists", err.Error())
	case errors.Is(err, store.ErrInvalidArg):
		writeError(w, http.StatusBadRequest, validationCode, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}

// decodeJSON parses the request body into v. Returns true if successful;
// otherwise it has already written a 400 response and the caller should return.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields() // strict — open-spec extensions go in metadata or under /ext/
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", fmt.Sprintf("decode: %v", err))
		return false
	}
	return true
}

// --- §3 health + capabilities ----------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.HealthResponse{
		Healthy: true,
		UptimeS: int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.Capabilities{
		ContractVersion: ContractVersion,
		Backend: gact.BackendInfo{
			Name:     "gact-emulator",
			Version:  EmulatorVersion,
			Vendor:   "gact",
			Homepage: "https://github.com/JaimeCernuda/gact-tui",
		},
		Capabilities: gact.CapabilityFlags{
			Workspaces:        true,
			Sessions:          true,
			Subagents:         true,
			MCP:               true,
			LSP:               false,
			Files:             true,
			Diffs:             true,
			Permissions:       true,
			Providers:         true,
			Commands:          true,
			Voice:             false,
			ScheduledSessions: false,
			Metrics:           true,
			SessionBranching:  true,
			SessionSharing:    false,
			SessionExport:     true,
			CostTracking:      true,
			ThinkingBlocks:    true,
			EditModes:         false,
			PlanMode:          false,
			SearchMessages:    true,
			AgentWrite:        false,
			SkillsExtraction:  false,
		},
		Transports: gact.TransportFlags{
			EventsSSE:       true,
			EventsWebSocket: false,
		},
		Auth: gact.AuthInfo{
			Schemes: []string{"trust_socket"},
			Current: "trust_socket",
		},
		Extensions: []gact.Extension{},
	})
}

// --- §6.1 Workspaces -------------------------------------------------------

// CreateWorkspaceRequest is the body for POST /v1/workspaces.
type CreateWorkspaceRequest struct {
	Name     string         `json:"name,omitempty"`
	RootPath string         `json:"root_path"`
	Config   map[string]any `json:"config,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// UpdateWorkspaceRequest is the body for PATCH /v1/workspaces/{id}. Pointer
// types distinguish "not provided" from "set to empty".
type UpdateWorkspaceRequest struct {
	Name     *string        `json:"name,omitempty"`
	RootPath *string        `json:"root_path,omitempty"`
	Config   map[string]any `json:"config,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// ListWorkspacesResponse is the body for GET /v1/workspaces.
type ListWorkspacesResponse struct {
	Workspaces []gact.Workspace `json:"workspaces"`
	NextCursor string           `json:"next_cursor,omitempty"`
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, ListWorkspacesResponse{
		Workspaces: s.store.ListWorkspaces(),
	})
}

func (s *Server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkspaceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.RootPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "root_path is required")
		return
	}
	name := req.Name
	if name == "" {
		name = baseName(req.RootPath)
	}
	ws := gact.Workspace{
		Name:     name,
		RootPath: req.RootPath,
		Config:   req.Config,
		Metadata: req.Metadata,
	}
	created, err := s.store.CreateWorkspace(ws)
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handlePatchWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req UpdateWorkspaceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.UpdateWorkspace(id, func(ws *gact.Workspace) {
		if req.Name != nil {
			ws.Name = *req.Name
		}
		if req.RootPath != nil {
			ws.RootPath = *req.RootPath
		}
		if req.Config != nil {
			ws.Config = req.Config
		}
		if req.Metadata != nil {
			ws.Metadata = req.Metadata
		}
	})
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.store.DeleteWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// baseName returns the trailing path segment of p (basename), or p if there
// is none. Avoids importing path/filepath just for this.
func baseName(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' || p[i] == '\\' {
			return p[i+1:]
		}
	}
	return p
}

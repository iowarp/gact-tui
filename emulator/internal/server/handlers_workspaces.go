package server

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CreateWorkspaceRequest is the body for POST /v1/workspaces.
type CreateWorkspaceRequest struct {
	Name     string         `json:"name,omitempty"`
	RootPath string         `json:"root_path"`
	Config   map[string]any `json:"config,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// UpdateWorkspaceRequest is the body for PATCH /v1/workspaces/{id}. Pointer
// fields distinguish "not provided" from "set to empty".
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
	rootPath := strings.TrimSpace(req.RootPath)
	if !filepath.IsAbs(rootPath) {
		writeError(w, http.StatusBadRequest, "invalid_workspace_root", "workspace root must be an absolute local path")
		return
	}
	for _, ws := range s.store.ListWorkspaces() {
		if filepath.Clean(ws.RootPath) == filepath.Clean(rootPath) {
			writeError(w, http.StatusConflict, "workspace_root_conflict", "that folder is already registered as workspace "+ws.Name)
			return
		}
	}
	name := req.Name
	if name == "" {
		name = baseName(rootPath)
	}
	created, err := s.store.CreateWorkspace(gact.Workspace{
		Name:     name,
		RootPath: rootPath,
		Config:   req.Config,
		Metadata: req.Metadata,
	})
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
	if ws, err := s.store.GetWorkspace(id); err == nil && filepath.Clean(ws.RootPath) == "/tmp/gact-analysis" {
		writeError(w, http.StatusConflict, "workspace_remove_failed", "workspace is pinned by an active benchmark profile")
		return
	}
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

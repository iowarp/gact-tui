package goose

import (
	"net/http"
	"path/filepath"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": []gact.Workspace{s.workspace()},
	})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws := s.workspace()
	if ws.ID != id {
		writeError(w, http.StatusNotFound, "workspace_not_found", "no workspace with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) workspace() gact.Workspace {
	return gact.Workspace{
		ID:        "ws_default",
		Name:      filepath.Base(s.wsRoot),
		RootPath:  s.wsRoot,
		CreatedAt: s.started,
		Metadata: map[string]any{
			"x_goose_upstream": s.upstream,
		},
	}
}

// handleListSessions proxies Goose's `GET /sessions`. Workspace
// scoping is collapsed (one synthetic workspace per adapter

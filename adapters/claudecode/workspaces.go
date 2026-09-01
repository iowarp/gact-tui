package claudecode

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
		Name:      filepath.Base(s.cwd),
		RootPath:  s.cwd,
		CreatedAt: s.started,
		Metadata:  map[string]any{"x_claudecode_cwd": s.cwd},
	}
}

package store

import (
	"fmt"
	"sort"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CreateWorkspace adds a workspace. The returned pointer is a copy; mutating
// it does not affect the stored state.
func (s *Store) CreateWorkspace(ws gact.Workspace) (*gact.Workspace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ws.ID == "" {
		ws.ID = NewID(gact.IDPrefixWorkspace)
	}
	if _, exists := s.workspaces[ws.ID]; exists {
		return nil, ErrAlreadyExists
	}
	if ws.RootPath == "" {
		return nil, fmt.Errorf("%w: root_path required", ErrInvalidArg)
	}
	now := s.now().UTC()
	if ws.CreatedAt.IsZero() {
		ws.CreatedAt = now
	}
	ws.UpdatedAt = now

	stored := ws // value copy
	s.workspaces[ws.ID] = &stored
	out := stored
	return &out, nil
}

// GetWorkspace returns a workspace by ID. Returns ErrNotFound if missing.
func (s *Store) GetWorkspace(id string) (*gact.Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ws, ok := s.workspaces[id]
	if !ok {
		return nil, ErrNotFound
	}
	out := *ws
	return &out, nil
}

// ListWorkspaces returns all workspaces sorted by updated_at descending
// (newest first). For an emulator this is unpaginated; the SPEC allows it.
func (s *Store) ListWorkspaces() []gact.Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]gact.Workspace, 0, len(s.workspaces))
	for _, ws := range s.workspaces {
		out = append(out, *ws)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	return out
}

// UpdateWorkspace applies a partial update via the supplied mutate function.
// The function receives a pointer to the stored workspace (still under lock)
// and may mutate it in place. UpdatedAt is set automatically afterward.
func (s *Store) UpdateWorkspace(id string, mutate func(*gact.Workspace)) (*gact.Workspace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ws, ok := s.workspaces[id]
	if !ok {
		return nil, ErrNotFound
	}
	mutate(ws)
	ws.UpdatedAt = s.now().UTC()
	out := *ws
	return &out, nil
}

// DeleteWorkspace removes a workspace and all its sessions (cascading).
// Returns ErrNotFound if the workspace is missing.
func (s *Store) DeleteWorkspace(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.workspaces[id]; !ok {
		return ErrNotFound
	}
	delete(s.workspaces, id)

	// Cascade: delete sessions in this workspace and their messages.
	for sid, sess := range s.sessions {
		if sess.WorkspaceID == id {
			s.deleteSessionLocked(sid)
		}
	}
	return nil
}

// --- Sessions ---------------------------------------------------------------

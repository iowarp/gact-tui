package store

import (
	"fmt"
	"sort"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Store) CreateSession(sess gact.Session) (*gact.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.workspaces[sess.WorkspaceID]; !ok {
		return nil, fmt.Errorf("%w: workspace_id %q", ErrInvalidArg, sess.WorkspaceID)
	}
	if sess.ParentSessionID != "" {
		if _, ok := s.sessions[sess.ParentSessionID]; !ok {
			return nil, fmt.Errorf("%w: parent_session_id %q", ErrInvalidArg, sess.ParentSessionID)
		}
	}
	if sess.ID == "" {
		sess.ID = NewID(gact.IDPrefixSession)
	}
	if _, exists := s.sessions[sess.ID]; exists {
		return nil, ErrAlreadyExists
	}
	now := s.now().UTC()
	if sess.CreatedAt.IsZero() {
		sess.CreatedAt = now
	}
	sess.UpdatedAt = now
	if sess.Status == "" {
		sess.Status = gact.StatusIdle
	}
	// Derived fields are managed by the store, never by callers. Imports and
	// forks reset to zero; AppendMessage increments from there. Without this
	// reset, importing a session blob that already counted N messages and
	// then appending the same N messages double-counts.
	sess.MessageCount = 0
	sess.Tokens = gact.Tokens{}
	sess.CostUSD = 0

	stored := sess
	s.sessions[sess.ID] = &stored
	out := stored
	return &out, nil
}

// GetSession returns a session by ID.
func (s *Store) GetSession(id string) (*gact.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, ErrNotFound
	}
	out := *sess
	return &out, nil
}

// SessionFilter narrows a session list query.
type SessionFilter struct {
	WorkspaceID     string // empty = all
	ParentSessionID string // empty = all (use HasParentSessionID for "no parent")
	HasParent       *bool  // optional: nil=any, true=only forks, false=only roots
	IncludeArchived bool
}

// ListSessions returns sessions matching the filter, ordered by updated_at desc.
func (s *Store) ListSessions(f SessionFilter) []gact.Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]gact.Session, 0)
	for _, sess := range s.sessions {
		if f.WorkspaceID != "" && sess.WorkspaceID != f.WorkspaceID {
			continue
		}
		if f.ParentSessionID != "" && sess.ParentSessionID != f.ParentSessionID {
			continue
		}
		if f.HasParent != nil {
			has := sess.ParentSessionID != ""
			if has != *f.HasParent {
				continue
			}
		}
		if !f.IncludeArchived && sess.ArchivedAt != nil {
			continue
		}
		out = append(out, *sess)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	return out
}

// UpdateSession applies a partial update via the supplied mutate function.
func (s *Store) UpdateSession(id string, mutate func(*gact.Session)) (*gact.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, ErrNotFound
	}
	mutate(sess)
	sess.UpdatedAt = s.now().UTC()
	out := *sess
	return &out, nil
}

// DeleteSession removes a session and its messages.
func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sessions[id]; !ok {
		return ErrNotFound
	}
	s.deleteSessionLocked(id)
	return nil
}

// deleteSessionLocked must be called with s.mu held for write.
func (s *Store) deleteSessionLocked(id string) {
	delete(s.sessions, id)
	for _, msgID := range s.messagesBySession[id] {
		delete(s.messages, msgID)
	}
	delete(s.messagesBySession, id)
}

// --- Messages ---------------------------------------------------------------

// Package store provides the in-memory state for the GACT emulator.
//
// Concurrency: every method takes a single read or write lock on the Store's
// mutex. This is intentionally simple — finer locking can be added if/when
// profiling shows contention.
//
// Persistence: none. The emulator is for development and testing; restarts
// drop all state. Add a snapshot/restore layer here if persistence is needed.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Sentinel errors returned by Store. Handlers map these to HTTP statuses.
var (
	ErrNotFound      = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
	ErrInvalidArg    = errors.New("invalid argument")
)

// Store holds the emulator's in-memory state.
type Store struct {
	mu sync.RWMutex

	workspaces map[string]*gact.Workspace
	sessions   map[string]*gact.Session
	// messages keyed by message ID for direct lookup.
	messages map[string]*gact.Message
	// messagesBySession keyed by session ID, ordered by created_at asc.
	messagesBySession map[string][]string

	now func() time.Time // override for tests
}

// New constructs an empty Store.
func New() *Store {
	return &Store{
		workspaces:        make(map[string]*gact.Workspace),
		sessions:          make(map[string]*gact.Session),
		messages:          make(map[string]*gact.Message),
		messagesBySession: make(map[string][]string),
		now:               time.Now,
	}
}

// SetClock overrides the clock used for created_at/updated_at. For tests.
func (s *Store) SetClock(now func() time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.now = now
}

// NewID returns a hex-random ID with the given prefix. 16 random bytes is
// plenty of uniqueness for an in-process emulator.
func NewID(prefix string) string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand.Read on Linux only fails if the kernel is broken; treat as fatal.
		panic(fmt.Sprintf("rand.Read: %v", err))
	}
	return prefix + hex.EncodeToString(b[:])
}

// --- Workspaces -------------------------------------------------------------

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

// CreateSession adds a session. Validates that the workspace exists.
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

// AppendMessage adds a message to a session. Sets CreatedAt/UpdatedAt and
// generates IDs for the message and any parts that lack them. Bumps the
// session's MessageCount and UpdatedAt.
func (s *Store) AppendMessage(msg gact.Message) (*gact.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[msg.SessionID]
	if !ok {
		return nil, fmt.Errorf("%w: session_id %q", ErrInvalidArg, msg.SessionID)
	}
	if msg.ID == "" {
		msg.ID = NewID(gact.IDPrefixMessage)
	}
	if _, exists := s.messages[msg.ID]; exists {
		return nil, ErrAlreadyExists
	}
	if msg.Role == "" {
		return nil, fmt.Errorf("%w: role required", ErrInvalidArg)
	}
	now := s.now().UTC()
	if msg.CreatedAt.IsZero() {
		msg.CreatedAt = now
	}
	msg.UpdatedAt = now
	for i := range msg.Parts {
		if msg.Parts[i].ID == "" {
			msg.Parts[i].ID = NewID(gact.IDPrefixPart)
		}
	}
	if msg.Parts == nil {
		msg.Parts = []gact.Part{}
	}

	stored := msg
	s.messages[msg.ID] = &stored
	s.messagesBySession[msg.SessionID] = append(s.messagesBySession[msg.SessionID], msg.ID)

	sess.MessageCount++
	sess.UpdatedAt = now

	out := stored
	return &out, nil
}

// GetMessage returns a message by ID.
func (s *Store) GetMessage(id string) (*gact.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.messages[id]
	if !ok {
		return nil, ErrNotFound
	}
	out := *m
	return &out, nil
}

// MessageFilter narrows a message list query.
type MessageFilter struct {
	SessionID     string // required
	Before        string // cursor (last seen message ID); newest-first paging means "older than"
	Limit         int    // 0 means no limit
	IncludeSystem bool   // false hides role:"system" messages from results
}

// ListMessages returns messages matching the filter, newest-first. If Before
// is set, returns messages strictly older than that message (excluding it).
// next is the ID to use as the next Before cursor, empty if no more.
func (s *Store) ListMessages(f MessageFilter) (msgs []gact.Message, next string, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if f.SessionID == "" {
		return nil, "", fmt.Errorf("%w: session_id required", ErrInvalidArg)
	}
	if _, ok := s.sessions[f.SessionID]; !ok {
		return nil, "", ErrNotFound
	}

	ids := s.messagesBySession[f.SessionID]
	// Build newest-first slice of full messages (filtered).
	full := make([]gact.Message, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		m := s.messages[ids[i]]
		if !f.IncludeSystem && m.Role == gact.RoleSystem {
			continue
		}
		full = append(full, *m)
	}

	// Apply Before: skip until we've passed the cursor.
	start := 0
	if f.Before != "" {
		found := false
		for i, m := range full {
			if m.ID == f.Before {
				start = i + 1
				found = true
				break
			}
		}
		if !found {
			return nil, "", fmt.Errorf("%w: cursor %q not found", ErrInvalidArg, f.Before)
		}
	}
	page := full[start:]
	if f.Limit > 0 && len(page) > f.Limit {
		page = page[:f.Limit]
	}
	if len(page) > 0 && f.Limit > 0 && start+f.Limit < len(full) {
		next = page[len(page)-1].ID
	}
	return page, next, nil
}

// UpdateMessagePart finds the named part in the named message and applies
// the mutate function. UpdatedAt on the message is bumped.
func (s *Store) UpdateMessagePart(msgID, partID string, mutate func(*gact.Part)) (*gact.Part, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.messages[msgID]
	if !ok {
		return nil, ErrNotFound
	}
	for i := range m.Parts {
		if m.Parts[i].ID == partID {
			mutate(&m.Parts[i])
			m.UpdatedAt = s.now().UTC()
			out := m.Parts[i]
			return &out, nil
		}
	}
	return nil, ErrNotFound
}

// AppendPart appends a part to a message. Generates an ID if absent.
func (s *Store) AppendPart(msgID string, part gact.Part) (*gact.Part, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.messages[msgID]
	if !ok {
		return nil, ErrNotFound
	}
	if part.ID == "" {
		part.ID = NewID(gact.IDPrefixPart)
	}
	m.Parts = append(m.Parts, part)
	m.UpdatedAt = s.now().UTC()
	out := part
	return &out, nil
}

// DeleteMessage removes a message from its session.
func (s *Store) DeleteMessage(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.messages[id]
	if !ok {
		return ErrNotFound
	}
	delete(s.messages, id)
	ids := s.messagesBySession[m.SessionID]
	for i, mid := range ids {
		if mid == id {
			s.messagesBySession[m.SessionID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}
	if sess, ok := s.sessions[m.SessionID]; ok {
		if sess.MessageCount > 0 {
			sess.MessageCount--
		}
		sess.UpdatedAt = s.now().UTC()
	}
	return nil
}

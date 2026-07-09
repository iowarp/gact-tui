package store

import (
	"fmt"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
	// Build the newest-first slice of ALL messages, UNFILTERED. The `before`
	// cursor must resolve against the full ledger regardless of include_system —
	// clio (routes/messages.py) resolves the cursor against the unfiltered
	// chronological list and only drops system rows afterward. Filtering first
	// would 404 a valid cursor that happens to name a system-role message.
	all := make([]gact.Message, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		all = append(all, *s.messages[ids[i]])
	}

	// Resolve Before against the unfiltered list: keep rows strictly older.
	start := 0
	if f.Before != "" {
		found := false
		for i, m := range all {
			if m.ID == f.Before {
				start = i + 1
				found = true
				break
			}
		}
		if !found {
			// SPEC §6.3: an unknown `before` cursor id is a 404 (like GET a single
			// message), not a malformed-query 400.
			return nil, "", fmt.Errorf("%w: message %q not found (before cursor)", ErrNotFound, f.Before)
		}
	}

	// Drop system rows AFTER cursor resolution (clio order), if requested.
	page := make([]gact.Message, 0, len(all)-start)
	for _, m := range all[start:] {
		if !f.IncludeSystem && m.Role == gact.RoleSystem {
			continue
		}
		page = append(page, m)
	}

	// Apply limit to the newest N; next_cursor is the oldest-of-page id when the
	// limit truncated older rows that remain beyond this page.
	if f.Limit > 0 && len(page) > f.Limit {
		page = page[:f.Limit]
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

// ClearSessionMessages removes every message from a session and resets the
// per-session derived counters (message_count, tokens, cost). Returns the
// number of messages removed. Used by /clear and similar resets.
func (s *Store) ClearSessionMessages(sessionID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return 0, ErrNotFound
	}
	ids := s.messagesBySession[sessionID]
	for _, mid := range ids {
		delete(s.messages, mid)
	}
	n := len(ids)
	delete(s.messagesBySession, sessionID)
	sess.MessageCount = 0
	sess.Tokens = gact.Tokens{}
	sess.CostUSD = 0
	sess.UpdatedAt = s.now().UTC()
	return n, nil
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

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

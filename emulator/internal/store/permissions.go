package store

import (
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// PermissionAction aliases the wire type so callers don't need both imports.
type PermissionAction = gact.PermissionAction

// Re-exported wire constants.
const (
	PermAllow          = gact.PermAllow
	PermDeny           = gact.PermDeny
	PermAllowSession   = gact.PermAllowSession
	PermAllowWorkspace = gact.PermAllowWorkspace
)

// PermissionRequest is what the emulator stores about a pending tool-call
// approval. The wire shape (gact.PermissionRequest) is in pkg/gact.
type PermissionRequest struct {
	gact.PermissionRequest
	Status string // "pending" | "resolved"
	// Resolution is filled when the user replies via POST /v1/permissions/{id}.
	Action     PermissionAction
	ResolvedAt time.Time
	// resolveCh is signaled when the request is resolved. Scenarios block on
	// this to discover whether the agent should proceed.
	resolveCh chan PermissionAction
}

// Permissions is an in-memory store of pending and resolved permission
// requests. Methods are concurrency-safe.
type Permissions struct {
	mu      sync.Mutex
	byID    map[string]*PermissionRequest
	now     func() time.Time
}

// NewPermissions constructs an empty store.
func NewPermissions() *Permissions {
	return &Permissions{
		byID: make(map[string]*PermissionRequest),
		now:  time.Now,
	}
}

// Create registers a new pending permission request and returns it (with a
// fresh ID and a channel scenarios can wait on).
func (p *Permissions) Create(req gact.PermissionRequest) *PermissionRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	if req.ID == "" {
		req.ID = NewID(gact.IDPrefixPermission)
	}
	if req.CreatedAt.IsZero() {
		req.CreatedAt = p.now().UTC()
	}
	full := &PermissionRequest{
		PermissionRequest: req,
		Status:            "pending",
		resolveCh:         make(chan PermissionAction, 1),
	}
	p.byID[req.ID] = full
	return full
}

// Get returns a permission by ID.
func (p *Permissions) Get(id string) (*PermissionRequest, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	pr, ok := p.byID[id]
	if !ok {
		return nil, false
	}
	out := *pr
	out.resolveCh = nil // don't expose the channel via copy
	return &out, true
}

// PermissionFilter narrows a list query.
type PermissionFilter struct {
	SessionID string // empty = all sessions
	OnlyPending bool
}

// List returns matching permissions.
func (p *Permissions) List(f PermissionFilter) []PermissionRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]PermissionRequest, 0, len(p.byID))
	for _, pr := range p.byID {
		if f.SessionID != "" && pr.SessionID != f.SessionID {
			continue
		}
		if f.OnlyPending && pr.Status != "pending" {
			continue
		}
		copy := *pr
		copy.resolveCh = nil
		out = append(out, copy)
	}
	return out
}

// Resolve marks a permission as resolved with the given action and unblocks
// any scenario waiting on it. Returns false if the permission is unknown or
// already resolved.
func (p *Permissions) Resolve(id string, action PermissionAction) (*PermissionRequest, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	pr, ok := p.byID[id]
	if !ok || pr.Status != "pending" {
		return nil, false
	}
	pr.Status = "resolved"
	pr.Action = action
	pr.ResolvedAt = p.now().UTC()
	// Best-effort send. Buffer is 1, so this is non-blocking unless something
	// already sent (which would be a bug).
	select {
	case pr.resolveCh <- action:
	default:
	}
	close(pr.resolveCh)
	out := *pr
	out.resolveCh = nil
	return &out, true
}

// WaitFor blocks until the named permission is resolved (or the channel is
// closed). Intended for scenarios. Returns the action that resolved it; if
// the request was unknown or resolveCh was already drained, returns
// PermDeny as a safe default.
func (p *Permissions) WaitFor(id string) PermissionAction {
	p.mu.Lock()
	pr, ok := p.byID[id]
	p.mu.Unlock()
	if !ok || pr.resolveCh == nil {
		return PermDeny
	}
	action, open := <-pr.resolveCh
	if !open {
		return pr.Action
	}
	return action
}

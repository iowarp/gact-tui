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
	mu       sync.Mutex
	byID     map[string]*PermissionRequest
	policies []gact.Policy // MMM4: walk on Create for auto-resolve
	now      func() time.Time
}

// NewPermissions constructs an empty store.
func NewPermissions() *Permissions {
	return &Permissions{
		byID: make(map[string]*PermissionRequest),
		now:  time.Now,
	}
}

// SetPolicies replaces the policy list (PUT /v1/policies semantics).
func (p *Permissions) SetPolicies(pol []gact.Policy) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.policies = append(p.policies[:0], pol...)
}

// Policies returns a copy of the current policy list.
func (p *Permissions) Policies() []gact.Policy {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]gact.Policy, len(p.policies))
	copy(out, p.policies)
	return out
}

// matchPolicies walks the registered policies and returns the first
// matching action ("allow" | "deny" | "ask") + true. Returns
// ("", false) if no policy matches. Caller holds the lock.
func (p *Permissions) matchPolicies(req gact.PermissionRequest) (string, bool) {
	tool := req.ToolCall.ToolName
	path := ""
	if v, ok := req.ToolCall.Input["path"].(string); ok {
		path = v
	}
	for _, pol := range p.policies {
		if pol.Scope == "session" && pol.ScopeID != "" && pol.ScopeID != req.SessionID {
			continue
		}
		// Workspace scope intentionally accepts any session — the
		// scenario engine doesn't track ws/session linkage in the
		// PermissionRequest payload yet, so a workspace rule with a
		// scope_id is treated as "any session in this workspace".
		if !globMatch(pol.ToolNamePattern, tool) {
			continue
		}
		if pol.PathPattern != "" && !globMatch(pol.PathPattern, path) {
			continue
		}
		return pol.Action, true
	}
	return "", false
}

// globMatch is a tiny `*`/`**`-aware matcher. Empty pattern matches
// nothing (avoids accidental "match all" via missing field).
func globMatch(pattern, s string) bool {
	if pattern == "" {
		return false
	}
	if pattern == "*" || pattern == "**" {
		return true
	}
	// Cheap path-aware match: split on `*` and require every chunk
	// to appear in order. Doesn't handle `**` vs `*` distinction
	// fully, but covers the common cases (e.g. "/tmp/**", "shell",
	// "*.go") well enough for an emulator.
	chunks := splitGlob(pattern)
	idx := 0
	for _, c := range chunks {
		if c == "" {
			continue
		}
		j := indexFrom(s, c, idx)
		if j < 0 {
			return false
		}
		idx = j + len(c)
	}
	return true
}

func splitGlob(p string) []string {
	out := []string{}
	cur := ""
	for i := 0; i < len(p); i++ {
		if p[i] == '*' {
			if cur != "" {
				out = append(out, cur)
				cur = ""
			}
			continue
		}
		cur += string(p[i])
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func indexFrom(s, sub string, from int) int {
	if from > len(s) {
		return -1
	}
	for i := from; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// Create registers a new pending permission request and returns it (with a
// fresh ID and a channel scenarios can wait on). MMM4: if a registered
// policy matches with action allow/deny, the request is auto-resolved
// before returning — scenarios calling WaitFor see the resolution
// immediately.
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
	// MMM4: policy auto-resolve. "ask" means defer to interactive
	// resolution (no-op here); allow/deny resolve immediately.
	if action, ok := p.matchPolicies(req); ok && action != "ask" {
		var pa PermissionAction
		switch action {
		case "allow":
			pa = PermAllow
		case "deny":
			pa = PermDeny
		}
		full.Status = "resolved"
		full.Action = pa
		full.ResolvedAt = p.now().UTC()
		full.resolveCh <- pa
		close(full.resolveCh)
	}
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

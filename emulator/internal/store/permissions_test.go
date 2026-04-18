package store

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestPermissionCreateAndGet(t *testing.T) {
	p := NewPermissions()
	pr := p.Create(gact.PermissionRequest{
		SessionID: "sess_x",
		Summary:   "do dangerous thing",
		ToolCall: gact.PermissionToolCall{
			CallID:   "call_1",
			ToolName: "shell",
		},
	})
	if pr.ID == "" {
		t.Errorf("ID empty")
	}
	if pr.Status != "pending" {
		t.Errorf("status = %q", pr.Status)
	}

	got, ok := p.Get(pr.ID)
	if !ok {
		t.Fatalf("Get returned !ok")
	}
	if got.ID != pr.ID {
		t.Errorf("Get ID mismatch")
	}
	// Get returns a copy without resolveCh exposed.
	if got.resolveCh != nil {
		t.Errorf("Get returned resolveCh — should be hidden")
	}

	if _, ok := p.Get("perm_nope"); ok {
		t.Errorf("Get unknown returned ok")
	}
}

func TestPermissionListFilter(t *testing.T) {
	p := NewPermissions()
	p.Create(gact.PermissionRequest{SessionID: "sess_a"})
	p.Create(gact.PermissionRequest{SessionID: "sess_a"})
	p.Create(gact.PermissionRequest{SessionID: "sess_b"})

	if got := p.List(PermissionFilter{}); len(got) != 3 {
		t.Errorf("all: %d, want 3", len(got))
	}
	if got := p.List(PermissionFilter{SessionID: "sess_a"}); len(got) != 2 {
		t.Errorf("sess_a: %d, want 2", len(got))
	}
	if got := p.List(PermissionFilter{SessionID: "sess_b"}); len(got) != 1 {
		t.Errorf("sess_b: %d, want 1", len(got))
	}
}

func TestPermissionResolveWaitFor(t *testing.T) {
	p := NewPermissions()
	pr := p.Create(gact.PermissionRequest{SessionID: "sess_x"})

	// WaitFor in another goroutine; main resolves after a tick.
	got := make(chan PermissionAction, 1)
	go func() {
		got <- p.WaitFor(pr.ID)
	}()

	time.Sleep(20 * time.Millisecond)
	resolved, ok := p.Resolve(pr.ID, PermAllow)
	if !ok {
		t.Fatalf("Resolve returned !ok")
	}
	if resolved.Status != "resolved" {
		t.Errorf("status = %q", resolved.Status)
	}

	select {
	case action := <-got:
		if action != PermAllow {
			t.Errorf("WaitFor returned %q", action)
		}
	case <-time.After(time.Second):
		t.Fatal("WaitFor never returned")
	}

	// Filter onlypending excludes resolved
	if pending := p.List(PermissionFilter{OnlyPending: true}); len(pending) != 0 {
		t.Errorf("OnlyPending after resolve: %d, want 0", len(pending))
	}

	// Resolve again should fail.
	if _, ok := p.Resolve(pr.ID, PermDeny); ok {
		t.Errorf("double resolve returned ok")
	}
}

func TestPermissionWaitForUnknown(t *testing.T) {
	p := NewPermissions()
	if got := p.WaitFor("perm_nope"); got != PermDeny {
		t.Errorf("WaitFor unknown = %q, want PermDeny", got)
	}
}

func TestPermissionResolveUnknown(t *testing.T) {
	p := NewPermissions()
	if _, ok := p.Resolve("perm_nope", PermAllow); ok {
		t.Errorf("Resolve unknown returned ok")
	}
}

package store

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s := New()
	// Frozen clock so created_at is deterministic.
	frozen := time.Date(2026, 4, 18, 0, 0, 0, 0, time.UTC)
	s.SetClock(func() time.Time { return frozen })
	return s
}

func TestNewIDPrefix(t *testing.T) {
	id := NewID(gact.IDPrefixSession)
	if !strings.HasPrefix(id, gact.IDPrefixSession) {
		t.Errorf("ID %q missing prefix %q", id, gact.IDPrefixSession)
	}
	if len(id) != len(gact.IDPrefixSession)+32 {
		t.Errorf("ID %q length = %d, want %d", id, len(id), len(gact.IDPrefixSession)+32)
	}
}

func TestWorkspaceCRUD(t *testing.T) {
	s := newTestStore(t)

	// Create
	created, err := s.CreateWorkspace(gact.Workspace{
		Name:     "demo",
		RootPath: "/tmp/demo",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if !strings.HasPrefix(created.ID, gact.IDPrefixWorkspace) {
		t.Errorf("ID = %q, want prefix %q", created.ID, gact.IDPrefixWorkspace)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Errorf("timestamps not set")
	}

	// Create with empty root_path → invalid
	if _, err := s.CreateWorkspace(gact.Workspace{}); !errors.Is(err, ErrInvalidArg) {
		t.Errorf("CreateWorkspace empty: err = %v, want ErrInvalidArg", err)
	}

	// Get
	got, err := s.GetWorkspace(created.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if got.Name != "demo" {
		t.Errorf("Name = %q, want demo", got.Name)
	}

	// Get not found
	if _, err := s.GetWorkspace("ws_nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetWorkspace missing: err = %v", err)
	}

	// Update
	updated, err := s.UpdateWorkspace(created.ID, func(w *gact.Workspace) {
		w.Name = "renamed"
	})
	if err != nil {
		t.Fatalf("UpdateWorkspace: %v", err)
	}
	if updated.Name != "renamed" {
		t.Errorf("Name after update = %q", updated.Name)
	}

	// List
	if list := s.ListWorkspaces(); len(list) != 1 {
		t.Errorf("ListWorkspaces count = %d, want 1", len(list))
	}

	// Delete
	if err := s.DeleteWorkspace(created.ID); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	if _, err := s.GetWorkspace(created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("after delete: err = %v", err)
	}
}

func TestSessionCRUD(t *testing.T) {
	s := newTestStore(t)
	ws, _ := s.CreateWorkspace(gact.Workspace{RootPath: "/tmp/x"})

	// Create with bad workspace
	if _, err := s.CreateSession(gact.Session{WorkspaceID: "ws_bad"}); !errors.Is(err, ErrInvalidArg) {
		t.Errorf("CreateSession bad ws: err = %v", err)
	}

	// Create
	sess, err := s.CreateSession(gact.Session{
		WorkspaceID: ws.ID,
		Title:       "first",
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if sess.Status != gact.StatusIdle {
		t.Errorf("status = %q, want idle", sess.Status)
	}

	// Subsession with bad parent
	if _, err := s.CreateSession(gact.Session{
		WorkspaceID:     ws.ID,
		ParentSessionID: "sess_bad",
	}); !errors.Is(err, ErrInvalidArg) {
		t.Errorf("Create subsession bad parent: err = %v", err)
	}

	// Subsession with good parent
	sub, err := s.CreateSession(gact.Session{
		WorkspaceID:     ws.ID,
		ParentSessionID: sess.ID,
		Title:           "sub",
	})
	if err != nil {
		t.Fatalf("Create subsession: %v", err)
	}

	// List by parent
	subs := s.ListSessions(SessionFilter{ParentSessionID: sess.ID})
	if len(subs) != 1 || subs[0].ID != sub.ID {
		t.Errorf("List by parent: %+v", subs)
	}

	// List with HasParent=false (roots only)
	hp := false
	roots := s.ListSessions(SessionFilter{HasParent: &hp})
	if len(roots) != 1 || roots[0].ID != sess.ID {
		t.Errorf("List roots: %+v", roots)
	}

	// Update
	updated, err := s.UpdateSession(sess.ID, func(x *gact.Session) {
		x.Title = "renamed"
		x.Status = gact.StatusRunning
	})
	if err != nil || updated.Title != "renamed" {
		t.Errorf("UpdateSession: %v %+v", err, updated)
	}

	// Cascade delete: delete workspace, sessions go too
	if err := s.DeleteWorkspace(ws.ID); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	if _, err := s.GetSession(sess.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("session not cascaded: err = %v", err)
	}
	if _, err := s.GetSession(sub.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("subsession not cascaded: err = %v", err)
	}
}

func TestArchivedSessionsFiltered(t *testing.T) {
	s := newTestStore(t)
	ws, _ := s.CreateWorkspace(gact.Workspace{RootPath: "/tmp/x"})
	sess, _ := s.CreateSession(gact.Session{WorkspaceID: ws.ID})

	now := time.Now()
	_, _ = s.UpdateSession(sess.ID, func(x *gact.Session) { x.ArchivedAt = &now })

	if got := s.ListSessions(SessionFilter{}); len(got) != 0 {
		t.Errorf("archived shown by default: %+v", got)
	}
	if got := s.ListSessions(SessionFilter{IncludeArchived: true}); len(got) != 1 {
		t.Errorf("archived hidden when IncludeArchived=true: %+v", got)
	}
}

func TestMessageAppendAndList(t *testing.T) {
	s := newTestStore(t)
	ws, _ := s.CreateWorkspace(gact.Workspace{RootPath: "/tmp/x"})
	sess, _ := s.CreateSession(gact.Session{WorkspaceID: ws.ID})

	// Append a user message
	user, err := s.AppendMessage(gact.Message{
		SessionID: sess.ID,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("hello")},
	})
	if err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}
	if user.Parts[0].ID == "" {
		t.Errorf("part ID not generated")
	}

	// Append assistant message
	asst, _ := s.AppendMessage(gact.Message{
		SessionID: sess.ID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart("hi back")},
	})

	// Append a system message
	_, _ = s.AppendMessage(gact.Message{
		SessionID: sess.ID,
		Role:      gact.RoleSystem,
		Parts:     []gact.Part{gact.NewTextPart("you are a chatbot")},
	})

	// List newest-first, hide system by default
	msgs, next, err := s.ListMessages(MessageFilter{SessionID: sess.ID, Limit: 10})
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(msgs) != 2 {
		t.Errorf("ListMessages without system: count = %d, want 2 (got %v)", len(msgs), msgs)
	}
	if msgs[0].ID != asst.ID {
		t.Errorf("Newest-first ordering broken: first = %s, want %s", msgs[0].ID, asst.ID)
	}
	if next != "" {
		t.Errorf("Unexpected next cursor: %q", next)
	}

	// Include system
	msgs, _, _ = s.ListMessages(MessageFilter{SessionID: sess.ID, Limit: 10, IncludeSystem: true})
	if len(msgs) != 3 {
		t.Errorf("with system: count = %d, want 3", len(msgs))
	}

	// Pagination: limit=1 returns one and a cursor
	msgs, next, _ = s.ListMessages(MessageFilter{SessionID: sess.ID, Limit: 1})
	if len(msgs) != 1 {
		t.Errorf("page1 count = %d, want 1", len(msgs))
	}
	if next == "" {
		t.Fatalf("page1 next cursor empty")
	}

	// Page 2 via cursor
	msgs, next, _ = s.ListMessages(MessageFilter{SessionID: sess.ID, Limit: 1, Before: next})
	if len(msgs) != 1 || msgs[0].ID != user.ID {
		t.Errorf("page2: %+v", msgs)
	}
	// Now no more (since system is hidden by default and we've consumed the assistant + user)
	if next != "" {
		t.Errorf("page2 next cursor non-empty: %q", next)
	}

	// Session message_count tracked
	if got, _ := s.GetSession(sess.ID); got.MessageCount != 3 {
		t.Errorf("session.message_count = %d, want 3", got.MessageCount)
	}
}

func TestUpdateMessagePart(t *testing.T) {
	s := newTestStore(t)
	ws, _ := s.CreateWorkspace(gact.Workspace{RootPath: "/tmp/x"})
	sess, _ := s.CreateSession(gact.Session{WorkspaceID: ws.ID})
	msg, _ := s.AppendMessage(gact.Message{
		SessionID: sess.ID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart("partial")},
	})
	pid := msg.Parts[0].ID

	updated, err := s.UpdateMessagePart(msg.ID, pid, func(p *gact.Part) {
		p.Text = p.Text + " more"
	})
	if err != nil {
		t.Fatalf("UpdateMessagePart: %v", err)
	}
	if updated.Text != "partial more" {
		t.Errorf("part text = %q", updated.Text)
	}

	got, _ := s.GetMessage(msg.ID)
	if got.Parts[0].Text != "partial more" {
		t.Errorf("get message part text = %q", got.Parts[0].Text)
	}
}

func TestDeleteMessageBookkeeping(t *testing.T) {
	s := newTestStore(t)
	ws, _ := s.CreateWorkspace(gact.Workspace{RootPath: "/tmp/x"})
	sess, _ := s.CreateSession(gact.Session{WorkspaceID: ws.ID})
	a, _ := s.AppendMessage(gact.Message{SessionID: sess.ID, Role: gact.RoleUser, Parts: []gact.Part{gact.NewTextPart("a")}})
	b, _ := s.AppendMessage(gact.Message{SessionID: sess.ID, Role: gact.RoleAssistant, Parts: []gact.Part{gact.NewTextPart("b")}})

	if err := s.DeleteMessage(a.ID); err != nil {
		t.Fatalf("DeleteMessage: %v", err)
	}
	if _, err := s.GetMessage(a.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("deleted message still findable: err = %v", err)
	}
	got, _ := s.GetSession(sess.ID)
	if got.MessageCount != 1 {
		t.Errorf("session.message_count after delete = %d, want 1", got.MessageCount)
	}
	// b still there
	if _, err := s.GetMessage(b.ID); err != nil {
		t.Errorf("non-deleted message not findable: %v", err)
	}
}

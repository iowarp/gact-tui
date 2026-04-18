package server

import (
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// newServerWithSeededWorkspace returns a Server backed by a store that
// already has a workspace `ws_test`.
func newServerWithSeededWorkspace(t *testing.T) (*Server, string) {
	t.Helper()
	st := store.New()
	ws, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"})
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	return NewWithStore(Config{}, st), ws.ID
}

func TestSessionLifecycle(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	// list empty
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions?workspace_id="+wsID, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list empty: %d %s", rec.Code, rec.Body.String())
		}
		var body ListSessionsResponse
		mustDecode(t, rec, &body)
		if len(body.Sessions) != 0 {
			t.Errorf("expected empty list, got %d", len(body.Sessions))
		}
	}

	// create
	var sess gact.Session
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions", CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "first conversation",
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
		}
		mustDecode(t, rec, &sess)
		if sess.ID == "" {
			t.Errorf("session ID empty")
		}
		if sess.Status != gact.StatusIdle {
			t.Errorf("status = %q, want idle", sess.Status)
		}
	}

	// create with missing workspace_id
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions", CreateSessionRequest{Title: "no workspace"})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("create without workspace_id: status %d", rec.Code)
		}
	}

	// create with bad workspace_id
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions", CreateSessionRequest{WorkspaceID: "ws_nope"})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("create with bad workspace: status %d", rec.Code)
		}
	}

	// list now has one
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions?workspace_id="+wsID, nil)
		var body ListSessionsResponse
		mustDecode(t, rec, &body)
		if len(body.Sessions) != 1 {
			t.Errorf("list count = %d, want 1", len(body.Sessions))
		}
	}

	// get
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions/"+sess.ID, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
		var got gact.Session
		mustDecode(t, rec, &got)
		if got.ID != sess.ID {
			t.Errorf("get returned wrong ID")
		}
	}

	// patch title
	{
		newTitle := "renamed"
		rec := do(t, h, http.MethodPatch, "/v1/sessions/"+sess.ID, UpdateSessionRequest{Title: &newTitle})
		if rec.Code != http.StatusOK {
			t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
		}
		var got gact.Session
		mustDecode(t, rec, &got)
		if got.Title != "renamed" {
			t.Errorf("patch title = %q", got.Title)
		}
	}

	// archive then unarchive
	{
		yes := true
		rec := do(t, h, http.MethodPatch, "/v1/sessions/"+sess.ID, UpdateSessionRequest{Archived: &yes})
		if rec.Code != http.StatusOK {
			t.Fatalf("archive: %d", rec.Code)
		}
		var got gact.Session
		mustDecode(t, rec, &got)
		if got.ArchivedAt == nil {
			t.Errorf("ArchivedAt nil after archive")
		}

		// list with default (no ?archived=true) hides it
		recList := do(t, h, http.MethodGet, "/v1/sessions?workspace_id="+wsID, nil)
		var bodyList ListSessionsResponse
		mustDecode(t, recList, &bodyList)
		if len(bodyList.Sessions) != 0 {
			t.Errorf("archived shown in default list: %d", len(bodyList.Sessions))
		}

		// list with ?archived=true shows it
		recList2 := do(t, h, http.MethodGet, "/v1/sessions?workspace_id="+wsID+"&archived=true", nil)
		var bodyList2 ListSessionsResponse
		mustDecode(t, recList2, &bodyList2)
		if len(bodyList2.Sessions) != 1 {
			t.Errorf("archived hidden when ?archived=true: %d", len(bodyList2.Sessions))
		}

		no := false
		recU := do(t, h, http.MethodPatch, "/v1/sessions/"+sess.ID, UpdateSessionRequest{Archived: &no})
		if recU.Code != http.StatusOK {
			t.Errorf("unarchive: %d", recU.Code)
		}
	}

	// summarize
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sess.ID+"/summarize", nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("summarize: %d", rec.Code)
		}
	}

	// cancel
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sess.ID+"/cancel", nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("cancel: %d", rec.Code)
		}
	}

	// delete
	{
		rec := do(t, h, http.MethodDelete, "/v1/sessions/"+sess.ID, nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("delete: %d", rec.Code)
		}
	}

	// delete missing
	{
		rec := do(t, h, http.MethodDelete, "/v1/sessions/"+sess.ID, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("delete missing: %d", rec.Code)
		}
	}
}

func TestSessionFork(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()
	st := srv.Store()

	// Create parent + add a few messages
	parent, err := st.CreateSession(gact.Session{WorkspaceID: wsID, Title: "parent"})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	for i := 0; i < 3; i++ {
		if _, err := st.AppendMessage(gact.Message{
			SessionID: parent.ID,
			Role:      gact.RoleUser,
			Parts:     []gact.Part{gact.NewTextPart("hi")},
		}); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}

	// Fork (no at_message_id → copy all)
	rec := do(t, h, http.MethodPost, "/v1/sessions/"+parent.ID+"/fork", ForkSessionRequest{Title: "branch"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("fork: %d %s", rec.Code, rec.Body.String())
	}
	var child gact.Session
	mustDecode(t, rec, &child)
	if child.ParentSessionID != parent.ID {
		t.Errorf("ParentSessionID = %q, want %q", child.ParentSessionID, parent.ID)
	}
	if child.MessageCount != 3 {
		t.Errorf("MessageCount = %d, want 3", child.MessageCount)
	}
	if child.Title != "branch" {
		t.Errorf("Title = %q", child.Title)
	}

	// Fork without explicit title appends "(fork)"
	rec2 := do(t, h, http.MethodPost, "/v1/sessions/"+parent.ID+"/fork", ForkSessionRequest{})
	var child2 gact.Session
	mustDecode(t, rec2, &child2)
	if child2.Title != "parent (fork)" {
		t.Errorf("default fork title = %q", child2.Title)
	}
}

func TestSessionExportImport(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()
	st := srv.Store()

	sess, _ := st.CreateSession(gact.Session{WorkspaceID: wsID, Title: "exportable"})
	for _, msg := range []string{"hello", "world", "!"} {
		_, err := st.AppendMessage(gact.Message{
			SessionID: sess.ID,
			Role:      gact.RoleUser,
			Parts:     []gact.Part{gact.NewTextPart(msg)},
		})
		if err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	// Export
	rec := do(t, h, http.MethodGet, "/v1/sessions/"+sess.ID+"/export", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("export: %d", rec.Code)
	}
	var blob SessionExport
	mustDecode(t, rec, &blob)
	if blob.Format != sessionExportFormat {
		t.Errorf("export format = %q", blob.Format)
	}
	if len(blob.Messages) != 3 {
		t.Errorf("export message count = %d, want 3", len(blob.Messages))
	}
	if blob.Messages[0].Parts[0].Text != "hello" {
		t.Errorf("export not chronological: first msg text = %q", blob.Messages[0].Parts[0].Text)
	}

	// Import — round-trip
	recImport := do(t, h, http.MethodPost, "/v1/sessions/import", blob)
	if recImport.Code != http.StatusCreated {
		t.Fatalf("import: %d %s", recImport.Code, recImport.Body.String())
	}
	var imported gact.Session
	mustDecode(t, recImport, &imported)
	if imported.ID == sess.ID {
		t.Errorf("import reused old ID — should generate new")
	}
	if imported.MessageCount != 3 {
		t.Errorf("imported MessageCount = %d", imported.MessageCount)
	}

	// Import bad format
	bad := blob
	bad.Format = "future-v99"
	recBad := do(t, h, http.MethodPost, "/v1/sessions/import", bad)
	if recBad.Code != http.StatusBadRequest {
		t.Errorf("import bad format: %d", recBad.Code)
	}
}

func TestSessionSubFiltering(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()
	st := srv.Store()

	root, _ := st.CreateSession(gact.Session{WorkspaceID: wsID, Title: "root"})
	sub, _ := st.CreateSession(gact.Session{WorkspaceID: wsID, ParentSessionID: root.ID, Title: "sub"})

	rec := do(t, h, http.MethodGet, "/v1/sessions?parent_session_id="+root.ID, nil)
	var body ListSessionsResponse
	mustDecode(t, rec, &body)
	if len(body.Sessions) != 1 || body.Sessions[0].ID != sub.ID {
		t.Errorf("filter by parent_session_id failed: %+v", body)
	}
}

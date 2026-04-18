package server

import (
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// helper that returns a fresh server + a workspace + a session.
func newServerWithSession(t *testing.T) (*Server, string, string) {
	t.Helper()
	srv, wsID := newServerWithSeededWorkspace(t)
	sess, err := srv.Store().CreateSession(gact.Session{WorkspaceID: wsID, Title: "convo"})
	if err != nil {
		t.Fatalf("seed session: %v", err)
	}
	return srv, wsID, sess.ID
}

func TestPostMessageReturns202(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// Track the on-user-message hook firing.
	calls := 0
	srv.SetOnUserMessage(func(_, _ string) { calls++ })

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("write a fizzbuzz")},
	})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("post: %d %s", rec.Code, rec.Body.String())
	}
	var body PostMessageResponse
	mustDecode(t, rec, &body)
	if body.MessageID == "" {
		t.Errorf("MessageID empty")
	}
	if body.AcceptedAt.IsZero() {
		t.Errorf("AcceptedAt zero")
	}
	if calls != 1 {
		t.Errorf("OnUserMessage called %d times, want 1", calls)
	}
}

func TestPostMessageEmptyParts400(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	rec := do(t, srv.Handler(), http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{Parts: nil})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestListMessagesPagination(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	for i := 0; i < 5; i++ {
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
			Parts: []gact.Part{gact.NewTextPart("m")},
		})
		if rec.Code != http.StatusAccepted {
			t.Fatalf("post %d: %d", i, rec.Code)
		}
	}

	// Page 1 (limit=2)
	rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages?limit=2", nil)
	var body ListMessagesResponse
	mustDecode(t, rec, &body)
	if len(body.Messages) != 2 {
		t.Errorf("page1 count = %d, want 2", len(body.Messages))
	}
	if body.NextCursor == "" {
		t.Fatalf("page1 next cursor empty")
	}

	// Page 2
	rec2 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages?limit=2&before="+body.NextCursor, nil)
	var page2 ListMessagesResponse
	mustDecode(t, rec2, &page2)
	if len(page2.Messages) != 2 {
		t.Errorf("page2 count = %d, want 2", len(page2.Messages))
	}
}

func TestGetMessage(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("hello")},
	})
	var posted PostMessageResponse
	mustDecode(t, rec, &posted)

	rec2 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/"+posted.MessageID, nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("get: %d", rec2.Code)
	}
	var got gact.Message
	mustDecode(t, rec2, &got)
	if got.Parts[0].Text != "hello" {
		t.Errorf("text = %q", got.Parts[0].Text)
	}

	rec3 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/msg_nope", nil)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("missing: %d", rec3.Code)
	}
}

func TestDeleteMessage(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("bye")},
	})
	var posted PostMessageResponse
	mustDecode(t, rec, &posted)

	rec2 := do(t, h, http.MethodDelete, "/v1/sessions/"+sid+"/messages/"+posted.MessageID, nil)
	if rec2.Code != http.StatusNoContent {
		t.Errorf("delete: %d", rec2.Code)
	}
	rec3 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/"+posted.MessageID, nil)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("after delete: %d", rec3.Code)
	}
}

func TestPatchPart(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// Append a message via store (so we control the part ID for the URL).
	msg, _ := srv.Store().AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart("partial")},
	})
	pid := msg.Parts[0].ID

	rec := do(t, h, http.MethodPatch, "/v1/sessions/"+sid+"/messages/"+msg.ID+"/parts/"+pid, PatchPartRequest{
		Text: "partial more",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	var got gact.Part
	mustDecode(t, rec, &got)
	if got.Text != "partial more" {
		t.Errorf("text = %q", got.Text)
	}
}

func TestSearchMessages(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	for _, body := range []string{"hello world", "foo bar baz", "find me here"} {
		_, err := srv.Store().AppendMessage(gact.Message{
			SessionID: sid,
			Role:      gact.RoleUser,
			Parts:     []gact.Part{gact.NewTextPart(body)},
		})
		if err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/search?q=find", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("search: %d %s", rec.Code, rec.Body.String())
	}
	var body SearchResponse
	mustDecode(t, rec, &body)
	if len(body.Matches) != 1 {
		t.Errorf("matches = %d, want 1: %+v", len(body.Matches), body.Matches)
	}
	if body.Matches[0].Snippet == "" {
		t.Errorf("snippet empty")
	}

	// Empty q → 400
	rec2 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/search", nil)
	if rec2.Code != http.StatusBadRequest {
		t.Errorf("empty q: %d", rec2.Code)
	}
}

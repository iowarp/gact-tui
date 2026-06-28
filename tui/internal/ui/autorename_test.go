package ui

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestDerivedTitle_TakesFirstLineAndTruncates(t *testing.T) {
	cases := []struct{ in, want string }{
		{"short message", "short message"},
		{"line one\nline two", "line one"},
		{"  spaced   out   text  ", "spaced out text"},
		{"", "untitled"},
		{strings.Repeat("x", 80), strings.Repeat("x", autoRenameTitleMaxLen-1) + "…"},
	}
	for _, tc := range cases {
		got := derivedTitle(tc.in)
		if got != tc.want {
			t.Errorf("derivedTitle(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestAutoRenameTitle_DefaultTitleTriggersRename(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: "new session 12:34:56"}}
	a.conversation.messages = []gact.Message{{Role: gact.RoleUser, ID: "m1"}}

	got, ok := autoRenameTitle(a, "s1", "refactor the auth middleware")
	if !ok {
		t.Fatal("expected auto-rename to trigger for default-titled session")
	}
	if got != "refactor the auth middleware" {
		t.Errorf("got %q, want the message text", got)
	}
}

func TestAutoRenameTitle_EmptyTitleAlsoTriggers(t *testing.T) {
	// Some backends don't set a default title at all. Empty should
	// still trigger the rename rather than get skipped.
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: ""}}
	_, ok := autoRenameTitle(a, "s1", "hello")
	if !ok {
		t.Error("empty title should trigger rename")
	}
}

func TestAutoRenameTitle_UserAlreadyRenamedSkips(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: "my-chosen-title"}}
	_, ok := autoRenameTitle(a, "s1", "new prompt")
	if ok {
		t.Error("should not overwrite a user-set title")
	}
}

func TestAutoRenameTitle_SecondUserMessageSkips(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: "new session x"}}
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleUser, ID: "m1"},
		{Role: gact.RoleAssistant, ID: "m2"},
		{Role: gact.RoleUser, ID: "m3"}, // second user message
	}
	_, ok := autoRenameTitle(a, "s1", "follow-up prompt")
	if ok {
		t.Error("second user message should not trigger rename")
	}
}

func TestAutoRenameTitle_UnknownSessionSkips(t *testing.T) {
	a := New("http://unused")
	_, ok := autoRenameTitle(a, "unknown", "hi")
	if ok {
		t.Error("unknown session should not trigger rename")
	}
}

func TestAutoRenameTitle_EmptyTextSkips(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: "new session x"}}
	_, ok := autoRenameTitle(a, "s1", "")
	if ok {
		t.Error("empty text should not trigger rename")
	}
}

func TestPatchSessionTitleCmd_SendsPATCHAndMirrorsIntoSession(t *testing.T) {
	// Spy on the wire: capture the PATCH body and return a session
	// with the new title so the round-trip is covered.
	var (
		mu       sync.Mutex
		gotTitle string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || !strings.HasSuffix(r.URL.Path, "/v1/sessions/s1") {
			http.NotFound(w, r)
			return
		}
		buf, _ := io.ReadAll(r.Body)
		var body struct{ Title string }
		_ = json.Unmarshal(buf, &body)
		mu.Lock()
		gotTitle = body.Title
		mu.Unlock()
		_, _ = w.Write([]byte(`{"id":"s1","title":"refactor the auth middleware"}`))
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	cmd := patchSessionTitleCmd(c, "s1", "refactor the auth middleware")
	msg := cmd()
	renamed, ok := msg.(sessionTitleRenamedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want sessionTitleRenamedMsg", msg)
	}
	if renamed.err != nil {
		t.Fatalf("renamed.err = %v", renamed.err)
	}
	if renamed.title != "refactor the auth middleware" {
		t.Errorf("title = %q", renamed.title)
	}
	mu.Lock()
	defer mu.Unlock()
	if gotTitle != "refactor the auth middleware" {
		t.Errorf("PATCH body title = %q, want the same", gotTitle)
	}

	// Feed the result through Update and verify a.session.sessions was updated.
	a := New(srv.URL)
	a.session.sessions = []gact.Session{{ID: "s1", Title: "new session x"}}
	_, _ = a.Update(renamed)
	if a.session.sessions[0].Title != "refactor the auth middleware" {
		t.Errorf("a.session.sessions[0].Title = %q after Update, want new title", a.session.sessions[0].Title)
	}
}

func TestPatchSessionTitleCmd_SwallowsErrorSilently(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"no"}`, http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	msg := patchSessionTitleCmd(c, "s1", "ignored")()
	renamed, _ := msg.(sessionTitleRenamedMsg)
	if renamed.err == nil {
		t.Error("expected renamed.err to be set on 500")
	}

	// Feed through Update — should NOT modify the session title.
	a := New(srv.URL)
	a.session.sessions = []gact.Session{{ID: "s1", Title: "new session x"}}
	_, _ = a.Update(renamed)
	if a.session.sessions[0].Title != "new session x" {
		t.Errorf("title mutated on rename failure: %q", a.session.sessions[0].Title)
	}
	if a.transientHint != "" {
		t.Errorf("auto-rename failure should stay silent, hint=%q", a.transientHint)
	}
}

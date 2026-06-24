package ui

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeRenameApp builds an App pointed at a spy server that 200s any
// PATCH to a session. Tests capture the PATCHed title via the mu-guarded
// closure variable.
func makeRenameApp(t *testing.T) (*App, *sync.Mutex, *string) {
	t.Helper()
	var (
		mu    sync.Mutex
		title string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/v1/sessions/") {
			buf, _ := io.ReadAll(r.Body)
			var body struct{ Title string }
			_ = json.Unmarshal(buf, &body)
			mu.Lock()
			title = body.Title
			mu.Unlock()
			_, _ = w.Write([]byte(`{"id":"s1","title":"` + body.Title + `"}`))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "s1", Title: "original"}}
	a.session.selected = 0
	return a, &mu, &title
}

func TestRename_EKeyOpensWithPrefilledTitle(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if !a.rename.open {
		t.Fatal("e should open rename modal")
	}
	if a.rename.input.Value() != "original" {
		t.Errorf("draft = %q, want pre-fill", a.rename.input.Value())
	}
	if a.rename.input.Cursor() != len("original") {
		t.Errorf("cursor = %d, want %d (end)", a.rename.input.Cursor(), len("original"))
	}
}

func TestRename_EscCancelsWithoutPatch(t *testing.T) {
	a, mu, got := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("changed")
	a.rename.input.SetCursor(len("changed"))
	_, cmd := a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.rename.open {
		t.Error("Esc should close the modal")
	}
	if cmd != nil {
		t.Error("Esc should not dispatch a cmd")
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("PATCH should not have fired, got title=%q", *got)
	}
}

func TestRename_EnterCommitsAndPatches(t *testing.T) {
	a, mu, got := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("refactor the auth middleware")
	a.rename.input.SetCursor(len(a.rename.input.Value()))
	_, cmd := a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.rename.open {
		t.Error("Enter should close the modal")
	}
	if cmd == nil {
		t.Fatal("Enter should dispatch a PATCH cmd")
	}
	// Optimistic local update first — sidebar reflects the new title
	// before the PATCH completes.
	if a.session.sessions[0].Title != "refactor the auth middleware" {
		t.Errorf("optimistic title not applied: %q", a.session.sessions[0].Title)
	}
	// Run the cmd (it issues the PATCH) and verify the spy captured it.
	msg := cmd()
	if _, ok := msg.(sessionTitleRenamedMsg); !ok {
		t.Errorf("cmd returned %T, want sessionTitleRenamedMsg", msg)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "refactor the auth middleware" {
		t.Errorf("PATCH title = %q", *got)
	}
}

func TestRename_RunningSessionWithScopedIDUsesEscapedPatchPath(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		if r.Method != http.MethodPatch {
			t.Fatalf("method = %s", r.Method)
		}
		if gotPath != "/v1/sessions/ws1%2Frunning%3Fsession" {
			t.Fatalf("path = %q", gotPath)
		}
		_, _ = w.Write([]byte(`{"id":"ws1/running?session","title":"live demo run","status":"running"}`))
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "ws1/running?session", Title: "original", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	a.rename.open = true
	a.rename.input.SetValue("live demo run")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	model, cmd := a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("Enter should dispatch a PATCH cmd")
	}
	if a.rename.open {
		t.Fatal("rename modal should close before patch result")
	}
	if a.session.sessions[0].Title != "live demo run" || a.session.sessions[0].Status != gact.StatusRunning {
		t.Fatalf("optimistic running session state = %#v", a.session.sessions[0])
	}
	msg := cmd()
	model, follow := a.Update(msg)
	a = model.(*App)
	if follow != nil {
		t.Fatal("successful rename should not dispatch a follow-up command")
	}
	if a.session.sessions[0].Title != "live demo run" || a.session.currentStatus != gact.StatusRunning {
		t.Fatalf("renamed running session state = %#v current=%q", a.session.sessions[0], a.session.currentStatus)
	}
	if gotPath == "" {
		t.Fatal("server did not receive PATCH")
	}
}

func TestRename_ManualFailureRestoresTitleAndShowsHint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/v1/sessions/") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"code":"validation_error","message":"session title failed validation: reserved demo failure"}}`))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "s1", Title: "original"}}
	a.session.selected = 0
	a.rename.open = true
	a.rename.input.SetValue("reserved demo failure")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_, cmd := a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter should dispatch a PATCH cmd")
	}
	if a.session.sessions[0].Title != "reserved demo failure" {
		t.Fatalf("optimistic title = %q", a.session.sessions[0].Title)
	}
	msg := cmd()
	model, followup := a.Update(msg)
	a = model.(*App)
	if followup == nil {
		t.Fatal("manual rename failure should schedule hint expiry")
	}
	if a.session.sessions[0].Title != "original" {
		t.Fatalf("manual rename failure should restore previous title, got %q", a.session.sessions[0].Title)
	}
	if !strings.Contains(a.transientHint, "rename failed:") ||
		!strings.Contains(a.transientHint, "reserved demo failure") {
		t.Fatalf("manual rename failure hint not useful: %q", a.transientHint)
	}
}

func TestRename_EmptyInputCancels(t *testing.T) {
	a, mu, got := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("   ") // whitespace-only
	a.rename.input.SetCursor(3)
	_, cmd := a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Error("empty-title enter should not dispatch a PATCH")
	}
	if !strings.Contains(a.transientHint, "cancelled") {
		t.Errorf("expected a 'cancelled' hint, got %q", a.transientHint)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("PATCH should not have fired on empty input, got title=%q", *got)
	}
}

func TestRename_BackspaceAndTyping(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("abc")
	a.rename.input.SetCursor(3)

	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.rename.input.Value() != "ab" || a.rename.input.Cursor() != 2 {
		t.Errorf("after backspace: draft=%q cursor=%d, want 'ab' 2", a.rename.input.Value(), a.rename.input.Cursor())
	}
	a.rename.handleKey(tea.KeyPressMsg{Code: 'X', Text: "X"})
	if a.rename.input.Value() != "abX" || a.rename.input.Cursor() != 3 {
		t.Errorf("after typing: draft=%q cursor=%d, want 'abX' 3", a.rename.input.Value(), a.rename.input.Cursor())
	}
}

func TestRename_CursorMovementKeys(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("hello")
	a.rename.input.SetCursor(3)

	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyLeft})
	if a.rename.input.Cursor() != 2 {
		t.Errorf("← cursor = %d", a.rename.input.Cursor())
	}
	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.rename.input.Cursor() != 3 {
		t.Errorf("→ cursor = %d", a.rename.input.Cursor())
	}
	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyHome})
	if a.rename.input.Cursor() != 0 {
		t.Errorf("Home cursor = %d", a.rename.input.Cursor())
	}
	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyEnd})
	if a.rename.input.Cursor() != 5 {
		t.Errorf("End cursor = %d", a.rename.input.Cursor())
	}
	// ← at column 0 clamps, doesn't underflow.
	a.rename.input.SetCursor(0)
	a.rename.handleKey(tea.KeyPressMsg{Code: tea.KeyLeft})
	if a.rename.input.Cursor() != 0 {
		t.Errorf("← at col 0 = %d", a.rename.input.Cursor())
	}
}

func TestRename_InsertInMiddle(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("hello")
	a.rename.input.SetCursor(2) // between "he" and "llo"

	a.rename.handleKey(tea.KeyPressMsg{Code: 'Z', Text: "Z"})
	if a.rename.input.Value() != "heZllo" || a.rename.input.Cursor() != 3 {
		t.Errorf("insert at middle: draft=%q cursor=%d", a.rename.input.Value(), a.rename.input.Cursor())
	}
}

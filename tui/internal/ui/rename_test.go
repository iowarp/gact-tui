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
	a.sessions = []gact.Session{{ID: "s1", Title: "original"}}
	a.selected = 0
	return a, &mu, &title
}

func TestRename_EKeyOpensWithPrefilledTitle(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if !a.renameOpen {
		t.Fatal("e should open rename modal")
	}
	if a.renameDraft != "original" {
		t.Errorf("draft = %q, want pre-fill", a.renameDraft)
	}
	if a.renameCursor != len("original") {
		t.Errorf("cursor = %d, want %d (end)", a.renameCursor, len("original"))
	}
}

func TestRename_EscCancelsWithoutPatch(t *testing.T) {
	a, mu, got := makeRenameApp(t)
	a.renameOpen = true
	a.renameDraft = "changed"
	a.renameCursor = len("changed")
	_, cmd := a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.renameOpen {
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
	a.renameOpen = true
	a.renameDraft = "refactor the auth middleware"
	a.renameCursor = len(a.renameDraft)
	_, cmd := a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.renameOpen {
		t.Error("Enter should close the modal")
	}
	if cmd == nil {
		t.Fatal("Enter should dispatch a PATCH cmd")
	}
	// Optimistic local update first — sidebar reflects the new title
	// before the PATCH completes.
	if a.sessions[0].Title != "refactor the auth middleware" {
		t.Errorf("optimistic title not applied: %q", a.sessions[0].Title)
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

func TestRename_EmptyInputCancels(t *testing.T) {
	a, mu, got := makeRenameApp(t)
	a.renameOpen = true
	a.renameDraft = "   " // whitespace-only
	a.renameCursor = 3
	_, cmd := a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyEnter})
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
	a.renameOpen = true
	a.renameDraft = "abc"
	a.renameCursor = 3

	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.renameDraft != "ab" || a.renameCursor != 2 {
		t.Errorf("after backspace: draft=%q cursor=%d, want 'ab' 2", a.renameDraft, a.renameCursor)
	}
	a.handleRenameKey(tea.KeyPressMsg{Code: 'X', Text: "X"})
	if a.renameDraft != "abX" || a.renameCursor != 3 {
		t.Errorf("after typing: draft=%q cursor=%d, want 'abX' 3", a.renameDraft, a.renameCursor)
	}
}

func TestRename_CursorMovementKeys(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.renameOpen = true
	a.renameDraft = "hello"
	a.renameCursor = 3

	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyLeft})
	if a.renameCursor != 2 {
		t.Errorf("← cursor = %d", a.renameCursor)
	}
	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.renameCursor != 3 {
		t.Errorf("→ cursor = %d", a.renameCursor)
	}
	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyHome})
	if a.renameCursor != 0 {
		t.Errorf("Home cursor = %d", a.renameCursor)
	}
	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyEnd})
	if a.renameCursor != 5 {
		t.Errorf("End cursor = %d", a.renameCursor)
	}
	// ← at column 0 clamps, doesn't underflow.
	a.renameCursor = 0
	a.handleRenameKey(tea.KeyPressMsg{Code: tea.KeyLeft})
	if a.renameCursor != 0 {
		t.Errorf("← at col 0 = %d", a.renameCursor)
	}
}

func TestRename_InsertInMiddle(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.renameOpen = true
	a.renameDraft = "hello"
	a.renameCursor = 2 // between "he" and "llo"

	a.handleRenameKey(tea.KeyPressMsg{Code: 'Z', Text: "Z"})
	if a.renameDraft != "heZllo" || a.renameCursor != 3 {
		t.Errorf("insert at middle: draft=%q cursor=%d", a.renameDraft, a.renameCursor)
	}
}

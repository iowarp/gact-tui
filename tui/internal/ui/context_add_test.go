package ui

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeContextAddApp builds an App focused on the sidebar with one
// session. Httptest server captures POST bodies to the context-files
// endpoint.
func makeContextAddApp(t *testing.T) (*App, *sync.Mutex, *string) {
	t.Helper()
	var (
		mu   sync.Mutex
		path string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/context/files") {
			buf, _ := io.ReadAll(r.Body)
			var body struct {
				Path string `json:"path"`
				Mode string `json:"mode"`
			}
			_ = json.Unmarshal(buf, &body)
			mu.Lock()
			path = body.Path
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{
				"path": body.Path, "mode": body.Mode,
			})
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "s1", Title: "x"}}
	a.selected = 0
	return a, &mu, &path
}

func TestContextAdd_OKeyOpensEmptyPrompt(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'o', Text: "o"})
	if !a.contextAddOpen {
		t.Fatal("o should open the add-context prompt")
	}
	if a.contextAddDraft != "" {
		t.Errorf("draft = %q, want empty", a.contextAddDraft)
	}
	if a.contextAddCursor != 0 {
		t.Errorf("cursor = %d, want 0", a.contextAddCursor)
	}
}

func TestContextAdd_OKeyNoSessionIsNoop(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.selected = -1
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'o', Text: "o"})
	if a.contextAddOpen {
		t.Error("o without a selected session should not open the modal")
	}
}

func TestContextAdd_EnterCommitsAndPOSTsPath(t *testing.T) {
	a, mu, got := makeContextAddApp(t)
	a.contextAddOpen = true
	a.contextAddDraft = "cmd/main.go"
	a.contextAddCursor = len("cmd/main.go")

	_, cmd := a.handleContextAddKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.contextAddOpen {
		t.Error("Enter should close the modal")
	}
	if cmd == nil {
		t.Fatal("Enter should dispatch addContextFileCmd")
	}
	msg := cmd()
	added, ok := msg.(contextFileAddedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want contextFileAddedMsg", msg)
	}
	if added.err != nil {
		t.Errorf("unexpected err: %v", added.err)
	}
	if added.file.Path != "cmd/main.go" {
		t.Errorf("file.Path = %q", added.file.Path)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "cmd/main.go" {
		t.Errorf("POST body path = %q, want 'cmd/main.go'", *got)
	}
}

func TestContextAddButtonsUseSemanticHitTargets(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAddOpen = true
	a.contextAddDraft = "docs/readme.md"
	a.contextAddCursor = len(a.contextAddDraft)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:context-add:save")
	if !ok {
		t.Fatal("missing context-add save button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.contextAddOpen {
		t.Fatal("save button should close context-add modal")
	}
	if cmd == nil {
		t.Fatal("save button should dispatch addContextFileCmd")
	}
}

func TestContextAdd_EmptyPathCancels(t *testing.T) {
	a, mu, got := makeContextAddApp(t)
	a.contextAddOpen = true
	a.contextAddDraft = "   "
	a.contextAddCursor = 3

	_, cmd := a.handleContextAddKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Error("whitespace-only Enter should not fire a POST")
	}
	if !strings.Contains(a.transientHint, "cancelled") {
		t.Errorf("hint = %q, want 'cancelled'", a.transientHint)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("POST shouldn't have fired, got path=%q", *got)
	}
}

func TestContextAdd_EscClosesWithoutPost(t *testing.T) {
	a, mu, got := makeContextAddApp(t)
	a.contextAddOpen = true
	a.contextAddDraft = "would-have-been-added"
	_, cmd := a.handleContextAddKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.contextAddOpen {
		t.Error("Esc should close the modal")
	}
	if cmd != nil {
		t.Error("Esc should not dispatch a cmd")
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "" {
		t.Errorf("POST shouldn't fire on Esc, got %q", *got)
	}
}

func TestContextAdd_TypingAppendsAndCursorMoves(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAddOpen = true
	a.handleContextAddKey(tea.KeyPressMsg{Code: 'a', Text: "a"})
	a.handleContextAddKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	if a.contextAddDraft != "ab" || a.contextAddCursor != 2 {
		t.Errorf("after typing: draft=%q cursor=%d", a.contextAddDraft, a.contextAddCursor)
	}
	a.handleContextAddKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.contextAddDraft != "a" || a.contextAddCursor != 1 {
		t.Errorf("after backspace: draft=%q cursor=%d", a.contextAddDraft, a.contextAddCursor)
	}
}

func TestContextAdd_SuccessMirrorsIntoSidebar(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	model, _ := a.Update(contextFileAddedMsg{
		sessionID: "s1",
		file:      gact.ContextFile{Path: "docs/README.md", Mode: "read"},
	})
	a = model.(*App)
	if len(a.contextFiles) != 1 || a.contextFiles[0].Path != "docs/README.md" {
		t.Errorf("contextFiles = %+v, want one entry with docs/README.md", a.contextFiles)
	}
	if !strings.Contains(a.transientHint, "docs/README.md") {
		t.Errorf("hint = %q, want it to mention the path", a.transientHint)
	}
}

func TestContextAdd_FailureShowsHintAndNoMirror(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	model, _ := a.Update(contextFileAddedMsg{
		sessionID: "s1",
		err:       errors.New("no such file"),
	})
	a = model.(*App)
	if len(a.contextFiles) != 0 {
		t.Errorf("failed add shouldn't mirror, got %+v", a.contextFiles)
	}
	if !strings.Contains(a.transientHint, "add failed") {
		t.Errorf("hint = %q, want 'add failed'", a.transientHint)
	}
}

func TestContextAdd_StaleResponseIgnored(t *testing.T) {
	// If the user switched sessions before the POST response landed,
	// the mirrored file would end up on the wrong session. Guard
	// against that by keying on sessionID.
	a, _, _ := makeContextAddApp(t)
	a.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.selected = 1 // user moved to s2

	model, _ := a.Update(contextFileAddedMsg{
		sessionID: "s1", // stale response for s1
		file:      gact.ContextFile{Path: "ignored.txt"},
	})
	a = model.(*App)
	if len(a.contextFiles) != 0 {
		t.Errorf("stale response should not mirror, got %+v", a.contextFiles)
	}
}

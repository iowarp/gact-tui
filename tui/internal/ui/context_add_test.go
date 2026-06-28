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
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
	a.session.sessions = []gact.Session{{ID: "s1", Title: "x"}}
	a.session.selected = 0
	return a, &mu, &path
}

func TestContextAdd_OKeyOpensEmptyPrompt(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'o', Text: "o"})
	if !a.contextAdd.open {
		t.Fatal("o should open the add-context prompt")
	}
	if a.contextAdd.input.Value() != "" {
		t.Errorf("draft = %q, want empty", a.contextAdd.input.Value())
	}
	if a.contextAdd.input.Cursor() != 0 {
		t.Errorf("cursor = %d, want 0", a.contextAdd.input.Cursor())
	}
}

func TestContextAdd_OKeyNoSessionIsNoop(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.session.selected = -1
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'o', Text: "o"})
	if a.contextAdd.open {
		t.Error("o without a selected session should not open the modal")
	}
}

func TestContextAddSlashCommandOpensAddContextModal(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.cmdPalette.commands = []gact.Command{{ID: "/add", Title: "Add file", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Workspace"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/add")

	model, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("/add should open the local context modal without backend command dispatch")
	}
	if !a.contextAdd.open || a.contextAdd.input.Value() != "" || a.contextAdd.input.Cursor() != 0 || a.contextAdd.mode != "read" {
		t.Fatalf("/add did not initialize context modal, open=%v draft=%q cursor=%d mode=%q", a.contextAdd.open, a.contextAdd.input.Value(), a.contextAdd.input.Cursor(), a.contextAdd.mode)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /add")
	}
}

func TestContextAddSlashCommandNoOpsWithoutActiveSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{{ID: "/add", Title: "Add file", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Workspace"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/add")

	model, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("/add no-session should schedule hint expiry")
	}
	if a.contextAdd.open {
		t.Fatal("/add without active session should not open context modal")
	}
	if a.transientHint != "no active session to add context" {
		t.Fatalf("/add no-session hint = %q", a.transientHint)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /add no-op")
	}
}

func TestContextDropSlashCommandNoOpsWithoutSelectedContextFile(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.cmdPalette.commands = []gact.Command{{ID: "/drop", Title: "Drop file", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Workspace"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/drop")

	model, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("/drop no-op should still schedule hint expiry")
	}
	if a.transientHint != "no context file selected to drop" {
		t.Fatalf("/drop no-op hint = %q", a.transientHint)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /drop no-op")
	}
}

func TestContextDropSlashCommandDispatchesSelectedContextFileRemoval(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}
	a.session.contextFileSel = 0
	a.cmdPalette.commands = []gact.Command{{ID: "/drop", Title: "Drop file", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Workspace"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/drop")

	model, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("/drop should dispatch selected context file removal")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /drop")
	}
}

func TestContextAdd_EnterCommitsAndPOSTsPath(t *testing.T) {
	a, mu, got := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("cmd/main.go")
	a.contextAdd.input.SetCursor(len("cmd/main.go"))

	_, cmd := a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if a.contextAdd.open {
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
	if added.file.Mode != "read" {
		t.Errorf("file.Mode = %q, want read", added.file.Mode)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != "cmd/main.go" {
		t.Errorf("POST body path = %q, want 'cmd/main.go'", *got)
	}
}

func TestContextAdd_TabCyclesModeAndPOSTsSelectedMode(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("docs/editable.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if got := a.contextAdd.modeValue(); got != "edit" {
		t.Fatalf("after Tab mode = %q, want edit", got)
	}
	a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if got := a.contextAdd.modeValue(); got != "pin" {
		t.Fatalf("after second Tab mode = %q, want pin", got)
	}

	_, cmd := a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter should dispatch addContextFileCmd")
	}
	msg := cmd()
	added, ok := msg.(contextFileAddedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want contextFileAddedMsg", msg)
	}
	if added.err != nil {
		t.Fatalf("unexpected err: %v", added.err)
	}
	if added.file.Mode != "pin" {
		t.Fatalf("posted mode = %q, want pin", added.file.Mode)
	}
}

func TestContextAdd_EmptyPathCancels(t *testing.T) {
	a, mu, got := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("   ")
	a.contextAdd.input.SetCursor(3)

	_, cmd := a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
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
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("would-have-been-added")
	_, cmd := a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.contextAdd.open {
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
	a.contextAdd.open = true
	a.contextAdd.handleKey(tea.KeyPressMsg{Code: 'a', Text: "a"})
	a.contextAdd.handleKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	if a.contextAdd.input.Value() != "ab" || a.contextAdd.input.Cursor() != 2 {
		t.Errorf("after typing: draft=%q cursor=%d", a.contextAdd.input.Value(), a.contextAdd.input.Cursor())
	}
	a.contextAdd.handleKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.contextAdd.input.Value() != "a" || a.contextAdd.input.Cursor() != 1 {
		t.Errorf("after backspace: draft=%q cursor=%d", a.contextAdd.input.Value(), a.contextAdd.input.Cursor())
	}
}

func TestContextAdd_SuccessMirrorsIntoSidebar(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	model, _ := a.Update(contextFileAddedMsg{
		sessionID: "s1",
		file:      gact.ContextFile{Path: "docs/README.md", Mode: "read"},
	})
	a = model.(*App)
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "docs/README.md" {
		t.Errorf("contextFiles = %+v, want one entry with docs/README.md", a.session.contextFiles)
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
	if len(a.session.contextFiles) != 0 {
		t.Errorf("failed add shouldn't mirror, got %+v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "add failed") {
		t.Errorf("hint = %q, want 'add failed'", a.transientHint)
	}
}

func TestContextAdd_FailureUsesStructuredOperatorError(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.session.contextFiles = []gact.ContextFile{{Path: "already.txt", Mode: "read"}}
	err := &client.Error{Status: 502, Code: "context_add_failed", Message: "context add failed: workspace file index is temporarily unavailable"}

	model, _ := a.Update(contextFileAddedMsg{sessionID: "s1", err: err})
	a = model.(*App)
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "already.txt" {
		t.Fatalf("failed add should preserve existing context files: %+v", a.session.contextFiles)
	}
	if a.transientHint != "add failed: workspace file index is temporarily unavailable" {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestContextAdd_StaleResponseIgnored(t *testing.T) {
	// If the user switched sessions before the POST response landed,
	// the mirrored file would end up on the wrong session. Guard
	// against that by keying on sessionID.
	a, _, _ := makeContextAddApp(t)
	a.session.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.session.selected = 1 // user moved to s2

	model, _ := a.Update(contextFileAddedMsg{
		sessionID: "s1", // stale response for s1
		file:      gact.ContextFile{Path: "ignored.txt"},
	})
	a = model.(*App)
	if len(a.session.contextFiles) != 0 {
		t.Errorf("stale response should not mirror, got %+v", a.session.contextFiles)
	}
}

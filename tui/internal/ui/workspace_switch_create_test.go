package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestWorkspaceCreateFormsExplainRootAndGitSemantics(t *testing.T) {
	a := makeSwitcherApp(t)

	a.workspace.openCreateMode("folder")
	out := stripANSI(a.workspace.viewCreate())
	for _, want := range []string{
		"Open workspace from Folder",
		"Open an existing local folder",
		"Use an absolute folder root",
		"Folder path:",
		"open",
		"Enter open",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("folder workspace form missing %q:\n%s", want, out)
		}
	}

	a.workspace.openCreateMode("git")
	out = stripANSI(a.workspace.viewCreate())
	for _, want := range []string{
		"Clone workspace from Git",
		"Clone a Git repository",
		"local clone folder is auto-filled",
		"Repository URL:",
		"Local clone folder:",
		"Workspace name:",
		"clone/open",
		"Enter clone/open",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("git workspace form missing %q:\n%s", want, out)
		}
	}
	for _, old := range []string{"Git repository:", "git repository:", "clone path:"} {
		if strings.Contains(out, old) {
			t.Fatalf("git workspace form should use operator-facing labels, found %q:\n%s", old, out)
		}
	}
}

func TestWorkspaceCreateSummaryHidesActiveField(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreateMode("git")
	a.workspace.create.gitURL = "git@github.com:iowarp/clio-agent.git"
	a.workspace.create.name = "clio-agent"
	a.workspace.create.root = "/tmp/clio-agent"

	a.workspace.create.field = 1
	a.workspace.switchOpen = true
	out := stripANSI(a.workspace.viewCreate())
	_ = a.View()
	if got := strings.Count(out, "Repository URL:"); got != 1 {
		t.Fatalf("active repository field should render once, got %d:\n%s", got, out)
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:name"); !ok {
		t.Fatal("inactive workspace name summary should remain clickable")
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:root"); !ok {
		t.Fatal("inactive clone folder summary should remain clickable")
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:git"); ok {
		t.Fatal("active repository editor should not duplicate a summary hit target")
	}
}

func TestWorkspaceCreateGitURLDerivesNameAndClonePath(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreateMode("git")
	a.workspace.create.gitURL = ""
	a.workspace.create.gitCur = 0

	a.workspace.insertCreateText("git@github.com:iowarp/clio-agent.git")

	if a.workspace.create.name != "clio-agent" {
		t.Fatalf("derived name = %q, want clio-agent", a.workspace.create.name)
	}
	// Compare OS-agnostically: the derived root is an OS-native path
	// (backslashes on Windows), so normalize before the suffix check.
	if !strings.HasSuffix(filepath.ToSlash(a.workspace.create.root), "/clio-agent") {
		t.Fatalf("derived root = %q, want suffix /clio-agent", a.workspace.create.root)
	}
}

func TestWorkspaceCreateGitURLDerivesAcrossCharacterTyping(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreateMode("git")
	a.workspace.create.gitURL = ""
	a.workspace.create.gitCur = 0

	for _, r := range "git@github.com:iowarp/clio-agent.git" {
		a.workspace.insertCreateText(string(r))
	}

	if a.workspace.create.name != "clio-agent" {
		t.Fatalf("character-typed derived name = %q, want clio-agent", a.workspace.create.name)
	}
	if !strings.HasSuffix(filepath.ToSlash(a.workspace.create.root), "/clio-agent") {
		t.Fatalf("character-typed derived root = %q, want suffix /clio-agent", a.workspace.create.root)
	}
}

func TestWorkspaceCreateGitURLDerivationDoesNotOverwriteManualFields(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreateMode("git")
	a.workspace.create.name = "custom-name"
	a.workspace.create.root = "/tmp/custom-root"
	a.workspace.create.gitURL = ""
	a.workspace.create.gitCur = 0

	a.workspace.insertCreateText("git@github.com:iowarp/clio-agent.git")

	if a.workspace.create.name != "custom-name" {
		t.Fatalf("manual name was overwritten: %q", a.workspace.create.name)
	}
	if a.workspace.create.root != "/tmp/custom-root" {
		t.Fatalf("manual root was overwritten: %q", a.workspace.create.root)
	}
}

func TestWorkspaceSwitcherNewButtonOpensCreateForm(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:workspace-switch:new-folder")
	if !ok {
		t.Fatal("missing semantic new-folder workspace button")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("new workspace button should not dispatch before form submit")
	}
	if !a.workspace.switchOpen || !a.workspace.create.open {
		t.Fatalf("new workspace should open create form, switch=%v create=%v", a.workspace.switchOpen, a.workspace.create.open)
	}
}

func TestWorkspaceCreateFormSwitchesFieldsByTabAndMouse(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreate()

	a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.workspace.create.field != 1 {
		t.Fatalf("Tab should move to root field, got %d", a.workspace.create.field)
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-create:field:name")
	if !ok {
		t.Fatal("missing name field hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("field click should not dispatch")
	}
	if a.workspace.create.field != 0 {
		t.Fatalf("name field click should select field 0, got %d", a.workspace.create.field)
	}
}

func TestWorkspaceCreateRequiresRootPath(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreate()
	a.workspace.create.root = ""
	a.workspace.create.rootCur = 0

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("empty root should not dispatch create command")
	}
	if !strings.Contains(a.workspace.create.error, "root path is required") {
		t.Fatalf("workspaceCreateError = %q", a.workspace.create.error)
	}
	if a.workspace.create.field != 1 {
		t.Fatalf("empty root should focus root field, got %d", a.workspace.create.field)
	}
}

func TestWorkspaceCreateSuccessSwitchesAndClearsScopedState(t *testing.T) {
	created := gact.Workspace{ID: "ws_new", Name: "new", RootPath: "/tmp/new"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/workspaces":
			var req map[string]any
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode create workspace: %v", err)
			}
			if req["name"] != "new" || req["root_path"] != "/tmp/new" {
				t.Fatalf("workspace create body = %#v", req)
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(created)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions":
			if got := r.URL.Query().Get("workspace_id"); got != "ws_new" {
				t.Fatalf("sessions workspace_id = %q", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sessions": []gact.Session{{ID: "s_new", Title: "fresh"}}})
		default:
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.session.workspaces = []gact.Workspace{{ID: "ws_old", Name: "old", RootPath: "/tmp/old"}}
	a.session.wsID = "ws_old"
	a.session.sessions = []gact.Session{{ID: "s_old", Title: "old"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{ID: "m_old"}}
	a.session.contextFiles = []gact.ContextFile{{Path: "old.txt"}}
	a.fileViewer.fileViewerRoot = "/tmp/old"
	a.workspace.openCreate()
	a.workspace.create.name = "new"
	a.workspace.create.nameCur = 3
	a.workspace.create.root = "/tmp/new"
	a.workspace.create.rootCur = len("/tmp/new")

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("create should dispatch command")
	}
	msg := cmd()
	createdMsg, ok := msg.(workspaceCreatedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want workspaceCreatedMsg", msg)
	}
	model, cmd := a.Update(createdMsg)
	a = model.(*App)
	if a.session.wsID != "ws_new" {
		t.Fatalf("wsID = %q, want ws_new", a.session.wsID)
	}
	if a.workspace.switchOpen || a.workspace.create.open {
		t.Fatalf("create success should close modals, switch=%v create=%v", a.workspace.switchOpen, a.workspace.create.open)
	}
	if len(a.session.sessions) != 0 || len(a.conversation.messages) != 0 || len(a.session.contextFiles) != 0 || a.session.selected != -1 {
		t.Fatalf("scoped state not cleared: sessions=%d messages=%d context=%d selected=%d", len(a.session.sessions), len(a.conversation.messages), len(a.session.contextFiles), a.session.selected)
	}
	// fileViewerRoot is localized to an OS-native absolute path (a drive
	// letter is prefixed on Windows), so match the trailing segment.
	if !strings.HasSuffix(filepath.ToSlash(a.fileViewer.fileViewerRoot), "/tmp/new") {
		t.Fatalf("fileViewerRoot = %q, want suffix /tmp/new", a.fileViewer.fileViewerRoot)
	}
	if cmd == nil {
		t.Fatal("create success should reload sessions for new workspace")
	}

	reloadMsg := cmd()
	switched, ok := reloadMsg.(workspaceSwitchedMsg)
	if !ok {
		t.Fatalf("reload cmd returned %T, want workspaceSwitchedMsg", reloadMsg)
	}
	if switched.wsID != "ws_new" || len(switched.sessions) != 1 {
		t.Fatalf("workspace switched msg = %+v", switched)
	}
}

func TestWorkspaceCreateFailureStaysOpenAndShowsError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreate()
	a.workspace.create.saving = true

	model, cmd := a.Update(workspaceCreatedMsg{err: &client.Error{
		Status:  400,
		Code:    "invalid_workspace_root",
		Message: "workspace root must be an absolute local path",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("create failure should not dispatch follow-up command")
	}
	if !a.workspace.switchOpen || !a.workspace.create.open {
		t.Fatalf("create failure should keep form open, switch=%v create=%v", a.workspace.switchOpen, a.workspace.create.open)
	}
	if a.workspace.create.saving {
		t.Fatal("create failure should clear saving flag")
	}
	if !strings.Contains(a.workspace.create.error, "workspace root must be an absolute local path") {
		t.Fatalf("workspaceCreateError = %q", a.workspace.create.error)
	}
	if strings.Contains(a.workspace.create.error, "gact:") || strings.Contains(a.workspace.create.error, "invalid_workspace_root") {
		t.Fatalf("workspaceCreateError leaked backend wrapper: %q", a.workspace.create.error)
	}
}

func TestWorkspaceCreateGitCloneFailureStaysOpenAndShowsOperatorError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.openCreateMode("git")
	a.workspace.create.saving = true

	model, cmd := a.Update(workspaceCreatedMsg{err: workspaceCloneError{
		message: "fatal: repository 'https://example.invalid/missing.git/' not found",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clone failure should not dispatch follow-up command")
	}
	if !a.workspace.switchOpen || !a.workspace.create.open {
		t.Fatalf("clone failure should keep git form open, switch=%v create=%v", a.workspace.switchOpen, a.workspace.create.open)
	}
	if a.workspace.create.saving {
		t.Fatal("clone failure should clear saving flag")
	}
	if !strings.Contains(a.workspace.create.error, "Git clone failed: fatal: repository") {
		t.Fatalf("workspaceCreateError = %q", a.workspace.create.error)
	}
	if strings.Contains(a.workspace.create.error, "exit status") {
		t.Fatalf("workspaceCreateError leaked process wrapper: %q", a.workspace.create.error)
	}
}

func TestGitCloneFailureMessageFiltersWrapperNoise(t *testing.T) {
	msg := gitCloneFailureMessage(
		errors.New("exit status 128"),
		"Cloning into '/tmp/missing'...\nfatal: repository 'https://example.invalid/missing.git/' not found\n",
	)
	if msg != "fatal: repository 'https://example.invalid/missing.git/' not found" {
		t.Fatalf("clone failure message = %q", msg)
	}
}

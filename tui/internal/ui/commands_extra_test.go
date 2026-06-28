package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestOpenWorkspaceDiffShowsCleanRepoDetail(t *testing.T) {
	repo := initTempGitRepo(t)
	restore := chdirForTest(t, repo)
	defer restore()

	a := newReadyApp(nil, nil)
	toast := a.workspace.openWorkspaceDiff()
	if toast != "workspace clean" {
		t.Fatalf("toast = %q", toast)
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("clean diff should open detail view")
	}
	if a.detail.ref.title != "Workspace diff · clean" {
		t.Fatalf("detail title = %q", a.detail.ref.title)
	}
	if !strings.Contains(a.detail.ref.fullText, "No unstaged workspace changes.") {
		t.Fatalf("detail body missing clean state:\n%s", a.detail.ref.fullText)
	}
}

func TestOpenWorkspaceDiffShowsPatchInDetail(t *testing.T) {
	repo := initTempGitRepo(t)
	writeFile(t, filepath.Join(repo, "notes.txt"), "before\n")
	runGit(t, repo, "add", "notes.txt")
	writeFile(t, filepath.Join(repo, "notes.txt"), "after\n")
	restore := chdirForTest(t, repo)
	defer restore()

	a := newReadyApp(nil, nil)
	toast := a.workspace.openWorkspaceDiff()
	if !strings.Contains(toast, "workspace diff:") {
		t.Fatalf("toast = %q", toast)
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("dirty diff should open detail view")
	}
	for _, want := range []string{"Summary", "notes.txt", "Patch", "-before", "+after"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("detail body missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

func TestDiffSlashCmdOpensWorkspaceDiffDetail(t *testing.T) {
	repo := initTempGitRepo(t)
	restore := chdirForTest(t, repo)
	defer restore()

	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/diff", Title: "Show workspace changes", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Workspace"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/diff")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("/diff should schedule hint expiry")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /diff")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("/diff should open workspace diff detail")
	}
}

func initTempGitRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	repo := t.TempDir()
	runGit(t, repo, "init", "-q")
	return repo
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, string(out))
	}
}

func writeFile(t *testing.T, path string, text string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func chdirForTest(t *testing.T, dir string) func() {
	t.Helper()
	old, err := os.Getwd()
	if err != nil {
		t.Fatalf("get cwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir %s: %v", dir, err)
	}
	return func() {
		if err := os.Chdir(old); err != nil {
			t.Fatalf("restore cwd: %v", err)
		}
	}
}

func TestRequestCompactCmdUsesSessionSummarizeEndpoint(t *testing.T) {
	var sawSummarize bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions/s1/compact" {
			t.Fatalf("requestCompactCmd should not call stale compact endpoint")
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/summarize":
			sawSummarize = true
			var req map[string]any
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode summarize request: %v", err)
			}
			if req["auto"] != true {
				t.Fatalf("summarize auto = %#v, want true", req["auto"])
			}
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1":
			_ = json.NewEncoder(w).Encode(gact.Session{
				ID:      "s1",
				Title:   "demo",
				Summary: "Retained the important tool evidence.",
			})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "s1")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err != nil || got.session.ID != "s1" || got.session.Summary == "" {
		t.Fatalf("summary message = %#v", got)
	}
	if !sawSummarize {
		t.Fatal("summarize endpoint was not called")
	}
}

func TestRequestCompactCmdSurfacesSummarizeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "missing session", http.StatusNotFound)
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "missing")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err == nil {
		t.Fatalf("summary message should carry backend error: %#v", got)
	}
}

func TestRequestCompactCmdSurfacesRefreshError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/summarize":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1":
			http.Error(w, "refresh failed", http.StatusBadGateway)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "s1")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err == nil {
		t.Fatalf("summary message should carry refresh error: %#v", got)
	}
}

func TestSessionSummarizedMsgUpdatesSessionAndHint(t *testing.T) {
	a := &App{
		c: client.New("http://example.test"),
		session: sessionComponent{appSessionState: appSessionState{
			sessions: []gact.Session{{ID: "s1", Title: "demo"}, {ID: "s2", Title: "other"}},
			selected: 0,
			wsID:     "ws_1",
		}},
	}
	model, cmd := a.Update(sessionSummarizedMsg{
		sessionID: "s1",
		session: gact.Session{
			ID:      "s1",
			Title:   "demo",
			Summary: "Retained NDP search and plotting evidence for the next turn.",
		},
	})
	a = model.(*App)
	if a.session.sessions[a.session.selected].Summary == "" {
		t.Fatalf("selected session summary was not updated: %#v", a.session.sessions)
	}
	if !strings.Contains(a.transientHint, "Retained NDP search") {
		t.Fatalf("hint = %q, want returned summary", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("summary completion should schedule hint expiry and session reload")
	}
}

func TestSelectedSessionSummaryRendersInSidebar(t *testing.T) {
	a := makeSidebarApp(t, 4)
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle, Summary: "This should not render while unselected."},
	}
	a.session.selected = 0

	if rows := a.sidebar.sessionRowCount(0); rows != 3 {
		t.Fatalf("selected parent with summary rows = %d, want 3", rows)
	}
	if rows := a.sidebar.sessionRowCount(1); rows != 2 {
		t.Fatalf("unselected parent rows = %d, want 2", rows)
	}
	out := ansi.Strip(a.sidebar.render(56, 18))
	if !strings.Contains(out, "summary: Retained NDP and plot evidence") {
		t.Fatalf("selected summary missing from sidebar:\n%s", out)
	}
	if strings.Contains(out, "This should not render") {
		t.Fatalf("unselected summary leaked into sidebar:\n%s", out)
	}
}

func TestSelectedSessionSummaryRowOpensDetail(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:s1:summary")
	if !ok {
		t.Fatal("missing selected session summary hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("summary detail click should not dispatch backend command")
	}
	if a.focus != FocusSidebar || a.sidebar.sectionFocus != sidebarSectionSessions || a.sidebar.sectionCursor {
		t.Fatalf("summary click focus = %v section=%v cursor=%v, want sidebar session row", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("summary click should open detail view")
	}
	for _, want := range []string{"Session Summary", "session: s1", "title: demo", "summary:", "Retained NDP and plot evidence"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("summary detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
	for _, raw := range []string{"session_id:", "updated_at:"} {
		if strings.Contains(a.detail.ref.fullText, raw) {
			t.Fatalf("summary detail should avoid raw label %q:\n%s", raw, a.detail.ref.fullText)
		}
	}
}

func TestRightSidebarSessionSummaryRowOpensDetail(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.MouseEnabled = true
	a.width = 150
	a.height = 36
	a.session.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle},
	}
	a.session.selected = 0
	a.sidebar.SetLayout([]string{"context"}, []string{"sessions"})

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:right-s1:summary")
	if !ok {
		t.Fatal("missing right sidebar selected session summary hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right summary detail click should not dispatch backend command")
	}
	if a.focus != FocusRightSidebar || a.sidebar.sectionFocus != sidebarSectionSessions || a.sidebar.sectionCursor {
		t.Fatalf("right summary click focus = %v section=%v cursor=%v, want right sidebar session row", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	if !a.detail.visible || a.detail.ref == nil || !strings.Contains(a.detail.ref.fullText, "Retained NDP and plot evidence") {
		t.Fatalf("right summary click should open detail, open=%v detail=%#v", a.detail.visible, a.detail.ref)
	}
	if strings.Contains(a.detail.ref.fullText, "session_id:") {
		t.Fatalf("right summary detail should avoid raw session id label:\n%s", a.detail.ref.fullText)
	}
}

func TestSessionSummarizedMsgFailureSurfacesError(t *testing.T) {
	a := &App{}
	model, cmd := a.Update(sessionSummarizedMsg{sessionID: "s1", err: errors.New("backend unavailable")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "summary failed: backend unavailable") {
		t.Fatalf("hint = %q, want backend error", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should schedule hint expiry")
	}
}

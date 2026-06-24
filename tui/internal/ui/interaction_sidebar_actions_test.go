package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestSidebarFooterActionsUseSemanticHitTargets(t *testing.T) {
	newApp := func() *App {
		a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
		a.width = 260
		a.height = 34
		a.stage = StageReady
		a.focus = FocusSidebar
		a.session.wsID = "ws_default"
		a.session.sessions = []gact.Session{
			{ID: "sess_1", Title: "demo session", Status: gact.StatusIdle},
		}
		a.session.selected = 0
		return a
	}
	click := func(t *testing.T, a *App, id string) (*App, tea.Cmd) {
		t.Helper()
		_ = a.View()
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing visible semantic target %q", id)
		}
		model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		return model.(*App), cmd
	}

	a, cmd := click(t, newApp(), "footer:sidebar:rename")
	if cmd != nil {
		t.Fatal("rename footer click should not dispatch a command")
	}
	if !a.rename.open || a.rename.input.Value() != "demo session" {
		t.Fatalf("rename footer click should open rename prompt, open=%v draft=%q", a.rename.open, a.rename.input.Value())
	}

	a, cmd = click(t, newApp(), "footer:sidebar:context")
	if cmd != nil {
		t.Fatal("add-context footer click should not dispatch a command")
	}
	if !a.contextAdd.open {
		t.Fatal("add-context footer click should open context prompt")
	}

	a, cmd = click(t, newApp(), "footer:sidebar:delete")
	if cmd != nil {
		t.Fatal("first delete footer click should only arm deletion")
	}
	if a.sidebar.pendingDeleteSessionID != "sess_1" {
		t.Fatalf("delete footer click should arm selected session, got %q", a.sidebar.pendingDeleteSessionID)
	}

	a, cmd = click(t, newApp(), "footer:sidebar:children")
	if cmd != nil {
		t.Fatal("children footer click should not dispatch a command")
	}
	if !a.sidebar.showChildSessions {
		t.Fatal("children footer click should toggle child session visibility")
	}

	a, cmd = click(t, newApp(), "footer:sidebar:archive")
	if cmd == nil {
		t.Fatal("archive footer click should dispatch archive command")
	}

	mu, copied, _ := withClipboardSpy(t)
	a, cmd = click(t, newApp(), "footer:sidebar:copy-id")
	if cmd != nil {
		t.Fatal("copy-id footer click should not dispatch a command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "sess_1" {
		t.Fatalf("copy-id footer click wrote %q, want sess_1", gotCopy)
	}
}

func TestSidebarSessionRightClickOpensSemanticActionMenu(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 260
	a.height = 34
	a.stage = StageReady
	a.focus = FocusSidebar
	a.MouseEnabled = true
	a.session.wsID = "ws_default"
	a.session.sessions = []gact.Session{
		{ID: "sess_1", Title: "alpha", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "beta", Status: gact.StatusIdle},
	}
	a.session.selected = 0

	_ = a.View()
	rowTarget, ok := findHitTargetForTest(a, "sidebar:session:sess_2")
	if !ok {
		t.Fatal("missing semantic sidebar session row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rowTarget.rect.x,
		Y:      rowTarget.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if !a.session.actions.open || a.session.selected != 1 {
		t.Fatalf("right-click should select row and open actions, open=%v selected=%d", a.session.actions.open, a.session.selected)
	}
	if cmd == nil {
		t.Fatal("right-clicking a different session should dispatch selection load")
	}

	_ = a.View()
	renameTarget, ok := findHitTargetForTest(a, "session-actions:rename")
	if !ok {
		t.Fatal("missing semantic session action row target")
	}
	if renameTarget.rect.h != 1 {
		t.Fatalf("session action target height = %d, want dense one-line row", renameTarget.rect.h)
	}
	out := ansi.Strip(a.session.viewActions())
	if !strings.Contains(out, "Rename session  [e]  Edit the visible title.") {
		t.Fatalf("session action menu should render descriptions inline:\n%s", out)
	}
	for _, want := range []string{
		"Copy session ID  [y]  Copy this session's identifier for logs or support.",
		"Delete session  [x]  Ask for confirmation before deleting this session.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("session action menu missing operator copy %q:\n%s", want, out)
		}
	}
	for _, stale := range []string{"stable sess_ id", "Two-step destructive action"} {
		if strings.Contains(out, stale) {
			t.Fatalf("session action menu leaked stale implementation copy %q:\n%s", stale, out)
		}
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      renameTarget.rect.x,
		Y:      renameTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("rename action should not dispatch a backend command")
	}
	if a.session.actions.open || !a.rename.open || a.rename.input.Value() != "beta" {
		t.Fatalf("rename action should close menu and open rename, actionsOpen=%v renameOpen=%v draft=%q", a.session.actions.open, a.rename.open, a.rename.input.Value())
	}
}

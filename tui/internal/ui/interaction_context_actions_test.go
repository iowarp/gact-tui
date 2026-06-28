package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestContextRowRightClickOpensSemanticActionMenu(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo"}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{
		Path:     "docs/ARC_MEMORY_LAYER.md",
		Mode:     "read",
		Size:     2048,
		Language: "markdown",
	}}

	_ = a.View()
	rowTarget, ok := findHitTargetForTest(a, "sidebar:context:file:docs/ARC_MEMORY_LAYER.md")
	if !ok {
		t.Fatal("missing semantic context file row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rowTarget.rect.x,
		Y:      rowTarget.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("context action menu open should not dispatch a command")
	}
	if !a.contextActions.open || a.session.contextFileSel != 0 || a.sidebar.sectionFocus != sidebarSectionContext || a.sidebar.sectionCursor {
		t.Fatalf("right-click should select context row and open actions, open=%v sel=%d section=%v cursor=%v", a.contextActions.open, a.session.contextFileSel, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
	out := ansi.Strip(a.contextActions.view())
	for _, want := range []string{
		"Open detail  [Enter]  Review file details and how it is attached.",
		"Copy path  [y]  Copy the path as shown in this workspace.",
		"Copy metadata  [Y]  Copy file details for notes or support.",
		"Remove from context  [x]  Stop including this file in the selected session.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("context action menu missing operator copy %q:\n%s", want, out)
		}
	}
	for _, stale := range []string{"provenance metadata", "workspace-relative", "structured context detail", "Detach this file"} {
		if strings.Contains(out, stale) {
			t.Fatalf("context action menu leaked stale implementation copy %q:\n%s", stale, out)
		}
	}

	mu, copied, _ := withClipboardSpy(t)
	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "context-actions:copy-path")
	if !ok {
		t.Fatal("missing context copy-path action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-path action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "docs/ARC_MEMORY_LAYER.md" {
		t.Fatalf("copy-path wrote %q", gotCopy)
	}
	if a.contextActions.open || !strings.Contains(a.transientHint, "copied docs/ARC_MEMORY_LAYER.md") {
		t.Fatalf("copy-path should close menu and surface hint, open=%v hint=%q", a.contextActions.open, a.transientHint)
	}

	_ = a.contextActions.openModal(0)
	_ = a.View()
	copyDetailTarget, ok := findHitTargetForTest(a, "context-actions:copy-detail")
	if !ok {
		t.Fatal("missing context copy-detail action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyDetailTarget.rect.x,
		Y:      copyDetailTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-detail action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy = *copied
	mu.Unlock()
	for _, want := range []string{"path: docs/ARC_MEMORY_LAYER.md", "mode: read", "size: 2.0 KiB (2048 bytes)", "language: markdown"} {
		if !strings.Contains(gotCopy, want) {
			t.Fatalf("copy-detail missing %q:\n%s", want, gotCopy)
		}
	}
	if a.contextActions.open || !strings.Contains(a.transientHint, "copied context metadata") {
		t.Fatalf("copy-detail should close menu and surface hint, open=%v hint=%q", a.contextActions.open, a.transientHint)
	}

	_ = a.contextActions.openModal(0)
	_ = a.View()
	removeTarget, ok := findHitTargetForTest(a, "context-actions:remove")
	if !ok {
		t.Fatal("missing context remove action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      removeTarget.rect.x,
		Y:      removeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("remove action should dispatch backend command")
	}
	if a.contextActions.open {
		t.Fatal("remove action should close context action menu")
	}
}

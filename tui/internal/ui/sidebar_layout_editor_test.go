package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestSidebarLayoutEditorMovesModulesBetweenColumns(t *testing.T) {
	a := New("http://unused")
	a.sidebar.openLayoutEditor()

	a.sidebarLayout.col = sidebarLayoutColumnLeft
	a.sidebarLayout.sel[sidebarLayoutColumnLeft] = 1 // context
	a.sidebar.transferLayoutModule(1)
	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("after moving context to available left=%#v right=%#v", left, right)
	}
	if got := a.sidebar.ModulePlacement("context"); got != "hidden" {
		t.Fatalf("context placement = %q, want hidden", got)
	}

	a.sidebar.transferLayoutModule(1)
	left, right = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("after moving context right left=%#v right=%#v", left, right)
	}
}

func TestSidebarLayoutEditorAvailableModulesUseStableOrder(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.sidebar.openLayoutEditor()

	var got []sidebarModuleID
	for _, column := range a.sidebar.layoutColumns() {
		if column.id == sidebarLayoutColumnAvailable {
			got = column.modules
			break
		}
	}
	want := []sidebarModuleID{sidebarModuleContext, sidebarModuleAgents, sidebarModuleFiles}
	if len(got) != len(want) {
		t.Fatalf("available modules = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("available modules = %#v, want %#v", got, want)
		}
	}
}

func TestSidebarLayoutEditorReordersVisibleColumn(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions", "context"}, nil)
	a.sidebar.openLayoutEditor()
	a.sidebarLayout.col = sidebarLayoutColumnLeft
	a.sidebarLayout.sel[sidebarLayoutColumnLeft] = 1

	a.sidebar.reorderLayoutModule(-1)
	left, _ := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context,sessions" {
		t.Fatalf("left order = %#v, want context,sessions", left)
	}
}

func TestSidebarLayoutEditorArrowKeysMoveModulesWithoutGrab(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions", "context"}, nil)
	a.sidebar.openLayoutEditor()
	a.sidebarLayout.col = sidebarLayoutColumnLeft
	a.sidebarLayout.sel[sidebarLayoutColumnLeft] = 1

	model, _ := a.sidebar.handleLayoutKey(tea.KeyPressMsg{Code: tea.KeyUp})
	a = model.(*App)
	left, _ := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context,sessions" {
		t.Fatalf("up arrow should reorder selected module without grab, left=%#v", left)
	}
	if a.sidebarLayout.sel[sidebarLayoutColumnLeft] != 0 {
		t.Fatalf("selection should follow moved module, got %d", a.sidebarLayout.sel[sidebarLayoutColumnLeft])
	}

	model, _ = a.sidebar.handleLayoutKey(tea.KeyPressMsg{Code: tea.KeyDown})
	a = model.(*App)
	left, _ = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions,context" {
		t.Fatalf("down arrow should reorder selected module without grab, left=%#v", left)
	}
}

func TestSidebarLayoutEditorTabChangesColumnsAndArrowsTransferModules(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions", "context"}, nil)
	a.sidebar.openLayoutEditor()
	a.sidebarLayout.col = sidebarLayoutColumnLeft
	a.sidebarLayout.sel[sidebarLayoutColumnLeft] = 0

	model, _ := a.sidebar.handleLayoutKey(tea.KeyPressMsg{Code: tea.KeyTab})
	a = model.(*App)
	if a.sidebarLayout.col != sidebarLayoutColumnAvailable {
		t.Fatalf("Tab should focus available column, got %d", a.sidebarLayout.col)
	}

	a.sidebarLayout.col = sidebarLayoutColumnLeft
	model, _ = a.sidebar.handleLayoutKey(tea.KeyPressMsg{Code: tea.KeyRight})
	a = model.(*App)
	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context" || len(right) != 0 {
		t.Fatalf("right arrow should move sessions to available, left=%#v right=%#v", left, right)
	}
	if got := a.sidebar.ModulePlacement("sessions"); got != "hidden" {
		t.Fatalf("sessions placement = %q, want hidden", got)
	}

	model, _ = a.sidebar.handleLayoutKey(tea.KeyPressMsg{Code: tea.KeyRight})
	a = model.(*App)
	left, right = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context" || strings.Join(right, ",") != "sessions" {
		t.Fatalf("second right arrow should move sessions to right, left=%#v right=%#v", left, right)
	}
}

func TestSidebarLayoutEditorHidesEmptyColumns(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.sidebar.SetLayout([]string{"sessions", "context"}, nil)
	a.sidebar.openLayoutEditor()

	out := ansi.Strip(a.sidebar.viewLayoutEditor())
	if !strings.Contains(out, "Left") {
		t.Fatalf("layout editor should render left column:\n%s", out)
	}
	if !strings.Contains(out, "Available") {
		t.Fatalf("hidden files module should render as available:\n%s", out)
	}
	if !strings.Contains(out, "shown on left") {
		t.Fatalf("placed modules should explain sidebar placement:\n%s", out)
	}
	if !strings.Contains(out, "hidden; not shown") {
		t.Fatalf("available modules should explain they are hidden:\n%s", out)
	}
	if strings.Contains(out, "Right") {
		t.Fatalf("empty right column should not render:\n%s", out)
	}
	if !strings.Contains(out, "Tab column") || !strings.Contains(out, "arrows/buttons move module") {
		t.Fatalf("layout editor should explain direct arrow/module controls:\n%s", out)
	}
}

func TestSidebarLayoutEditorExplainsUnknownConfiguredModules(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.sidebar.SetLayout([]string{"sessions", "future-module"}, []string{"context"})
	a.sidebar.openLayoutEditor()

	out := ansi.Strip(a.sidebar.viewLayoutEditor())
	if !strings.Contains(out, "future-module") {
		t.Fatalf("unknown configured module should remain visible:\n%s", out)
	}
	if !strings.Contains(out, "unknown id") {
		t.Fatalf("unknown configured module should explain why it is inactive:\n%s", out)
	}
	if !strings.Contains(out, "shown on right") {
		t.Fatalf("right column modules should explain sidebar placement:\n%s", out)
	}
}

func TestSidebarLayoutEditorMouseSelectsModuleRows(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.sidebar.openLayoutEditor()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar-layout:left:context")
	if !ok {
		t.Fatal("missing sidebar layout context hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.sidebarLayout.col != sidebarLayoutColumnLeft || a.sidebarLayout.sel[sidebarLayoutColumnLeft] != 1 {
		t.Fatalf("layout editor mouse selection col=%d sel=%d, want left row 1", a.sidebarLayout.col, a.sidebarLayout.sel[sidebarLayoutColumnLeft])
	}
}

func TestSidebarLayoutEditorMouseButtonsMoveSelectedModule(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.sidebar.SetLayout([]string{"sessions", "context"}, nil)
	a.sidebar.openLayoutEditor()
	a.sidebarLayout.col = sidebarLayoutColumnLeft
	a.sidebarLayout.sel[sidebarLayoutColumnLeft] = 1

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:sidebar-layout:down"); ok {
		t.Fatal("down button should be disabled for the last left module")
	}
	up, ok := findHitTargetForTest(a, "button:sidebar-layout:up")
	if !ok {
		t.Fatal("missing sidebar layout up button")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: up.rect.x, Y: up.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context,sessions" || len(right) != 0 {
		t.Fatalf("up button should reorder left modules, left=%#v right=%#v", left, right)
	}
	if a.sidebarLayout.sel[sidebarLayoutColumnLeft] != 0 {
		t.Fatalf("selection should follow reordered module, got %d", a.sidebarLayout.sel[sidebarLayoutColumnLeft])
	}

	_ = a.View()
	moveRight, ok := findHitTargetForTest(a, "button:sidebar-layout:right")
	if !ok {
		t.Fatal("missing sidebar layout right button")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: moveRight.rect.x, Y: moveRight.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	left, right = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("first right button should move context to available, left=%#v right=%#v", left, right)
	}
	if got := a.sidebarLayout.col; got != sidebarLayoutColumnAvailable {
		t.Fatalf("after first right click column = %d, want available", got)
	}

	_ = a.View()
	moveRight, ok = findHitTargetForTest(a, "button:sidebar-layout:right")
	if !ok {
		t.Fatal("missing second sidebar layout right button")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: moveRight.rect.x, Y: moveRight.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	left, right = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("second right button should move context to right, left=%#v right=%#v", left, right)
	}
	if got := a.sidebarLayout.col; got != sidebarLayoutColumnRight {
		t.Fatalf("after second right click column = %d, want right", got)
	}
}

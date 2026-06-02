package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestResolveSidebarModulesDefaultsToSessionsAndContext(t *testing.T) {
	got := resolveSidebarModules(nil, sidebarModuleRegistry())
	if len(got) != 2 {
		t.Fatalf("modules len = %d, want 2", len(got))
	}
	if got[0].Definition.ID != sidebarModuleSessions || got[1].Definition.ID != sidebarModuleContext {
		t.Fatalf("modules = %#v, want sessions then context", got)
	}
	if got[0].Definition.DefaultPlacement != sidebarPlacementLeft || got[1].Definition.DefaultPlacement != sidebarPlacementLeft {
		t.Fatalf("default placement should be left: %#v", got)
	}
}

func TestResolveSidebarModulesKeepsUnknownModulesDisabled(t *testing.T) {
	got := resolveSidebarModules([]sidebarModuleID{sidebarModuleSessions, "future-tools"}, sidebarModuleRegistry())
	if len(got) != 2 {
		t.Fatalf("modules len = %d, want 2", len(got))
	}
	if got[1].Definition.ID != "future-tools" {
		t.Fatalf("unknown module id = %q", got[1].Definition.ID)
	}
	if !got[1].Disabled || got[1].Reason == "" {
		t.Fatalf("unknown module should be disabled with a reason: %#v", got[1])
	}
}

func TestSetSidebarModuleIDsNormalizesConfigIDs(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarModuleIDs([]string{" context ", "", "sessions", "context", "future-tools"})

	got := a.SidebarModuleIDs()
	want := []string{"context", "sessions", "future-tools"}
	if len(got) != len(want) {
		t.Fatalf("module ids = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("module ids = %#v, want %#v", got, want)
		}
	}
}

func TestSetSidebarLayoutStoresRightModulesWithoutDefaults(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout([]string{"sessions"}, []string{"context", "future-tools"})

	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" {
		t.Fatalf("left layout = %#v, want sessions", left)
	}
	if strings.Join(right, ",") != "context,future-tools" {
		t.Fatalf("right layout = %#v, want context,future-tools", right)
	}
}

func TestSetSidebarLayoutRightPlacementRemovesLeftDuplicate(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout([]string{"sessions", "context"}, []string{"context"})

	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("layout left=%#v right=%#v, want sessions/context without duplicate", left, right)
	}
}

func TestSetSidebarLayoutCanRepresentEmptyLeftColumn(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout(nil, []string{"context"})

	left, right := a.SidebarLayoutIDs()
	if len(left) != 0 || strings.Join(right, ",") != "context" {
		t.Fatalf("layout left=%#v right=%#v, want empty/context", left, right)
	}
	if len(a.sidebarModules()) != 0 {
		t.Fatalf("explicit empty left should not fall back to defaults: %#v", a.sidebarModules())
	}
}

func TestSetSidebarModulePlacementMovesContextBetweenBars(t *testing.T) {
	a := New("http://unused")
	if got := a.SidebarModulePlacement("context"); got != "left" {
		t.Fatalf("default context placement = %q, want left", got)
	}

	a.SetSidebarModulePlacement("context", "right")
	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("right placement left=%#v right=%#v, want sessions/context", left, right)
	}

	a.SetSidebarModulePlacement("context", "hidden")
	left, right = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("hidden placement left=%#v right=%#v, want sessions/no right", left, right)
	}
	if got := a.SidebarModulePlacement("context"); got != "hidden" {
		t.Fatalf("context placement = %q, want hidden", got)
	}
}

func TestSidebarModuleIDsReturnDefaultOrder(t *testing.T) {
	a := New("http://unused")
	got := a.SidebarModuleIDs()
	want := []string{"sessions", "context"}
	if len(got) != len(want) {
		t.Fatalf("module ids = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("module ids = %#v, want %#v", got, want)
		}
	}
}

func TestRightSidebarWidthIsOptionalAndResponsive(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	if got := a.rightSidebarWidth(30); got != 0 {
		t.Fatalf("right sidebar should be disabled without right modules, got %d", got)
	}

	a.SetSidebarLayout([]string{"sessions"}, []string{"context"})
	if got := a.rightSidebarWidth(30); got <= 0 {
		t.Fatalf("right sidebar should be enabled with right modules on wide screens, got %d", got)
	}

	a.width = 80
	if got := a.rightSidebarWidth(26); got != 0 {
		t.Fatalf("right sidebar should collapse on narrow screens, got %d", got)
	}
}

func TestSidebarSectionsFollowAvailableModules(t *testing.T) {
	a := New("http://unused")
	a.sessions = nil
	a.selected = -1
	got := a.sidebarSections()
	if len(got) != 1 || got[0] != sidebarSectionSessions {
		t.Fatalf("sections without a selected session = %#v, want sessions only", got)
	}

	a.sessions = append(a.sessions, gact.Session{ID: "s1", Title: "demo"})
	a.selected = 0
	got = a.sidebarSections()
	if len(got) != 2 || got[0] != sidebarSectionSessions || got[1] != sidebarSectionContext {
		t.Fatalf("sections with selected session = %#v, want sessions then context", got)
	}
}

func TestSidebarSectionsFollowConfiguredModuleOrder(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.SetSidebarModuleIDs([]string{"context", "sessions"})

	got := a.sidebarSections()
	if len(got) != 2 || got[0] != sidebarSectionContext || got[1] != sidebarSectionSessions {
		t.Fatalf("sections = %#v, want configured context then sessions", got)
	}
}

func TestSidebarRendersUnknownConfiguredModuleAsDisabled(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width = 80
	a.height = 24
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.SetSidebarModuleIDs([]string{"sessions", "future-tools", "context"})

	out := ansi.Strip(a.renderSidebar(42, 20))
	if !strings.Contains(out, "future-tools") || !strings.Contains(out, "unknown module") {
		t.Fatalf("unknown configured module should render disabled:\n%s", out)
	}
}

func TestRightSidebarRendersContextModule(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width = 120
	a.height = 24
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "src/main.go", Mode: "read"}}
	a.SetSidebarLayout([]string{"sessions"}, []string{"context"})

	out := ansi.Strip(a.renderRightSidebar(30, 20, 90))
	if !strings.Contains(out, "CONTEXT") || !strings.Contains(out, "src/main.go") {
		t.Fatalf("right context module did not render context file:\n%s", out)
	}
}

func TestSidebarLayoutEditorMovesModulesBetweenColumns(t *testing.T) {
	a := New("http://unused")
	a.openSidebarLayoutEditor()

	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel[sidebarLayoutColumnLeft] = 1 // context
	a.transferSidebarLayoutModule(1)
	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("after moving context to available left=%#v right=%#v", left, right)
	}
	if got := a.SidebarModulePlacement("context"); got != "hidden" {
		t.Fatalf("context placement = %q, want hidden", got)
	}

	a.transferSidebarLayoutModule(1)
	left, right = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("after moving context right left=%#v right=%#v", left, right)
	}
}

func TestSidebarLayoutEditorReordersVisibleColumn(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout([]string{"sessions", "context"}, nil)
	a.openSidebarLayoutEditor()
	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel[sidebarLayoutColumnLeft] = 1

	a.reorderSidebarLayoutModule(-1)
	left, _ := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "context,sessions" {
		t.Fatalf("left order = %#v, want context,sessions", left)
	}
}

func TestSidebarLayoutEditorArrowKeysMoveModulesWithoutGrab(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout([]string{"sessions", "context"}, nil)
	a.openSidebarLayoutEditor()
	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel[sidebarLayoutColumnLeft] = 1

	model, _ := a.handleSidebarLayoutKey(tea.KeyPressMsg{Code: tea.KeyUp})
	a = model.(*App)
	left, _ := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "context,sessions" {
		t.Fatalf("up arrow should reorder selected module without grab, left=%#v", left)
	}
	if a.sidebarLayoutSel[sidebarLayoutColumnLeft] != 0 {
		t.Fatalf("selection should follow moved module, got %d", a.sidebarLayoutSel[sidebarLayoutColumnLeft])
	}

	model, _ = a.handleSidebarLayoutKey(tea.KeyPressMsg{Code: tea.KeyDown})
	a = model.(*App)
	left, _ = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions,context" {
		t.Fatalf("down arrow should reorder selected module without grab, left=%#v", left)
	}
}

func TestSidebarLayoutEditorTabChangesColumnsAndArrowsTransferModules(t *testing.T) {
	a := New("http://unused")
	a.SetSidebarLayout([]string{"sessions", "context"}, nil)
	a.openSidebarLayoutEditor()
	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel[sidebarLayoutColumnLeft] = 0

	model, _ := a.handleSidebarLayoutKey(tea.KeyPressMsg{Code: tea.KeyTab})
	a = model.(*App)
	if a.sidebarLayoutCol != sidebarLayoutColumnAvailable {
		t.Fatalf("Tab should focus available column, got %d", a.sidebarLayoutCol)
	}

	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	model, _ = a.handleSidebarLayoutKey(tea.KeyPressMsg{Code: tea.KeyRight})
	a = model.(*App)
	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "context" || len(right) != 0 {
		t.Fatalf("right arrow should move sessions to available, left=%#v right=%#v", left, right)
	}
	if got := a.SidebarModulePlacement("sessions"); got != "hidden" {
		t.Fatalf("sessions placement = %q, want hidden", got)
	}

	model, _ = a.handleSidebarLayoutKey(tea.KeyPressMsg{Code: tea.KeyRight})
	a = model.(*App)
	left, right = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "context" || strings.Join(right, ",") != "sessions" {
		t.Fatalf("second right arrow should move sessions to right, left=%#v right=%#v", left, right)
	}
}

func TestSidebarLayoutEditorHidesEmptyColumns(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.SetSidebarLayout([]string{"sessions", "context"}, nil)
	a.openSidebarLayoutEditor()

	out := ansi.Strip(a.viewSidebarLayoutEditor())
	if !strings.Contains(out, "Left") {
		t.Fatalf("layout editor should render left column:\n%s", out)
	}
	if !strings.Contains(out, "Available") {
		t.Fatalf("hidden files module should render as available:\n%s", out)
	}
	if strings.Contains(out, "Right") {
		t.Fatalf("empty right column should not render:\n%s", out)
	}
	if !strings.Contains(out, "Tab column") || !strings.Contains(out, "arrows/buttons move module") {
		t.Fatalf("layout editor should explain direct arrow/module controls:\n%s", out)
	}
}

func TestSidebarLayoutEditorMouseSelectsModuleRows(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.openSidebarLayoutEditor()

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

	if a.sidebarLayoutCol != sidebarLayoutColumnLeft || a.sidebarLayoutSel[sidebarLayoutColumnLeft] != 1 {
		t.Fatalf("layout editor mouse selection col=%d sel=%d, want left row 1", a.sidebarLayoutCol, a.sidebarLayoutSel[sidebarLayoutColumnLeft])
	}
}

func TestSidebarLayoutEditorMouseButtonsMoveSelectedModule(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.SetSidebarLayout([]string{"sessions", "context"}, nil)
	a.openSidebarLayoutEditor()
	a.sidebarLayoutCol = sidebarLayoutColumnLeft
	a.sidebarLayoutSel[sidebarLayoutColumnLeft] = 1

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
	left, right := a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "context,sessions" || len(right) != 0 {
		t.Fatalf("up button should reorder left modules, left=%#v right=%#v", left, right)
	}
	if a.sidebarLayoutSel[sidebarLayoutColumnLeft] != 0 {
		t.Fatalf("selection should follow reordered module, got %d", a.sidebarLayoutSel[sidebarLayoutColumnLeft])
	}

	_ = a.View()
	moveRight, ok := findHitTargetForTest(a, "button:sidebar-layout:right")
	if !ok {
		t.Fatal("missing sidebar layout right button")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: moveRight.rect.x, Y: moveRight.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	left, right = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("first right button should move context to available, left=%#v right=%#v", left, right)
	}
	if got := a.sidebarLayoutCol; got != sidebarLayoutColumnAvailable {
		t.Fatalf("after first right click column = %d, want available", got)
	}

	_ = a.View()
	moveRight, ok = findHitTargetForTest(a, "button:sidebar-layout:right")
	if !ok {
		t.Fatal("missing second sidebar layout right button")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{X: moveRight.rect.x, Y: moveRight.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	left, right = a.SidebarLayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("second right button should move context to right, left=%#v right=%#v", left, right)
	}
	if got := a.sidebarLayoutCol; got != sidebarLayoutColumnRight {
		t.Fatalf("after second right click column = %d, want right", got)
	}
}

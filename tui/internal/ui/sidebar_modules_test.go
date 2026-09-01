package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
	a.sidebar.SetModuleIDs([]string{" context ", "", "sessions", "context", "future-tools"})

	got := a.sidebar.ModuleIDs()
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

func TestSetSidebarModuleIDsClearsStaleRightPlacement(t *testing.T) {
	a := New("http://unused")
	a.width = 140
	a.sidebar.SetLayout([]string{"sessions"}, []string{"context"})

	a.sidebar.SetModuleIDs([]string{"context", "sessions"})

	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "context,sessions" || len(right) != 0 {
		t.Fatalf("layout left=%#v right=%#v, want context,sessions/no right", left, right)
	}
	if got := a.sidebar.ModulePlacement("context"); got != "left" {
		t.Fatalf("context placement = %q, want left", got)
	}
	if got := a.chrome.rightSidebarWidth(30); got != 0 {
		t.Fatalf("right sidebar width = %d, want disabled after single-list layout", got)
	}
}

func TestSetSidebarLayoutStoresRightModulesWithoutDefaults(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions"}, []string{"context", "future-tools"})

	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" {
		t.Fatalf("left layout = %#v, want sessions", left)
	}
	if strings.Join(right, ",") != "context,future-tools" {
		t.Fatalf("right layout = %#v, want context,future-tools", right)
	}
}

func TestSetSidebarLayoutRightPlacementRemovesLeftDuplicate(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout([]string{"sessions", "context"}, []string{"context"})

	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("layout left=%#v right=%#v, want sessions/context without duplicate", left, right)
	}
}

func TestSetSidebarLayoutCanRepresentEmptyLeftColumn(t *testing.T) {
	a := New("http://unused")
	a.sidebar.SetLayout(nil, []string{"context"})

	left, right := a.sidebar.LayoutIDs()
	if len(left) != 0 || strings.Join(right, ",") != "context" {
		t.Fatalf("layout left=%#v right=%#v, want empty/context", left, right)
	}
	if len(a.sidebar.modules()) != 0 {
		t.Fatalf("explicit empty left should not fall back to defaults: %#v", a.sidebar.modules())
	}
}

func TestSetSidebarModulePlacementMovesContextBetweenBars(t *testing.T) {
	a := New("http://unused")
	if got := a.sidebar.ModulePlacement("context"); got != "left" {
		t.Fatalf("default context placement = %q, want left", got)
	}

	a.sidebar.SetModulePlacement("context", "right")
	left, right := a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || strings.Join(right, ",") != "context" {
		t.Fatalf("right placement left=%#v right=%#v, want sessions/context", left, right)
	}

	a.sidebar.SetModulePlacement("context", "hidden")
	left, right = a.sidebar.LayoutIDs()
	if strings.Join(left, ",") != "sessions" || len(right) != 0 {
		t.Fatalf("hidden placement left=%#v right=%#v, want sessions/no right", left, right)
	}
	if got := a.sidebar.ModulePlacement("context"); got != "hidden" {
		t.Fatalf("context placement = %q, want hidden", got)
	}
}

func TestSidebarModuleIDsReturnDefaultOrder(t *testing.T) {
	a := New("http://unused")
	got := a.sidebar.ModuleIDs()
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
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	if got := a.chrome.rightSidebarWidth(30); got != 0 {
		t.Fatalf("right sidebar should be disabled without right modules, got %d", got)
	}

	a.sidebar.SetLayout([]string{"sessions"}, []string{"context"})
	if got := a.chrome.rightSidebarWidth(30); got <= 0 {
		t.Fatalf("right sidebar should be enabled with right modules on wide screens, got %d", got)
	}

	a.width = 80
	if got := a.chrome.rightSidebarWidth(26); got != 0 {
		t.Fatalf("right sidebar should collapse on narrow screens, got %d", got)
	}
}

func TestSidebarSectionsFollowAvailableModules(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = nil
	a.session.selected = -1
	got := a.sidebar.sections()
	if len(got) != 1 || got[0] != sidebarSectionSessions {
		t.Fatalf("sections without a selected session = %#v, want sessions only", got)
	}

	a.session.sessions = append(a.session.sessions, gact.Session{ID: "s1", Title: "demo"})
	a.session.selected = 0
	got = a.sidebar.sections()
	if len(got) != 2 || got[0] != sidebarSectionSessions || got[1] != sidebarSectionContext {
		t.Fatalf("sections with selected session = %#v, want sessions then context", got)
	}
}

func TestSidebarSectionsFollowConfiguredModuleOrder(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.sidebar.SetModuleIDs([]string{"context", "sessions"})

	got := a.sidebar.sections()
	if len(got) != 2 || got[0] != sidebarSectionContext || got[1] != sidebarSectionSessions {
		t.Fatalf("sections = %#v, want configured context then sessions", got)
	}
}

func TestSidebarRendersUnknownConfiguredModuleAsDisabled(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width = 80
	a.height = 24
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.sidebar.SetModuleIDs([]string{"sessions", "future-tools", "context"})

	out := ansi.Strip(a.sidebar.render(42, 20))
	if !strings.Contains(out, "future-tools") || !strings.Contains(out, "unknown module") {
		t.Fatalf("unknown configured module should render disabled:\n%s", out)
	}
}

func TestRightSidebarRendersContextModule(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width = 120
	a.height = 24
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "src/main.go", Mode: "read"}}
	a.sidebar.SetLayout([]string{"sessions"}, []string{"context"})

	out := ansi.Strip(a.sidebar.renderRight(30, 20, 90))
	if !strings.Contains(out, "CONTEXT") || !strings.Contains(out, "src/main.go") {
		t.Fatalf("right context module did not render context file:\n%s", out)
	}
}

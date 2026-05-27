package ui

import (
	"strings"
	"testing"

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

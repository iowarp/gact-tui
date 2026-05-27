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
	a.sidebarModuleIDs = []sidebarModuleID{sidebarModuleContext, sidebarModuleSessions}

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
	a.sidebarModuleIDs = []sidebarModuleID{sidebarModuleSessions, "future-tools", sidebarModuleContext}

	out := ansi.Strip(a.renderSidebar(42, 20))
	if !strings.Contains(out, "future-tools") || !strings.Contains(out, "unknown module") {
		t.Fatalf("unknown configured module should render disabled:\n%s", out)
	}
}

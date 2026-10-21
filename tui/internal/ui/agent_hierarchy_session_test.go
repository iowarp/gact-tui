package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSessionSidebarSurfacesTheSessionAgent(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionSessions
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.session.sessions = []gact.Session{{
		ID:       "s1",
		Title:    "Seismic session",
		Status:   gact.StatusIdle,
		Metadata: map[string]any{"agent_ref": "user/seismic-review"},
	}}
	a.session.selected = 0

	out := ansi.Strip(a.sidebar.render(72, 20))
	if !strings.Contains(out, "agent user/seismic-review") {
		t.Fatalf("session sidebar should show the session agent:\n%s", out)
	}
	if rows := a.sidebar.sessionRowCount(0); rows != 3 {
		t.Fatalf("session row count = %d, want title/status/agent rows", rows)
	}
}

func TestSessionSidebarOmitsAgentRowWithoutPinnedAgent(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1", Title: "Plain session", Status: gact.StatusIdle}}
	a.session.selected = 0

	if rows := a.sidebar.sessionRowCount(0); rows != 2 {
		t.Fatalf("session row count = %d, want title/status rows", rows)
	}
	if strings.Contains(ansi.Strip(a.sidebar.render(72, 20)), "agent ") {
		t.Fatal("session without a pinned agent should not render an agent row")
	}
}

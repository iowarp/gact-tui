package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestSessionSidebarSurfacesActiveAgentBlueprintScope(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionSessions
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.session.sessions = []gact.Session{{
		ID:     "s1",
		Title:  "Blueprint session",
		Status: gact.StatusIdle,
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-market",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.session.selected = 0

	out := ansi.Strip(a.sidebar.render(72, 20))
	if !strings.Contains(out, "◆ seismic-market") {
		t.Fatalf("session sidebar should show active blueprint:\n%s", out)
	}
	if rows := a.sidebar.sessionRowCount(0); rows != 3 {
		t.Fatalf("session row count = %d, want title/status/active-blueprint rows", rows)
	}

	narrowOut := ansi.Strip(a.sidebar.render(28, 20))
	if strings.Contains(narrowOut, "active blueprint") || strings.Contains(narrowOut, "bp:") {
		t.Fatalf("narrow active blueprint marker should avoid verbose or backend shorthand labels:\n%s", narrowOut)
	}
	if !strings.Contains(narrowOut, "◆ seismic") {
		t.Fatalf("narrow active blueprint marker should preserve useful blueprint identity:\n%s", narrowOut)
	}
}

func TestSessionSidebarCompactsLongActiveAgentBlueprint(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionSessions
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.session.sessions = []gact.Session{{
		ID:     "s1",
		Title:  "Blueprint session",
		Status: gact.StatusIdle,
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "san-diego-earthscope-ndp-live-benchmark-review",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.session.selected = 0

	out := ansi.Strip(a.sidebar.render(30, 20))
	if !strings.Contains(out, "◆ san-diego") {
		t.Fatalf("session sidebar should compact long blueprint IDs to readable prefixes:\n%s", out)
	}
	if strings.Contains(out, "san-diego-earthscope-ndp-live") || strings.Contains(out, "san-die...") {
		t.Fatalf("session sidebar should avoid unreadable raw/truncated blueprint IDs:\n%s", out)
	}
}

func TestAgentBlueprintActivatedMsgUpdatesSelectedSessionMetadata(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionSessions
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"sessions"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1", WorkspaceID: "ws1", Title: "Blueprint session", Status: gact.StatusIdle}}
	a.session.selected = 0

	model, cmd := a.Update(agentBlueprintActivatedMsg{
		blueprintID: "seismic-market",
		state: gact.SessionAgentBlueprintState{
			SessionID:                "s1",
			WorkspaceID:              "ws1",
			ActiveAgentBlueprintID:   "seismic-market",
			ActiveAgentBlueprintPath: "/workspace/.clio/agent-blueprints/seismic-market/AGENT.md",
		},
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("activation success should schedule transient hint expiry")
	}
	if got := stringValue(a.session.sessions[0].Metadata["active_agent_blueprint_id"]); got != "seismic-market" {
		t.Fatalf("active blueprint metadata = %q", got)
	}
	if got := stringValue(a.session.sessions[0].Metadata["active_agent_blueprint_scope"]); got != "session" {
		t.Fatalf("active blueprint scope = %q", got)
	}

	out := ansi.Strip(a.sidebar.render(72, 20))
	if !strings.Contains(out, "◆ seismic-market") {
		t.Fatalf("activation state should render in session sidebar:\n%s", out)
	}
}

package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestHeaderSettingsAndHelpUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusInput

	_ = a.View()
	helpTarget, ok := findHitTargetForTest(a, "header:help")
	if !ok {
		t.Fatal("missing visible header help hit target")
	}
	if helpTarget.rect.y != 0 {
		t.Fatalf("header help target y=%d, want top chrome row", helpTarget.rect.y)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      helpTarget.rect.x,
		Y:      helpTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("header help click should not dispatch a command")
	}
	if !a.help.open || a.help.tab != 0 || a.help.scroll != 0 {
		t.Fatalf("header help click should open help from first tab, open=%v tab=%d scroll=%d", a.help.open, a.help.tab, a.help.scroll)
	}

	a.help.open = false
	_ = a.View()
	settingsTarget, ok := findHitTargetForTest(a, "header:settings")
	if !ok {
		t.Fatal("missing visible header settings hit target")
	}
	if settingsTarget.rect.y != 0 {
		t.Fatalf("header settings target y=%d, want top chrome row", settingsTarget.rect.y)
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      settingsTarget.rect.x,
		Y:      settingsTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settings.open {
		t.Fatalf("header settings click should open settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if cmd == nil {
		t.Fatal("header settings click should dispatch settings load command")
	}

	a.settings.open = false
	_ = a.View()
	quitTarget, ok := findLastHitTargetWithPrefixForTest(a, "header:quit")
	if !ok {
		t.Fatal("missing visible header quit hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      quitTarget.rect.x,
		Y:      quitTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("header quit click should not immediately dispatch a command")
	}
	if !a.quitConfirm.open || a.quitConfirm.selected != 0 {
		t.Fatalf("header quit click should open quit confirmation, open=%v selected=%d", a.quitConfirm.open, a.quitConfirm.selected)
	}
}

func TestHeaderActionsUseDiscoverableLabels(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 30

	header := ansi.Strip(a.chrome.renderHeader())

	for _, want := range []string{"x", "help", "settings"} {
		if !strings.Contains(header, want) {
			t.Fatalf("header action %q should be visible in top chrome: %q", want, header)
		}
	}
}

func TestHeaderActionsAlignToTerminalRightEdge(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 36
	a.MouseEnabled = true
	a.sidebar.SetLayout([]string{"sessions"}, []string{"files"})

	view := a.View()
	quitTarget, ok := findLastHitTargetWithPrefixForTest(a, "header:quit")
	if !ok {
		t.Fatal("missing visible header quit hit target")
	}
	lines := strings.Split(ansi.Strip(view.Content), "\n")
	if len(lines) < 2 {
		t.Fatalf("rendered view is missing main row: %q", view.Content)
	}
	headerW := lipgloss.Width(lines[0])
	if headerW != a.width {
		t.Fatalf("header width = %d, want terminal width %d\nheader=%q", headerW, a.width, lines[0])
	}
	visibleRowEdge := lipgloss.Width(strings.TrimRight(lines[1], " "))
	if got := quitTarget.rect.x + quitTarget.rect.w; got != a.width {
		t.Fatalf("quit action right edge = %d, want terminal edge %d", got, a.width)
	} else if got < visibleRowEdge {
		t.Fatalf("quit action right edge = %d should not sit left of pane edge %d", got, visibleRowEdge)
	}
}

func TestHeaderChipsUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 220
	a.height = 30
	a.stage = StageReady
	a.focus = FocusInput
	a.BackendLabel = "local backend"
	a.session.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha"},
		{ID: "ws_b", Name: "bravo"},
	}
	a.session.wsID = "ws_b"
	a.session.sessions = []gact.Session{{
		ID:           "sess_1",
		Title:        "demo header target",
		Status:       gact.StatusRunning,
		MessageCount: 0,
		Model:        gact.ModelRef{ProviderID: "openai", ModelID: "gpt-4.1"},
		Agent:        gact.AgentRef{ID: "analysis", Mode: "subagent"},
		RoutingMode:  "auto",
	}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	a.session.caps.Capabilities.IntegrationHealth = true

	_ = a.View()
	if header := ansi.Strip(a.chrome.renderHeader()); !strings.Contains(header, "workspace: bravo") {
		t.Fatalf("header should label the current workspace, got %q", header)
	}
	for _, id := range []string{
		"header:chip:backend",
		"header:chip:workspace",
		"header:chip:session",
		"header:chip:model",
		"header:chip:agent",
		"header:chip:routing",
		"header:chip:status",
	} {
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing semantic header chip target %q", id)
		}
		if target.rect.y != 0 {
			t.Fatalf("%s target y=%d, want top chrome row", id, target.rect.y)
		}
	}

	backendTarget, _ := findHitTargetForTest(a, "header:chip:backend")
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      backendTarget.rect.x,
		Y:      backendTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.metrics.open || !a.metrics.loading {
		t.Fatalf("backend header click should open metrics, open=%v metrics=%+v", a.metrics.open, a.metrics.metricsState)
	}
	if cmd == nil {
		t.Fatal("backend header click should dispatch metrics load command")
	}

	a.metrics.open = false
	a.metrics.metricsState = metricsState{}
	_ = a.View()
	workspaceTarget, _ := findHitTargetForTest(a, "header:chip:workspace")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      workspaceTarget.rect.x,
		Y:      workspaceTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("workspace header click should not dispatch a command")
	}
	if !a.workspace.switchOpen || a.workspace.switchSel != 1 {
		t.Fatalf("workspace header click should open switcher on current workspace, open=%v sel=%d", a.workspace.switchOpen, a.workspace.switchSel)
	}

	a.workspace.switchOpen = false
	_ = a.View()
	sessionTarget, _ := findHitTargetForTest(a, "header:chip:session")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      sessionTarget.rect.x,
		Y:      sessionTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("session header click should not dispatch a command")
	}
	if a.focus != FocusSidebar || a.sidebar.sectionFocus != sidebarSectionSessions || a.sidebar.sectionCursor {
		t.Fatalf("session header click should focus selected session, focus=%v section=%v cursor=%v", a.focus, a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}

	a.focus = FocusInput
	_ = a.View()
	modelTarget, _ := findHitTargetForTest(a, "header:chip:model")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      modelTarget.rect.x,
		Y:      modelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settings.open || a.settings.tab != 0 {
		t.Fatalf("model header click should open model settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if cmd == nil {
		t.Fatal("model header click should dispatch settings load command")
	}

	a.settings.open = false
	_ = a.View()
	agentTarget, _ := findHitTargetForTest(a, "header:chip:agent")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      agentTarget.rect.x,
		Y:      agentTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settings.open || a.settings.tab != 1 {
		t.Fatalf("agent header click should open agent settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if cmd == nil {
		t.Fatal("agent header click should dispatch settings load command")
	}

	a.settings.open = false
	_ = a.View()
	routingTarget, _ := findHitTargetForTest(a, "header:chip:routing")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      routingTarget.rect.x,
		Y:      routingTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settings.open || a.settings.tab != 0 {
		t.Fatalf("routing header click should open model settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
	if cmd == nil {
		t.Fatal("routing header click should dispatch settings load command")
	}

	a.settings.open = false
	_ = a.View()
	statusTarget, _ := findHitTargetForTest(a, "header:chip:status")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      statusTarget.rect.x,
		Y:      statusTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.doctor.open || !a.doctor.loading {
		t.Fatalf("status header click should open doctor when supported, open=%v doctor=%+v", a.doctor.open, a.doctor)
	}
	if cmd == nil {
		t.Fatal("status header click should dispatch doctor fetch command")
	}
}

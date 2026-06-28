package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestWorkspaceSwitcherRowsUseSemanticHitTargets(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_b")
	if !ok {
		t.Fatal("missing semantic workspace row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.workspace.switchSel != 1 {
		t.Fatalf("workspaceSwitchSel = %d, want clicked row", a.workspace.switchSel)
	}
	if a.workspace.switchOpen {
		t.Fatal("clicking workspace row should close switcher")
	}
	if a.session.wsID != "ws_b" {
		t.Fatalf("wsID = %q, want ws_b", a.session.wsID)
	}
	if cmd == nil {
		t.Fatal("clicking a different workspace should dispatch listSessions cmd")
	}
}

func TestWorkspaceSwitcherTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_a")
	if !ok {
		t.Fatal("missing semantic first workspace row target")
	}
	rect := overlayMouseRect(a.workspace.view(), a.width, a.height)
	if wantY := rect.y + 2 + 9; target.rect.y != wantY {
		t.Fatalf("first workspace row y = %d, want shared frame body row %d", target.rect.y, wantY)
	}
}

func TestWorkspaceSwitcherCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:workspace-switch:close")
	if !ok {
		t.Fatal("missing semantic workspace close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("workspace close should not dispatch a command")
	}
	if a.workspace.switchOpen {
		t.Fatal("workspace close should close switcher")
	}
	if a.session.wsID != "ws_a" {
		t.Fatalf("workspace close changed workspace to %q", a.session.wsID)
	}
}

func TestWorkspaceSwitcherMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:list:wheel")
	if !ok {
		t.Fatal("missing semantic workspace list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.workspace.switchSel != 1 {
		t.Fatalf("wheel over workspace list should move selection, got %d", a.workspace.switchSel)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "workspace-switch:surface:wheel")
	if !ok {
		t.Fatal("missing workspace surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.workspace.switchSel != 1 {
		t.Fatalf("wheel on workspace chrome should not move selection, got %d", a.workspace.switchSel)
	}
}

func TestWorkspaceSwitcherUsesSharedModalListMarkers(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	out := stripANSI(a.workspace.view())

	for _, want := range []string{
		"Switch workspace",
		"▌ alpha",
		"root: /tmp/alpha · current workspace",
		"[current]",
		"bravo",
		"Enter switch",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("workspace switcher missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "ws_a") || strings.Contains(out, "ws_b") {
		t.Fatalf("workspace switcher should keep backend IDs out of named workspace rows:\n%s", out)
	}
}

func TestWorkspaceSwitcherUsesSharedInsetListWidth(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_a")
	if !ok {
		t.Fatal("missing workspace row hit target")
	}
	if got, want := target.rect.w, modalInsetListWidth(a.modals.modalWidth()); got != want {
		t.Fatalf("workspace row hit width = %d, want shared inset width %d", got, want)
	}
}

func TestWorkspaceSwitcherUsesBoundedScrollWindow(t *testing.T) {
	a := makeSwitcherApp(t)
	a.session.workspaces = nil
	for i := 0; i < 20; i++ {
		a.session.workspaces = append(a.session.workspaces, gact.Workspace{
			ID:   "ws_" + itoa2(i),
			Name: "workspace " + itoa2(i),
		})
	}
	a.session.wsID = "ws_00"
	a.workspace.switchOpen = true
	a.workspace.switchSel = 18

	out := stripANSI(a.workspace.view())
	if !strings.Contains(out, "workspace 18") {
		t.Fatalf("selected workspace should remain visible in bounded window:\n%s", out)
	}
	if strings.Contains(out, "workspace 00") {
		t.Fatalf("bounded window should not render every workspace:\n%s", out)
	}
	if strings.Contains(out, "ws_18") {
		t.Fatalf("bounded window should not expose backend IDs in named workspace rows:\n%s", out)
	}
	if strings.Contains(out, "↑ 12") || strings.Contains(out, "↓ 12") {
		t.Fatalf("bounded window should not render textual scroll count rows:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded window should show shared side scroll rail:\n%s", out)
	}
}

func TestWorkspaceSwitcherScrolledRowsUseSemanticHitTargets(t *testing.T) {
	a := makeSwitcherApp(t)
	a.session.workspaces = nil
	for i := 0; i < 20; i++ {
		a.session.workspaces = append(a.session.workspaces, gact.Workspace{
			ID:   "ws_" + itoa2(i),
			Name: "workspace " + itoa2(i),
		})
	}
	a.session.wsID = "ws_00"
	a.workspace.switchOpen = true
	a.workspace.switchSel = 18

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "workspace-switch:item:ws_18"); !ok {
		t.Fatal("missing semantic target for selected row inside scrolled workspace window")
	}
	if _, ok := findHitTargetForTest(a, "workspace-switch:item:ws_00"); ok {
		t.Fatal("offscreen workspace row should not register a stale hit target")
	}
}

func TestWorkspaceSwitcherNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	_ = a.View()
	rect := overlayMouseRect(a.workspace.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside workspace switcher should not dispatch")
	}
	if !a.workspace.switchOpen {
		t.Fatal("non-row click inside workspace switcher should keep modal open")
	}
	if a.workspace.switchSel != 0 || a.session.wsID != "ws_a" {
		t.Fatalf("non-row click changed selection/state: sel=%d ws=%s", a.workspace.switchSel, a.session.wsID)
	}
}

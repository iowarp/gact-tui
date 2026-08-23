package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestDoctorTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.doctor.open = true
	a.doctor.doctorState = doctorState{tab: doctorTabHealth}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "tab:doctor-capabilities")
	if !ok {
		t.Fatal("missing semantic doctor capabilities tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("doctor tab = %v, want capabilities", a.doctor)
	}
}

func TestDoctorButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.doctor.open = true
	a.doctor.doctorState = doctorState{tab: doctorTabCapabilities}

	_ = a.View()
	refreshTarget, ok := findHitTargetForTest(a, "button:doctor:refresh")
	if !ok {
		t.Fatal("missing semantic doctor refresh target")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:doctor:close")
	if !ok {
		t.Fatal("missing semantic doctor close target")
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      refreshTarget.rect.x,
		Y:      refreshTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("clicking doctor refresh should dispatch a fetch command")
	}
	if !a.doctor.loading || a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("refresh should preserve tab and enter loading state, got %+v", a.doctor)
	}

	a.doctor.doctorState = doctorState{tab: doctorTabHealth}
	_ = a.View()
	closeTarget, ok = findHitTargetForTest(a, "button:doctor:close")
	if !ok {
		t.Fatal("missing semantic doctor close target after refresh")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      closeTarget.rect.x,
		Y:      closeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking doctor close should not dispatch a command")
	}
	if a.doctor.open {
		t.Fatal("clicking doctor close should close modal and clear state")
	}
}

func TestDoctorWheelUsesBodyRegionOnly(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 18
	a.stage = StageReady
	a.doctor.open = true
	a.doctor.doctorState = doctorState{
		tab: doctorTabCapabilities,
		caps: gact.Capabilities{Capabilities: gact.CapabilityFlags{
			Workspaces: true,
			Sessions:   true,
			Subagents:  true,
			MCP:        true,
			Files:      true,
		}},
	}

	_ = a.View()
	body, ok := findHitTargetForTest(a, "doctor:body:wheel")
	if !ok {
		t.Fatal("missing doctor body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      body.rect.x,
		Y:      body.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.doctor.scroll != 1 {
		t.Fatalf("wheel over doctor body should scroll doctor, got %+v", a.doctor)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "doctor:surface:wheel")
	if !ok {
		t.Fatal("missing doctor surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.doctor.scroll != 1 {
		t.Fatalf("wheel on doctor chrome should not scroll doctor, got %+v", a.doctor)
	}
}

func TestDoctorHealthRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.doctor.open = true
	a.doctor.doctorState = doctorState{
		tab: doctorTabHealth,
		health: gact.HealthResponse{
			Healthy:       true,
			UptimeS:       125,
			OverallStatus: "degraded",
			Integrations: []gact.Integration{{
				Name:   "lm",
				Status: "ready",
				Detail: "argonne/gpt-oss-120b configured",
			}},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "doctor:integration:lm")
	if !ok {
		t.Fatal("missing semantic doctor integration row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("doctor integration detail click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("doctor integration row click should open shared detail view")
	}
	for _, want := range []string{"Integration", "name: lm", "status: ready", "argonne/gpt-oss-120b", "Backend", "overall_status: degraded"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("doctor integration detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

func TestDoctorCapabilityRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.doctor.open = true
	a.doctor.doctorState = doctorState{
		tab: doctorTabCapabilities,
		caps: gact.Capabilities{
			ContractVersion: "0.2",
			Backend:         gact.BackendInfo{Name: "clio", Version: "dev", Vendor: "iowarp"},
			Capabilities: gact.CapabilityFlags{
				Workspaces: true,
			},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "doctor:capability:workspaces")
	if !ok {
		t.Fatal("missing semantic doctor capability row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("doctor capability detail click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("doctor capability row click should open shared detail view")
	}
	for _, want := range []string{"Capability", "surface: Workspace switching", "backend_field: workspaces", "status: supported", "scope: v0.1 core", "Backend", "contract_version: 0.2", "name: clio"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("doctor capability detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

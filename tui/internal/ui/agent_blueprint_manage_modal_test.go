package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentBlueprintManageModalUsesSharedTextEntrySemantics(t *testing.T) {
	a := newReadyApp(nil, nil)

	a.agentBlueprintManage.openModal(agentBlueprintManageInstall)
	installView := ansi.Strip(a.agentBlueprintManage.view())
	for _, want := range []string{"Install agent blueprint", "install", "current workspace"} {
		if !strings.Contains(installView, want) {
			t.Fatalf("install modal missing %q:\n%s", want, installView)
		}
	}

	a.agentBlueprintManage.openModal(agentBlueprintManageValidate)
	_, _ = a.agentBlueprintManage.handleKey(keyMsg("/"))
	if a.agentBlueprintManage.input.Value() != "/" {
		t.Fatalf("slash-prefixed paths should be editable, input=%q", a.agentBlueprintManage.input.Value())
	}
	a.agentBlueprintManage.input.SetValue("")
	a.agentBlueprintManage.input.SetCursor(0)
	_, _ = a.Update(tea.PasteMsg{Content: "/workspace/My Blueprint/\r\nAGENT.md\n"})
	if a.agentBlueprintManage.input.Value() != "/workspace/My Blueprint/AGENT.md" {
		t.Fatalf("paste should route to blueprint modal, input=%q", a.agentBlueprintManage.input.Value())
	}
	a.agentBlueprintManage.input.SetValue("")
	a.agentBlueprintManage.input.SetCursor(0)
	validateView := ansi.Strip(a.agentBlueprintManage.view())
	for _, want := range []string{"Validate agent blueprint", "validate", "without", "installing"} {
		if !strings.Contains(validateView, want) {
			t.Fatalf("validate modal missing %q:\n%s", want, validateView)
		}
	}

	a.agentBlueprintManage.openModal(agentBlueprintManageSource)
	sourceView := ansi.Strip(a.agentBlueprintManage.view())
	for _, want := range []string{"Add marketplace source", "add source", "git URL", "GACT stores", "refreshes"} {
		if !strings.Contains(sourceView, want) {
			t.Fatalf("source modal missing %q:\n%s", want, sourceView)
		}
	}

	_, _ = a.agentBlueprintManage.handleKey(keyMsg("enter"))
	if !strings.Contains(a.agentBlueprintManage.err, "required") {
		t.Fatalf("empty source submit should surface a truthful error, got %q", a.agentBlueprintManage.err)
	}
}

func TestAgentBlueprintInstallPrefillsLastValidatedSource(t *testing.T) {
	a := newReadyApp(nil, nil)
	source := "/workspace/.clio/agent-blueprints/data/AGENT.md"

	model, _ := a.Update(agentBlueprintManageDoneMsg{
		action: agentBlueprintManageValidate,
		source: source,
		check:  gact.AgentBlueprintValidationResult{Enabled: true},
	})
	a = model.(*App)
	if a.agentBlueprintManage.lastValidatedSource != source {
		t.Fatalf("last validated source = %q, want %q", a.agentBlueprintManage.lastValidatedSource, source)
	}

	a.agentBlueprintManage.openModal(agentBlueprintManageInstall)
	if a.agentBlueprintManage.input.Value() != source {
		t.Fatalf("install input = %q, want validated source", a.agentBlueprintManage.input.Value())
	}
	if a.agentBlueprintManage.input.Cursor() != len([]rune(source)) {
		t.Fatalf("install cursor = %d, want end of source", a.agentBlueprintManage.input.Cursor())
	}
	out := ansi.Strip(a.agentBlueprintManage.view())
	for _, want := range []string{"Prefilled from the last successful validation", source} {
		if !strings.Contains(out, want) {
			t.Fatalf("install modal missing prefill hint %q:\n%s", want, out)
		}
	}
}

func TestAgentBlueprintManageButtonsUseSemanticHitTargets(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.agentBlueprintManage.openModal(agentBlueprintManageValidate)

	a.interaction.beginHitFrame()
	modal := a.agentBlueprintManage.view()
	validateTarget, ok := findHitTargetForTest(a, "button:agent-blueprint-manage:validate")
	if !ok {
		t.Fatal("missing validate button hit target")
	}
	cancelTarget, ok := findHitTargetForTest(a, "button:agent-blueprint-manage:cancel")
	if !ok {
		t.Fatal("missing cancel button hit target")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	for id, target := range map[string]uiHitTarget{
		"validate": validateTarget,
		"cancel":   cancelTarget,
	} {
		if wantY := rect.y + 2; target.rect.y != wantY {
			t.Fatalf("%s button y = %d, want shared header row %d", id, target.rect.y, wantY)
		}
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      validateTarget.rect.x,
		Y:      validateTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("empty validate click should not dispatch a backend command")
	}
	if !a.agentBlueprintManage.open {
		t.Fatal("empty validate click should keep modal open")
	}
	if !strings.Contains(a.agentBlueprintManage.err, "required") {
		t.Fatalf("empty validate click should surface required error, got %q", a.agentBlueprintManage.err)
	}

	a.interaction.beginHitFrame()
	_ = a.agentBlueprintManage.view()
	cancelTarget, ok = findHitTargetForTest(a, "button:agent-blueprint-manage:cancel")
	if !ok {
		t.Fatal("missing cancel button hit target after validation error")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      cancelTarget.rect.x,
		Y:      cancelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("cancel click should not dispatch a backend command")
	}
	if a.agentBlueprintManage.open {
		t.Fatal("cancel click should close blueprint manage modal")
	}
}

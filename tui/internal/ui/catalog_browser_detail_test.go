package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestCatalogBrowser_EnterOnSkillDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: []catalogItem{{id: "tui-test", title: "TUI Test", statusTag: "skill"}},
	}
	a.catalog.open = true
	a.catalog.current = parent

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalog.current == parent {
		t.Fatal("enter on skill row did not replace browser with agent detail state")
	}
	if a.catalog.current.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalog.current.kind)
	}
	if a.catalog.current.agentID != "tui-test" {
		t.Fatalf("agentID = %q, want tui-test", a.catalog.current.agentID)
	}
	if cmd == nil {
		t.Fatal("expected skill detail load command")
	}
}

func TestCatalogBrowser_EnterOnToolRowLoadsToolDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "shell_bash", title: "shell_bash"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on tool row should fetch tool detail")
	}
}

func TestCatalogDetailLoadedOpensScrollableDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}

	model, _ := a.Update(catalogDetailLoadedMsg{
		title: "Tool · shell_bash",
		text:  "owner: utility\nvisible_to: chat, planner, utility\ninput_schema:\n{}",
	})
	got := model.(*App)

	if !got.detail.visible || got.detail.ref == nil {
		t.Fatal("catalog detail should open detail view")
	}
	if !got.catalog.open || got.catalog.current == nil {
		t.Fatal("catalog detail should keep the catalog behind the foreground detail view")
	}
	if !strings.Contains(got.detail.ref.fullText, "workflow area: utility") ||
		!strings.Contains(got.detail.ref.fullText, "available to: chat") ||
		!strings.Contains(got.detail.ref.fullText, "inputs:") {
		t.Fatalf("detail missing tool inspector metadata:\n%s", got.detail.ref.fullText)
	}
	for _, raw := range []string{"owner:", "visible_to:", "input_schema:"} {
		if strings.Contains(got.detail.ref.fullText, raw) {
			t.Fatalf("catalog detail should avoid raw label %q:\n%s", raw, got.detail.ref.fullText)
		}
	}
}

func TestCatalogDetailLoadedErrorUsesOperatorCopy(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}

	model, _ := a.Update(catalogDetailLoadedMsg{
		title: "Tool · legacy_waveform_fetch",
		err:   &client.Error{Status: 503, Code: "tool_unavailable", Message: "tool unavailable: the EarthScope connector is not loaded in this workspace"},
	})
	got := model.(*App)

	if !got.detail.visible || got.detail.ref == nil {
		t.Fatal("catalog detail error should open detail view")
	}
	if !got.catalog.open || got.catalog.current == nil {
		t.Fatal("catalog detail error should keep the catalog behind the foreground detail view")
	}
	for _, want := range []string{
		"Unable to load this detail.",
		"Reason: tool unavailable: the EarthScope connector is not loaded in this workspace",
	} {
		if !strings.Contains(got.detail.ref.fullText, want) {
			t.Fatalf("detail error missing %q:\n%s", want, got.detail.ref.fullText)
		}
	}
	for _, raw := range []string{"gact:", "tool_unavailable"} {
		if strings.Contains(got.detail.ref.fullText, raw) {
			t.Fatalf("detail error leaked raw backend wrapper %q:\n%s", raw, got.detail.ref.fullText)
		}
	}
}

func TestSanitizeCatalogDetailTextHumanizesBackendLabels(t *testing.T) {
	raw := strings.Join([]string{
		"owner: utility",
		"visible_to: chat, planner",
		"input_schema:",
		"  {}",
		"provider_id: argonne",
		"model_id: gpt-oss",
		"\"provider_id\": \"kept inside json\"",
	}, "\n")

	out := sanitizeCatalogDetailText(raw)
	for _, want := range []string{
		"workflow area: utility",
		"available to: chat, planner",
		"inputs:",
		"provider: argonne",
		"model: gpt-oss",
		"\"provider_id\": \"kept inside json\"",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("sanitized detail missing %q:\n%s", want, out)
		}
	}
	for _, rawLabel := range []string{"owner:", "visible_to:", "input_schema:", "provider_id:", "model_id:"} {
		if strings.Contains(out, rawLabel) && !strings.Contains(rawLabel, "\"") {
			t.Fatalf("sanitized detail leaked raw label %q:\n%s", rawLabel, out)
		}
	}
}

func TestCatalogBrowserDetailKindsAdvertiseEnterDetails(t *testing.T) {
	for _, kind := range []catalogBrowserKind{catalogKindTools, catalogKindMcpDetail, catalogKindAgentDetail} {
		a := newReadyApp(nil, nil)
		a.catalog.open = true
		a.catalog.current = &catalogBrowserState{
			kind:  kind,
			title: "Detail",
			items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
		}
		a.width = 120
		a.height = 40

		out := stripANSI(a.catalog.view())
		if !strings.Contains(out, "Enter details") {
			t.Fatalf("detail catalog kind %v should advertise Enter details:\n%s", kind, out)
		}
	}
}

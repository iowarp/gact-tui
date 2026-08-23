package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestExpertPackDetailItemsExposeActivationAndAgents(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{
			ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace", Enabled: true,
			Defaults: map[string]any{"provider": "openai"},
			Metadata: map[string]any{"install": map[string]any{"source": "git@example.org:data-semantics.git", "commit": "abc123"}},
		},
		Agents: []gact.AgentDef{{
			ID: "data.root", Title: "Data Root", Source: "expert_pack", Enabled: true,
			Tools: []string{"mcp.parquet.read"},
		}},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want activation, pack summary, and agent", len(items))
	}
	if items[0].id != "activate" {
		t.Fatalf("first expert-pack detail row = %q, want activate", items[0].id)
	}
	for _, wantID := range []string{"expert-pack-action/update", "expert-pack-action/delete"} {
		var found bool
		for _, item := range items {
			if item.id == wantID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expert-pack detail missing action row %q: %#v", wantID, items)
		}
	}
	for _, want := range []string{"only for the current selected session", "new sessions keep the workspace default"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("expert-pack activation row missing scope/default text %q: %#v", want, items[0])
		}
	}
	for _, want := range []string{"Operator summary", "workflow", "activation", "session scope", "experts: 1", "tools: mcp.parquet.read"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("pack summary missing %q:\n%s", want, items[1].desc)
		}
	}
	if !strings.HasPrefix(items[1].title, "Workflow pack · ") {
		t.Fatalf("pack summary title should use operator-facing workflow label: %#v", items[1])
	}
	for _, want := range []string{"Workflow pack identity", "Source evidence"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("pack summary missing operator-facing section %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, "session_scope") {
		t.Fatalf("pack summary should not expose raw session_scope label:\n%s", items[1].desc)
	}
	if strings.Contains(items[0].desc+items[1].desc, "backend/workspace") {
		t.Fatalf("expert-pack detail should not expose backend-default wording:\n%s\n%s", items[0].desc, items[1].desc)
	}
	if !strings.Contains(items[1].desc, "provider") {
		t.Fatalf("pack summary should surface defaults metadata:\n%s", items[1].desc)
	}
	if !strings.Contains(items[1].desc, "git@example.org:data-semantics.git") || !strings.Contains(items[1].desc, "abc123") {
		t.Fatalf("pack summary should surface install provenance metadata:\n%s", items[1].desc)
	}
	agentRow := catalogItemByIDForTest(items, "agent/data.root")
	if agentRow.id == "" || !strings.Contains(agentRow.desc, "mcp.parquet.read") {
		t.Fatalf("agent detail row missing drilldown/tool metadata: %#v", agentRow)
	}
	if !strings.Contains(agentRow.inlineDesc, "1 tool") {
		t.Fatalf("agent detail row should expose compact hierarchy/tool summary: %#v", agentRow)
	}
}

func TestExpertPackDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · Data Semantics",
		expertPackID: "data-semantics",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "expert-pack-action/update", title: "Update pack"},
			{id: "expert-pack-action/delete", title: "Delete pack"},
			{id: "pack/data-semantics", title: "Workflow pack · Data Semantics", desc: "Operator summary"},
			{id: "agent/main", title: "Main Expert"},
			{id: "agent/analysis", title: "  └─ Analysis Expert"},
		},
	}

	out := a.catalog.view()
	for _, want := range []string{"Pack actions", "activate", "update", "delete", "Workflow", "Workflow pack · Data Semantics", "Main Expert", "└─ Analysis Expert"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expert-pack detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Update pack", "Delete pack"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("expert-pack action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestExpertPackDetailItemsUseExpertHierarchy(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{ID: "data-semantics", Title: "Data Semantics", Scope: "workspace", Enabled: true},
		Agents: []gact.AgentDef{{
			ID: "main", Title: "Main Expert", Source: "expert_pack", Enabled: true,
		}, {
			ID: "analysis", Title: "Analysis Expert", Source: "expert_pack", Enabled: true, ParentID: "main",
		}},
	})

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Main Expert",
		"└─ Analysis Expert",
		"tier 2",
		"reports to Main Expert",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("expert-pack hierarchy missing %q:\n%s", want, joined)
		}
	}
}

func catalogItemByIDForTest(items []catalogItem, id string) catalogItem {
	for _, item := range items {
		if item.id == id {
			return item
		}
	}
	return catalogItem{}
}

func TestCatalogBrowser_ExpertPackDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · Data Semantics",
		expertPackID: "data-semantics",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "expert-pack-action/delete", title: "Delete pack"},
		},
	}

	model, cmd := a.catalog.handleKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("first expert-pack delete press should schedule confirmation hint")
	}
	if a.catalog.current.pendingDeleteExpertPackID != "data-semantics" {
		t.Fatalf("pending expert-pack delete id = %q, want data-semantics", a.catalog.current.pendingDeleteExpertPackID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting data-semantics") {
		t.Fatalf("transient hint = %q, want delete confirmation", a.transientHint)
	}
	if hint := catalogBrowserHintText(a.catalog.current); !strings.Contains(hint, "confirm delete armed") {
		t.Fatalf("armed expert-pack hint = %q", hint)
	}

	model, cmd = a.catalog.handleKey(keyMsg("x"))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("non-confirming key should not dispatch delete")
	}
	if a.catalog.current.pendingDeleteExpertPackID != "" {
		t.Fatalf("pending expert-pack delete should clear on other key, got %q", a.catalog.current.pendingDeleteExpertPackID)
	}
}

func TestExpertPackDetailBlocksInvalidActivation(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{
			ID: "broken", Title: "Broken", Scope: "workspace", Enabled: false,
			Description:      "Invalid pack kept visible for validation diagnostics.",
			ValidationErrors: []string{"parent_id references missing expert"},
		},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want validation, activation, and pack summary", len(items))
	}
	if items[0].id != "activate" || !items[0].disabled || items[0].statusTag != "blocked" {
		t.Fatalf("invalid expert pack activation should be blocked: %#v", items[0])
	}
	for _, want := range []string{"Activation blocked", "cannot activate until validation errors are resolved"} {
		if !strings.Contains(items[0].title+" "+items[0].desc, want) {
			t.Fatalf("blocked activation row missing %q: %#v", want, items[0])
		}
	}
	if strings.Contains(items[1].desc, "select Activate to use this pack") {
		t.Fatalf("invalid pack summary should not advertise activation:\n%s", items[1].desc)
	}
	if !strings.Contains(items[1].desc, "activation: cannot activate until validation errors are resolved") {
		t.Fatalf("invalid pack summary should explain blocked activation:\n%s", items[1].desc)
	}
	validationRow := catalogItemByIDForTest(items, "validation")
	if !strings.Contains(validationRow.desc, "parent_id references missing expert") {
		t.Fatalf("validation row should preserve backend validation evidence: %#v", validationRow)
	}
}

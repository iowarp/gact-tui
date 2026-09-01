package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestExpertPackCatalogItemsSurfaceScopeAndValidation(t *testing.T) {
	items := expertPackCatalogItems([]gact.ExpertPackDefinition{{
		ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace",
		DefinitionPath: "/tmp/.clio/expert-packs/data-semantics/clio-pack.yaml",
		Description:    "Routes data questions to specialist agents.",
		Enabled:        true,
	}, {
		ID: "broken", Title: "Broken", Scope: "session", Enabled: false,
		Description:      "Invalid pack kept visible for validation diagnostics.",
		ValidationErrors: []string{"missing root agent"},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	if items[0].id != "broken" || items[0].statusTag != "invalid" {
		t.Fatalf("invalid expert pack should be first session-scoped invalid row: %#v", items[0])
	}
	for _, want := range []string{"Routes data questions", "ready", "workspace", "v1.0.0"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("expert-pack catalog desc missing %q: %q", want, items[1].desc)
		}
	}
	for _, raw := range []string{"version:", "definition file:"} {
		if strings.Contains(items[1].desc, raw) {
			t.Fatalf("expert-pack catalog desc should not expose raw metadata %q: %q", raw, items[1].desc)
		}
	}
	for _, want := range []string{"ready", "workspace", "v1.0.0"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("expert-pack inline summary missing %q: %q", want, items[1].inlineDesc)
		}
	}
	if strings.Contains(items[1].inlineDesc, "Routes data questions") {
		t.Fatalf("expert-pack inline summary should keep long prose for detail view: %q", items[1].inlineDesc)
	}
	for _, raw := range []string{"invalid ·", "validation error"} {
		if strings.Contains(items[0].inlineDesc, raw) {
			t.Fatalf("invalid expert-pack inline summary should not repeat status/validation chrome %q: %q", raw, items[0].inlineDesc)
		}
	}
	if !strings.Contains(items[0].inlineDesc, "needs fix: missing root agent") {
		t.Fatalf("invalid expert-pack inline summary should include concise validation reason: %q", items[0].inlineDesc)
	}
	if strings.Contains(items[0].inlineDesc, "Invalid pack kept visible") {
		t.Fatalf("invalid expert-pack inline summary should prioritize the repair reason over filler descriptions: %q", items[0].inlineDesc)
	}
	items = expertPackCatalogItems([]gact.ExpertPackDefinition{{
		ID: "broken-parent", Title: "Broken Parent", Scope: "workspace", Enabled: false,
		ValidationErrors: []string{"parent_id references missing expert"},
	}})
	if strings.Contains(items[0].inlineDesc, "parent_id") || !strings.Contains(items[0].inlineDesc, "missing parent expert") {
		t.Fatalf("expert-pack validation reason should use operator text: %q", items[0].inlineDesc)
	}
}

func TestExpertPackCatalogEmptyStateExplainsPurpose(t *testing.T) {
	items := expertPackCatalogItems(nil)
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	if row.disabled || row.statusTag != "empty" {
		t.Fatalf("empty expert-pack row should be non-actionable empty state without disabled chrome: %#v", row)
	}
	combined := catalogItemTestText(items)
	for _, want := range []string{"No expert packs installed", "workflow pack library is empty", "Install workflow pack", "open /agent-blueprints and install from marketplace", "Activate for session", "reopen /expert-packs and activate for session"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty expert-pack checklist missing %q:\n%s", want, combined)
		}
	}
	if intro := catalogBrowserIntro(catalogKindExpertPacks); intro != "" {
		t.Fatalf("expert-pack catalog should keep install guidance in empty rows, not intro chrome, got %q", intro)
	}
	if hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindExpertPacks, items: []catalogItem{{id: "pack", title: "Pack"}}}); !strings.Contains(hint, "Enter details") || strings.Contains(hint, "Enter inspect") {
		t.Fatalf("expert-pack catalog hint should use operator detail wording, got %q", hint)
	}

	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: items,
	}
	hint := catalogBrowserHintText(a.catalog.current)
	for _, want := range []string{"open /agent-blueprints", "install workflow pack", "reopen /expert-packs"} {
		if !strings.Contains(hint, want) {
			t.Fatalf("empty expert-pack hint missing %q, got %q", want, hint)
		}
	}
	if strings.Contains(hint, "/agent-blueprints install workflow packs") {
		t.Fatalf("empty expert-pack hint should route operators to installation path, got %q", hint)
	}
	_, cmd := a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on expert-pack empty state should not dispatch detail load")
	}
	a.catalog.current.sel = 1
	_, cmd = a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on expert-pack empty-state checklist row should not dispatch detail load")
	}
}

func catalogItemTestText(items []catalogItem) string {
	parts := make([]string, 0, len(items)*4)
	for _, item := range items {
		parts = append(parts, item.title, item.desc, item.inlineDesc, item.statusTag)
	}
	return strings.Join(parts, "\n")
}

func TestExpertPackCatalogInstallShortcutOpensSourceModal(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: []catalogItem{{id: "pack/data-semantics", title: "Data Semantics"}},
	}

	model, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: 'i', Text: "i"})
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("install shortcut should only open modal, got cmd %T", cmd)
	}
	if !a.expertPackInstall.open || !a.catalog.open {
		t.Fatalf("expert-pack install modal/catalog open = %v/%v", a.expertPackInstall.open, a.catalog.open)
	}
}

func TestExpertPackInstallRequiresSource(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.expertPackInstall.openModal()

	model, cmd := a.expertPackInstall.handleKey(keyMsg("enter"))
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("empty install source should not dispatch cmd %T", cmd)
	}
	if got := a.expertPackInstall.err; got != "install source is required" {
		t.Fatalf("install error = %q", got)
	}
}

func TestExpertPackInstallFailureStaysInModalWithOperatorMessage(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.expertPackInstall.openModal()
	a.expertPackInstall.saving = true
	err := &client.Error{Status: 502, Code: "install_failed", Message: "expert pack install failed: manifest clio-pack.yaml was not found"}

	model, cmd := a.Update(expertPackManagedMsg{action: "install", err: err})
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("failed install should not schedule follow-up cmd %T", cmd)
	}
	if !a.expertPackInstall.open || a.expertPackInstall.saving {
		t.Fatalf("failed install modal open/saving = %v/%v", a.expertPackInstall.open, a.expertPackInstall.saving)
	}
	if got := a.expertPackInstall.err; got != "expert pack install failed: manifest clio-pack.yaml was not found" {
		t.Fatalf("install error = %q", got)
	}
	if strings.Contains(a.expertPackInstall.err, "install_failed") || strings.Contains(a.expertPackInstall.err, "gact:") {
		t.Fatalf("install error leaked backend wrapper: %q", a.expertPackInstall.err)
	}
}

func TestExpertPackManagedLabelUsesLifecycleResultID(t *testing.T) {
	got := expertPackManagedLabel(expertPackManagedMsg{
		action: "install",
		result: map[string]any{
			"installed": map[string]any{
				"id":     "data-semantics",
				"source": "git@example.org:data-semantics.git",
			},
		},
	})
	if got != "data-semantics" {
		t.Fatalf("managed label = %q, want installed pack id", got)
	}

	got = expertPackManagedLabel(expertPackManagedMsg{
		action: "install",
		result: map[string]any{
			"installed": map[string]any{"source": "git@example.org:data-semantics.git"},
		},
	})
	if got != "git@example.org:data-semantics.git" {
		t.Fatalf("managed label = %q, want installed source fallback", got)
	}
}

func TestCatalogBrowserShowsTransientOperationStatus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.transientHint = "expert pack installed: data-semantics"
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: []catalogItem{{id: "pack/data-semantics", title: "Data Semantics", statusTag: "workspace"}},
	}

	out := a.catalog.view()
	if !strings.Contains(out, "Status: expert pack installed: data-semantics") {
		t.Fatalf("catalog browser should surface transient operation status:\n%s", out)
	}
}

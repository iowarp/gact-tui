package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentBlueprintCatalogItemsSurfaceRuntimeMetadata(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "data-exploration", Title: "Data Exploration", Version: "1.0.0", Scope: "builtin",
		RootExpert: "data", DefinitionPath: "/tmp/AGENT.md", Description: "Markdown root agent.",
		Enabled: true,
	}, {
		ID: "broken", Title: "Broken", Scope: "workspace", RootExpert: "missing", Enabled: false,
		ValidationErrors: []string{"root_expert not found"},
	}})

	if len(items) != 4 {
		t.Fatalf("items len = %d, want provider + child rows for built-in and workspace", len(items))
	}
	if items[0].id != "provider/built-in" || items[1].id != "data-exploration" || items[2].id != "provider/workspace" || items[3].id != "broken" {
		t.Fatalf("provider-grouped items = %#v", items)
	}
	if items[3].statusTag != "invalid" {
		t.Fatalf("broken blueprint status = %q, want invalid", items[3].statusTag)
	}
	for _, want := range []string{"version: 1.0.0", "root expert: data", "definition file: /tmp/AGENT.md", "Markdown root agent"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint desc missing %q: %q", want, items[1].desc)
		}
	}
}

func TestAgentBlueprintCatalogRowsOmitRepeatedTitleDescriptions(t *testing.T) {
	blueprint := gact.AgentBlueprintDefinition{
		ID: "data-semantics-agents", Title: "Data Semantics Agents.", Description: "Data Semantics Agents",
		Version: "0.9.0", Scope: "workspace", RootExpert: "main", Enabled: true,
	}
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{blueprint})
	if len(items) != 2 {
		t.Fatalf("items len = %d, want provider and blueprint row: %#v", len(items), items)
	}
	row := items[1]
	if strings.Contains(row.desc, "Data Semantics Agents") {
		t.Fatalf("blueprint list row should not repeat the title as description:\n%#v", row)
	}
	for _, want := range []string{"version: 0.9.0", "root expert: main"} {
		if !strings.Contains(row.desc, want) {
			t.Fatalf("blueprint row should keep useful metadata %q:\n%s", want, row.desc)
		}
	}

	detailItems := agentBlueprintDetailItems(gact.AgentBlueprintDetail{AgentBlueprint: blueprint})
	var summary catalogItem
	for _, item := range detailItems {
		if item.id == "blueprint/data-semantics-agents" {
			summary = item
			break
		}
	}
	if summary.id == "" {
		t.Fatalf("detail items missing blueprint summary: %#v", detailItems)
	}
	if strings.Contains(summary.desc, "\nDescription\n") {
		t.Fatalf("blueprint detail should omit redundant Description section:\n%s", summary.desc)
	}
	if !strings.Contains(summary.desc, "workflow: Data Semantics Agents.") {
		t.Fatalf("blueprint detail should still identify the workflow by title:\n%s", summary.desc)
	}
}

func TestAgentBlueprintCatalogItemsSurfaceSourceProvenance(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "seismic-market", Title: "Seismic Marketplace", Version: "1.2.0", Scope: "workspace",
		RootExpert: "orchestrator", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/seismic-agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"commit":       "0123456789abcdef",
			"checksum":     "abcdef0123456789",
			"installed_at": "2026-06-02T20:00:00Z",
			"scope":        "workspace",
		}},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 1 blueprint row plus 1 source row", len(items))
	}
	if items[0].id != "source/0" || items[0].title != "Source · community/seismic-agents" {
		t.Fatalf("source row missing or wrong: %#v", items[0])
	}
	if strings.Contains(items[0].title, "git ·") {
		t.Fatalf("source row title should not repeat source kind already shown as status: %#v", items[0])
	}
	if items[1].id != "seismic-market" || !strings.Contains(items[1].title, "└─ Seismic Marketplace") {
		t.Fatalf("source-owned blueprint should render as a child row, got %#v", items[1])
	}
	for _, want := range []string{"branch main", "1 blueprint"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("source row inline summary missing %q: %#v", want, items)
		}
	}
	if items[0].statusTag != "available" {
		t.Fatalf("source row should surface marketplace availability, got %#v", items[0])
	}
	for _, notWant := range []string{"ref main", "commit", "0123456789ab", "blueprint(s)", "synced"} {
		if strings.Contains(items[0].inlineDesc, notWant) {
			t.Fatalf("source row inline summary leaked backend wording %q: %#v", notWant, items)
		}
	}
	if !strings.Contains(items[1].inlineDesc, "v1.2.0") || !strings.Contains(items[1].inlineDesc, "installed") {
		t.Fatalf("source-backed rows should expose compact inline summaries: %#v", items)
	}
	for _, notWant := range []string{"version 1.2.0", "root expert orchestrator", "entry orchestrator", "starts at", "ref main", "commit 01234567"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("blueprint inline summary leaked backend wording %q: %#v", notWant, items[1])
		}
	}
	for _, want := range []string{
		"ref: main",
		"commit: 0123456789abcdef",
		"checksum: abcdef0123456789",
		"blueprints: Seismic Marketplace",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("source row desc missing %q:\n%s", want, items[0].desc)
		}
	}
	if strings.Contains(items[0].desc, `"install"`) {
		t.Fatalf("source row should be structured, not raw JSON:\n%s", items[0].desc)
	}
	for _, want := range []string{
		"marketplace state: installed",
		"source: git",
		"from: https://example.org/community/seismic-agents.git",
		"ref: main",
		"commit: 0123456789ab",
		"checksum: abcdef012345",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint provenance desc missing %q: %q", want, items[1].desc)
		}
	}
}

func TestAgentBlueprintCatalogItemsMarkActiveBlueprintInTree(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "seismic-market", Title: "Seismic Marketplace", Version: "1.2.0", Scope: "workspace",
		RootExpert: "main", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/seismic-agents.git",
			"source_kind": "git",
		}},
	}})
	items = markActiveAgentBlueprintCatalogItems(items, "seismic-market", "session")

	if len(items) != 2 {
		t.Fatalf("items len = %d, want source and blueprint rows", len(items))
	}
	row := items[1]
	if row.id != "seismic-market" || !strings.Contains(row.title, "└─ ◆ Seismic Marketplace") {
		t.Fatalf("active blueprint should keep tree indentation and marker: %#v", row)
	}
	if strings.Contains(row.title, "Active ·") {
		t.Fatalf("active blueprint title should use a compact marker, not repeat active text: %#v", row)
	}
	if row.statusTag != "active" || strings.Contains(row.inlineDesc, "active in selected session") {
		t.Fatalf("active blueprint row should use the status tag without repeated prose: %#v", row)
	}
}

func TestAgentBlueprintSourceRowsSurfaceFailureState(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "stale-market", Title: "Stale Marketplace", Version: "0.9.0", Scope: "workspace",
		RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":              "https://example.org/community/stale-agents.git",
			"source_kind":         "git",
			"ref":                 "release",
			"status":              "sync_failed",
			"status_message":      "last sync failed",
			"trust":               "community",
			"last_synced_at":      "2026-06-02T19:00:00Z",
			"validation_warnings": []any{"source has not been synced in 7 days"},
			"last_error":          "git fetch exited 128",
			"scope":               "workspace",
		}},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want blueprint row plus source row", len(items))
	}
	source := items[0]
	if source.statusTag != "attention" {
		t.Fatalf("source status = %q, want attention: %#v", source.statusTag, source)
	}
	for _, want := range []string{
		"status: sync_failed",
		"status message: last sync failed",
		"trust: community",
		"last synced: 2026-06-02T19:00:00Z",
		"Warnings",
		"source has not been synced in 7 days",
		"Validation",
		"git fetch exited 128",
	} {
		if !strings.Contains(source.desc, want) {
			t.Fatalf("source failure detail missing %q:\n%s", want, source.desc)
		}
	}
	if strings.Contains(source.desc, `"install"`) || strings.Contains(source.desc, `"last_error"`) {
		t.Fatalf("source failure row should be structured, not raw JSON:\n%s", source.desc)
	}
}

func TestAgentBlueprintCatalogItemsGroupSourceBackedBlueprints(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "builtin", Title: "Bundled Blueprint", Scope: "builtin", RootExpert: "root", Enabled: true,
	}, {
		ID: "available", Title: "Available Marketplace", Scope: "marketplace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/agents.git",
			"source_kind": "git",
			"ref":         "main",
			"scope":       "marketplace",
		}},
	}, {
		ID: "installed", Title: "Installed Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
			"scope":        "workspace",
		}},
	}})

	if len(items) != 5 {
		t.Fatalf("items len = %d, want one source group, two marketplace rows, one built-in provider, and one bundled row: %#v", len(items), items)
	}
	for i, wantID := range []string{"source/0", "available", "installed", "provider/built-in", "builtin"} {
		if items[i].id != wantID {
			t.Fatalf("items[%d].id = %q, want %q; items=%#v", i, items[i].id, wantID, items)
		}
	}
	if !strings.Contains(items[1].desc, "marketplace state: available") {
		t.Fatalf("available marketplace row missing state:\n%s", items[1].desc)
	}
	if items[1].statusTag != "available" {
		t.Fatalf("available marketplace row status = %q, want available: %#v", items[1].statusTag, items[1])
	}
	if !strings.Contains(items[2].desc, "marketplace state: installed") {
		t.Fatalf("installed marketplace row missing state:\n%s", items[2].desc)
	}
	if items[2].statusTag != "installed" {
		t.Fatalf("installed marketplace row status = %q, want installed: %#v", items[2].statusTag, items[2])
	}
	if !strings.Contains(items[0].desc, "blueprints: Available Marketplace") ||
		!strings.Contains(items[0].desc, "Installed Marketplace") ||
		!strings.Contains(items[0].desc, "scope: marketplace, workspace") {
		t.Fatalf("source rows should describe grouped blueprints: %#v", items)
	}
	if !strings.Contains(items[0].desc, "blueprint states:") ||
		!strings.Contains(items[0].desc, "Available Marketplace (available)") ||
		!strings.Contains(items[0].desc, "Installed Marketplace (installed)") {
		t.Fatalf("source rows should describe per-blueprint install state:\n%s", items[0].desc)
	}
}

func TestAgentBlueprintCatalogItemsSurfaceLifecycleStatusTags(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "stale", Title: "Stale Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":         "https://example.org/community/agents.git",
			"source_kind":    "git",
			"ref":            "main",
			"status":         "update available",
			"status_message": "new commit available",
			"installed_at":   "2026-06-03T07:00:00Z",
		}},
	}, {
		ID: "warning", Title: "Warning Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		ValidationWarnings: []string{"descriptor requires explicit trust"},
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
		}},
	}, {
		ID: "invalid", Title: "Invalid Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		ValidationErrors: []string{"missing root expert"},
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
		}},
	}})

	if len(items) != 4 {
		t.Fatalf("items len = %d, want one source group and three blueprint rows: %#v", len(items), items)
	}
	want := map[string]string{
		"stale":   "update_available",
		"warning": "warning",
		"invalid": "invalid",
	}
	for _, item := range items {
		if expected, ok := want[item.id]; ok && item.statusTag != expected {
			t.Fatalf("%s status = %q, want %q: %#v", item.id, item.statusTag, expected, item)
		}
	}
	if !strings.Contains(items[1].desc, "marketplace state: installed") {
		t.Fatalf("lifecycle row should keep install state in description:\n%s", items[1].desc)
	}
}

func TestAgentBlueprintCatalogAndDetailSurfaceValidationWarnings(t *testing.T) {
	blueprint := gact.AgentBlueprintDefinition{
		ID: "community-warning", Title: "Community Warning", Version: "0.9.0", Scope: "workspace",
		RootExpert: "root", Enabled: true,
		ValidationWarnings: []string{
			"descriptor requires explicit trust before install",
			"skill ndp resolved from community source",
		},
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/warning-agents.git",
			"source_kind": "git",
			"ref":         "main",
		}},
	}

	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{blueprint})
	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "attention" {
		t.Fatalf("source row should use attention status for grouped warning-only blueprint: %#v", items[0])
	}
	if !strings.Contains(items[0].desc, "community-warning: descriptor requires explicit trust before install") {
		t.Fatalf("source row should summarize grouped blueprint warnings:\n%s", items[0].desc)
	}
	if items[1].id != "community-warning" || items[1].statusTag != "warning" {
		t.Fatalf("warning-only blueprint should use warning status: %#v", items)
	}
	if !strings.Contains(items[1].inlineDesc, "2 warnings") || strings.Contains(items[1].inlineDesc, "warning(s)") {
		t.Fatalf("warning-only blueprint inline summary should use natural pluralization: %#v", items[1])
	}
	for _, want := range []string{
		"warnings: descriptor requires explicit trust before install; skill ndp resolved from community source",
		"source: git",
		"from: https://example.org/community/warning-agents.git",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint catalog row missing %q:\n%s", want, items[1].desc)
		}
	}

	detailItems := agentBlueprintDetailItems(gact.AgentBlueprintDetail{AgentBlueprint: blueprint})
	var hasSummaryWarnings, hasWarningRow bool
	for _, item := range detailItems {
		switch item.id {
		case "blueprint/community-warning":
			hasSummaryWarnings = strings.Contains(item.desc, "Validation warnings") &&
				strings.Contains(item.desc, "descriptor requires explicit trust before install") &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		case "validation-warnings":
			hasWarningRow = item.statusTag == "warning" &&
				strings.Contains(item.desc, "descriptor requires explicit trust before install") &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		}
	}
	if !hasSummaryWarnings || !hasWarningRow {
		t.Fatalf("blueprint detail missing validation warnings: %#v", detailItems)
	}
}

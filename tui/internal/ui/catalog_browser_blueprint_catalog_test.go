package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestCatalogBrowser_EnterOnAgentBlueprintSourceOpensSourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:    "source/0",
			title: "Source · git · https://example.org/community/seismic-agents.git",
			desc:  "Marketplace Source\nsource: https://example.org/community/seismic-agents.git\nblueprints: Seismic Marketplace",
		}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("source detail should open locally without backend command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("source row should open detail view")
	}
	if !strings.Contains(a.detail.ref.fullText, "blueprints: Seismic Marketplace") {
		t.Fatalf("source detail missing blueprint list:\n%s", a.detail.ref.fullText)
	}
}

func TestCatalogBrowser_EnterOnAgentBlueprintSourceRegistryOpensSourceBrowser(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:        "action/source-registry",
			title:     "Marketplace sources",
			desc:      "Browse configured marketplace sources and install blueprints from them.",
			statusTag: "sources",
		}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("source registry row should load marketplace sources")
	}
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.kind != catalogKindAgentBlueprintSources {
		t.Fatalf("source registry should switch to source browser, got %#v", a.catalog.current)
	}
	if a.catalog.current.parent == nil || a.catalog.current.parent.kind != catalogKindAgentBlueprints {
		t.Fatalf("source browser should retain parent catalog, got %#v", a.catalog.current.parent)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceRegistryItemsExposeActions(t *testing.T) {
	items := agentBlueprintSourceRegistryItems([]gact.AgentBlueprintSource{{
		ID:           "src1",
		Name:         "Data Semantics Agents",
		Source:       "git@github.com:example/agents.git",
		SourceKind:   "git",
		Ref:          "main",
		PinnedCommit: "abcdef123456",
		Status:       "ready",
		AvailableBlueprints: []gact.AgentBlueprintDefinition{{
			ID:         "seismic-waveform-review",
			Title:      "Seismic Waveform Review",
			Version:    "0.1.0",
			RootExpert: "orchestrator",
			Scope:      "marketplace",
			Enabled:    true,
		}},
	}})
	if len(items) != 2 {
		t.Fatalf("items len = %d, want source row and blueprint row: %#v", len(items), items)
	}
	if items[0].id != "source/src1" || items[0].statusTag != "ready" {
		t.Fatalf("source row = %#v", items[0])
	}
	if items[0].title != "▾ Data Semantics Agents" {
		t.Fatalf("source row title should be the source name, got %#v", items[0])
	}
	for _, want := range []string{"Git marketplace", "branch main", "ready", "pinned abcdef12", "1 available"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("source row inline summary missing %q:\n%#v", want, items[0])
		}
	}
	for _, notWant := range []string{"git repository", "git source", "ref main", "status ready", "commit abcdef", "1 blueprint"} {
		if strings.Contains(items[0].inlineDesc, notWant) {
			t.Fatalf("source row inline summary leaked backend wording %q:\n%#v", notWant, items[0])
		}
	}
	for _, want := range []string{
		"Marketplace connection",
		"name: Data Semantics Agents",
		"status: ready",
		"available: 1 blueprint",
		"Repository",
		"url: git@github.com:example/agents.git",
		"type: git",
		"branch: main",
		"pinned revision: abcdef123456",
		"Registry",
		"registry id: src1",
		"Operator paths",
		"refresh source",
		"install blueprint",
		"remove source",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("source row missing %q:\n%s", want, items[0].desc)
		}
	}
	for _, raw := range []string{"Source summary", "Marketplace source", "location:", "kind:", "branch/ref:", "current commit:", "pinned commit:", "available blueprints:", "source id:", "last updated:", "added to registry:", "\n  commit: abcdef"} {
		if strings.Contains(items[0].desc, raw) {
			t.Fatalf("source row detail leaked backend label %q:\n%s", raw, items[0].desc)
		}
	}
	for _, raw := range []string{"press r", "press d", "press Enter"} {
		if strings.Contains(items[0].desc, raw) {
			t.Fatalf("source row should keep keypress prose out of the body, found %q:\n%s", raw, items[0].desc)
		}
	}
	if items[1].id != "source-blueprint/src1/seismic-waveform-review" || items[1].statusTag != "0.1.0" {
		t.Fatalf("blueprint row = %#v", items[1])
	}
	if !strings.Contains(items[1].title, "Seismic Waveform Review") || strings.Contains(items[1].title, "Install") {
		t.Fatalf("source-registry blueprint row should be content, not an action label: %#v", items[1])
	}
	if items[1].inlineDesc != "available to install" {
		t.Fatalf("source-registry blueprint row should keep hierarchy compact: %#v", items[1])
	}
	for _, notWant := range []string{"v0.1.0", "version 0.1.0", "starts at", "orchestrator"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("source-registry blueprint row leaked noisy metadata %q: %#v", notWant, items[1])
		}
	}
	sourceID, blueprintID, ok := parseSourceBlueprintItemID(items[1].id)
	if !ok || sourceID != "src1" || blueprintID != "seismic-waveform-review" {
		t.Fatalf("parseSourceBlueprintItemID = %q, %q, %v", sourceID, blueprintID, ok)
	}
	cb := &catalogBrowserState{kind: catalogKindAgentBlueprintSources, items: items, sel: 0}
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter source details") || strings.Contains(hint, "details/install") {
		t.Fatalf("source row hint should be specific, got %q", hint)
	}
	cb.sel = 1
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter install selected blueprint") || strings.Contains(hint, "details/install") {
		t.Fatalf("blueprint row hint should be specific, got %q", hint)
	}
	if hint := catalogBrowserHintText(cb); strings.Contains(hint, "d remove") || strings.Contains(hint, "r refresh") {
		t.Fatalf("blueprint row hint should not expose source management actions, got %q", hint)
	}
}

func TestAgentBlueprintSourceRegistryEmptyStatePointsToAddSourceFlow(t *testing.T) {
	items := agentBlueprintSourceRegistryItems(nil)
	if len(items) != 1 {
		t.Fatalf("empty source registry items = %#v, want one guidance row", items)
	}
	row := items[0]
	if row.id != "source/none" || row.statusTag != "empty" || !row.disabled {
		t.Fatalf("empty source registry row = %#v", row)
	}
	for _, want := range []string{"Add marketplace source", "register a source URL", "install a provided blueprint"} {
		if !strings.Contains(row.desc, want) {
			t.Fatalf("empty source guidance missing %q:\n%s", want, row.desc)
		}
	}
	for _, unwanted := range []string{"through CLIO", "source registry unsupported", "unsupported"} {
		if strings.Contains(row.desc, unwanted) {
			t.Fatalf("empty source guidance leaked stale wording %q:\n%s", unwanted, row.desc)
		}
	}
}

func TestAgentBlueprintCatalogStressItemsPreserveHierarchyAndActiveMarker(t *testing.T) {
	blueprints := []gact.AgentBlueprintDefinition{{
		ID:         "active-long",
		Version:    "0.9.0",
		Title:      "San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		Scope:      "workspace",
		RootExpert: "orchestrator",
		Enabled:    true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://aaa.example.org/very-long-source.git",
			"source_kind": "git",
			"status":      "installed",
		}},
	}, {
		ID:         "disabled-long",
		Version:    "0.8.0",
		Title:      "Disabled Benchmark Blueprint With Long Title",
		Scope:      "workspace",
		RootExpert: "orchestrator",
		Enabled:    false,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://bbb.example.org/disabled-source.git",
			"source_kind": "git",
			"status":      "disabled",
		}},
	}}
	items := markActiveAgentBlueprintCatalogItems(agentBlueprintCatalogItems(blueprints), "active-long", "workspace")

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Source · very-long-source",
		"└─ ◆ San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		"Source · disabled-source",
		"Disabled Benchmark Blueprint With Long Title",
		"disabled",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("stress catalog items missing %q:\n%s", want, joined)
		}
	}
}

func TestAgentBlueprintDetailStressItemsPreserveNestedExperts(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID:         "bp",
			Title:      "Nested Blueprint",
			Scope:      "workspace",
			RootExpert: "orchestrator",
			Enabled:    true,
		},
		Agents: []gact.AgentDef{{
			ID: "orchestrator", Title: "Orchestrator", Source: "agent_blueprint", Enabled: true, Tier: 1,
		}, {
			ID: "data", Title: "Data Resolver", Source: "agent_blueprint", Enabled: true, ParentID: "orchestrator", Tier: 2,
		}, {
			ID: "catalog", Title: "Catalog Specialist", Source: "agent_blueprint", Enabled: true, ParentID: "data", Tier: 3,
		}, {
			ID: "plot", Title: "Visualization Publisher", Source: "agent_blueprint", Enabled: true, ParentID: "catalog", Tier: 4,
		}},
	})

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Orchestrator",
		"└─ Data Resolver",
		"└─ Catalog Specialist",
		"└─ Visualization Publisher",
		"tier 3",
		"reports to Catalog Specialist",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("nested blueprint detail items missing %q:\n%s", want, joined)
		}
	}
}

func TestAgentCatalogStressItemsPreserveDeepHierarchy(t *testing.T) {
	agents := []gact.AgentDef{{
		ID: "orchestrator", Title: "Demo Orchestrator", Source: "recipe", Enabled: true, Tier: 1,
	}, {
		ID: "geo", Title: "Geographic Resolver", Source: "recipe", Enabled: true, ParentID: "orchestrator", Tier: 2,
	}, {
		ID: "earthscope", Title: "EarthScope Catalog", Source: "recipe", Enabled: true, ParentID: "geo", Tier: 3,
	}, {
		ID: "sac", Title: "SAC Trace Reviewer", Source: "recipe", Enabled: true, ParentID: "earthscope", Tier: 4,
	}, {
		ID: "plot", Title: "Waveform Plot Publisher", Source: "recipe", Enabled: true, ParentID: "sac", Tier: 5,
	}, {
		ID: "invalid", Title: "Invalid Disabled Expert", Source: "recipe", Enabled: false,
		ValidationErrors: []string{"missing required tool: ndp_stage_resource"},
	}}

	items := agentCatalogItems(agents, catalogKindAgents)
	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Demo Orchestrator",
		"└─ Geographic Resolver",
		"└─ EarthScope Catalog",
		"└─ SAC Trace Reviewer",
		"└─ Waveform Plot Publisher",
		"tier 5",
		"reports to SAC Trace Reviewer",
		"Invalid Disabled Expert",
		"missing required tool",
		"invalid",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("agent stress catalog items missing %q:\n%s", want, joined)
		}
	}
}

func TestCatalogBrowser_AgentBlueprintActionsAreNotListRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:        "source/0",
			title:     "Marketplace · demo",
			desc:      "source detail",
			statusTag: "available",
		}, {
			id:        "seismic-waveform-review",
			title:     "Seismic Waveform Review",
			desc:      "review seismic waveforms",
			statusTag: "workspace",
		}},
	}

	out := a.catalog.view()
	for _, want := range []string{"Blueprint library", "Marketplace", "Seismic Waveform Review", "Enter", "s sources", "i manual install", "v validate file"} {
		if !strings.Contains(out, want) {
			t.Fatalf("blueprint browser missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Blueprint actions", "install source  validate source", "Install agent blueprint", "Validate agent blueprint", "Installed and available blueprints"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("management action leaked into catalog rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestAgentBlueprintCatalogGroupsBlueprintsBySourceAndProvider(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{
		{
			ID:      "workspace-broken",
			Title:   "Broken Blueprint",
			Scope:   "workspace",
			Enabled: false,
		},
		{
			ID:      "builtin-data",
			Title:   "Data Exploration",
			Scope:   "builtin",
			Enabled: true,
		},
		{
			ID:      "seismic-marketplace",
			Title:   "Seismic Marketplace",
			Scope:   "workspace",
			Enabled: true,
			Metadata: map[string]any{"install": map[string]any{
				"source":      "https://example.org/community/seismic-agents.git",
				"source_kind": "git",
				"ref":         "main",
				"status":      "installed",
			}},
		},
	})

	got := make([]string, 0, len(items))
	for _, item := range items {
		got = append(got, item.title)
	}
	joined := strings.Join(got, "\n")
	for _, want := range []string{
		"Source · community/seismic-agents",
		"  └─ Seismic Marketplace",
		"Built-in blueprints",
		"  └─ Data Exploration",
		"Workspace blueprints",
		"  └─ Broken Blueprint",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("grouped blueprint catalog missing %q:\n%s", want, joined)
		}
	}
	if strings.Index(joined, "Built-in blueprints") > strings.Index(joined, "Workspace blueprints") {
		t.Fatalf("built-in provider should sort before workspace provider:\n%s", joined)
	}
}

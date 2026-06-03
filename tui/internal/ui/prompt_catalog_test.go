package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestPromptCatalogItemsSurfaceProfilesAndValidation(t *testing.T) {
	items := promptCatalogItems([]gact.PromptDefinition{{
		ID:               "clio.chat",
		Title:            "Chat",
		Description:      "General conversation",
		DefaultProfile:   "default",
		Scope:            "builtin",
		ValidationErrors: []string{"bad override"},
		Profiles: map[string]gact.PromptProfile{
			"default": {Name: "default", Text: "base", Scope: "builtin"},
			"debug":   {Name: "debug", Text: "debug", Scope: "global"},
		},
	}})

	if len(items) != 1 {
		t.Fatalf("items len = %d, want 1", len(items))
	}
	for _, want := range []string{"profiles: debug, default", "default: default", "errors: bad override", "General conversation"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("prompt catalog desc missing %q: %q", want, items[0].desc)
		}
	}
}

func TestPromptAndBlueprintCommandsArePaletteDiscoverableWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.XClioPromptRegistry = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.caps.Capabilities.XClioAgentBlueprints = true

	for _, tc := range []struct {
		filter string
		id     string
	}{
		{filter: "prompts", id: "/prompts"},
		{filter: "expert-packs", id: "/expert-packs"},
		{filter: "agent-blueprints", id: "/agent-blueprints"},
		{filter: "blueprints", id: "/blueprints"},
		{filter: "agent-blueprint-install", id: "/agent-blueprint-install"},
		{filter: "agent-blueprint-validate", id: "/agent-blueprint-validate"},
	} {
		a.paletteFilter = tc.filter
		found := false
		for _, cmd := range a.paletteMatches() {
			if cmd.ID == tc.id {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("palette filter %q did not include %s", tc.filter, tc.id)
		}
	}
}

func TestAgentBlueprintManageModalUsesSharedTextEntrySemantics(t *testing.T) {
	a := newReadyApp(nil, nil)

	a.openAgentBlueprintManage(agentBlueprintManageInstall)
	installView := ansi.Strip(a.viewAgentBlueprintManage())
	for _, want := range []string{"Install agent blueprint", "install", "current workspace"} {
		if !strings.Contains(installView, want) {
			t.Fatalf("install modal missing %q:\n%s", want, installView)
		}
	}

	a.openAgentBlueprintManage(agentBlueprintManageValidate)
	_, _ = a.handleAgentBlueprintManageKey(keyMsg("/"))
	if a.agentBlueprintManageInput != "/" {
		t.Fatalf("slash-prefixed paths should be editable, input=%q", a.agentBlueprintManageInput)
	}
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	_, _ = a.Update(tea.PasteMsg{Content: "/workspace/My Blueprint/\r\nAGENT.md\n"})
	if a.agentBlueprintManageInput != "/workspace/My Blueprint/AGENT.md" {
		t.Fatalf("paste should route to blueprint modal, input=%q", a.agentBlueprintManageInput)
	}
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	validateView := ansi.Strip(a.viewAgentBlueprintManage())
	for _, want := range []string{"Validate agent blueprint", "validate", "without", "installing"} {
		if !strings.Contains(validateView, want) {
			t.Fatalf("validate modal missing %q:\n%s", want, validateView)
		}
	}

	_, _ = a.handleAgentBlueprintManageKey(keyMsg("enter"))
	if !strings.Contains(a.agentBlueprintManageErr, "required") {
		t.Fatalf("empty validate submit should surface a truthful error, got %q", a.agentBlueprintManageErr)
	}
}

func TestAgentBlueprintManageButtonsUseSemanticHitTargets(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentBlueprintManage(agentBlueprintManageValidate)

	a.beginHitFrame()
	modal := a.viewAgentBlueprintManage()
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
	if !a.agentBlueprintManageOpen {
		t.Fatal("empty validate click should keep modal open")
	}
	if !strings.Contains(a.agentBlueprintManageErr, "required") {
		t.Fatalf("empty validate click should surface required error, got %q", a.agentBlueprintManageErr)
	}

	a.beginHitFrame()
	_ = a.viewAgentBlueprintManage()
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
	if a.agentBlueprintManageOpen {
		t.Fatal("cancel click should close blueprint manage modal")
	}
}

func TestFormatResolvedPromptShowsProvenanceAndText(t *testing.T) {
	out := formatResolvedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "debug", Scope: "global", SourcePath: "/tmp/prompt.md",
		Provider: "openai", Model: "gpt-5", Checksum: "abc123", FallbackProfile: "default",
		Text: "Stay grounded.", Metadata: map[string]any{"saved_by": "test"},
	})

	for _, want := range []string{
		"fallback profile: default",
		"provider: openai",
		"model: gpt-5",
		"source: /tmp/prompt.md",
		"saved_by",
		"Stay grounded.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resolved prompt detail missing %q:\n%s", want, out)
		}
	}
}

func TestFormatRenderedPromptValidationAndReload(t *testing.T) {
	rendered := formatRenderedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "heavy", Scope: "workspace", SourcePath: "/tmp/prompt.md",
		Checksum: "abc", Text: "Rendered body", Metadata: map[string]any{"session_id": "s1"},
	})
	for _, want := range []string{"Rendered runtime prompt", "checksum: abc", "Render provenance", "Rendered body"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered prompt missing %q:\n%s", want, rendered)
		}
	}

	validation := formatPromptValidation(gact.PromptValidationResult{
		Enabled: false, ValidationErrors: []string{"unknown placeholder"},
		Prompt: gact.PromptDefinition{ID: "clio.chat", Scope: "workspace"},
	})
	for _, want := range []string{"status: invalid", "unknown placeholder", "prompt_id: clio.chat"} {
		if !strings.Contains(validation, want) {
			t.Fatalf("validation missing %q:\n%s", want, validation)
		}
	}

	reload := formatPromptReload(gact.PromptReloadResult{
		PromptCount: 2, PromptIDs: []string{"a", "b"}, Sources: []gact.PromptSource{{Scope: "workspace", Root: "/repo/.clio/prompts"}},
	})
	for _, want := range []string{"prompt_count: 2", "prompt_ids: a, b", "workspace: /repo/.clio/prompts"} {
		if !strings.Contains(reload, want) {
			t.Fatalf("reload missing %q:\n%s", want, reload)
		}
	}
}

func TestAgentPromptResolutionDescription(t *testing.T) {
	got := agentPromptResolutionDescription(gact.AgentDef{Metadata: map[string]any{
		"prompt_resolution": map[string]any{
			"id": "clio.expert.data", "profile": "heavy", "scope": "global", "status": "resolved",
			"provider": "openai", "model": "gpt-5",
		},
	}})
	for _, want := range []string{"id: clio.expert.data", "profile: heavy", "scope: global", "status: resolved", "provider: openai", "model: gpt-5"} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt resolution missing %q: %q", want, got)
		}
	}
}

func TestPromptEditModalStatesBuiltinOverrideScope(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openPromptEdit("clio.chat", "default", "Chat", "Use grounded answers.")
	out := a.viewPromptEdit()
	for _, want := range []string{"Edit prompt override · clio.chat", "profile codex", "Use grounded answers."} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt edit modal missing %q:\n%s", want, out)
		}
	}
}

func TestExpertPackCatalogItemsSurfaceScopeAndValidation(t *testing.T) {
	items := expertPackCatalogItems([]gact.ExpertPackDefinition{{
		ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace",
		DefinitionPath: "/tmp/.clio/expert-packs/data-semantics/clio-pack.yaml",
		Description:    "Routes data questions to specialist agents.",
		Enabled:        true,
	}, {
		ID: "broken", Title: "Broken", Scope: "session", Enabled: false,
		ValidationErrors: []string{"missing root agent"},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	if items[0].id != "broken" || items[0].statusTag != "invalid" {
		t.Fatalf("invalid expert pack should be first session-scoped invalid row: %#v", items[0])
	}
	for _, want := range []string{"version: 1.0.0", "definition: /tmp/.clio/expert-packs/data-semantics/clio-pack.yaml", "Routes data questions"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("expert-pack catalog desc missing %q: %q", want, items[1].desc)
		}
	}
}

func TestAgentBlueprintCatalogItemsSurfaceRuntimeMetadata(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "data-exploration", Title: "Data Exploration", Version: "1.0.0", Scope: "builtin",
		RootExpert: "data", DefinitionPath: "/tmp/AGENT.md", Description: "Markdown root agent.",
		Enabled: true,
	}, {
		ID: "broken", Title: "Broken", Scope: "workspace", RootExpert: "missing", Enabled: false,
		ValidationErrors: []string{"root_expert not found"},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	if items[1].statusTag != "invalid" {
		t.Fatalf("broken blueprint status = %q, want invalid", items[1].statusTag)
	}
	for _, want := range []string{"version: 1.0.0", "root: data", "definition: /tmp/AGENT.md", "Markdown root agent"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("blueprint desc missing %q: %q", want, items[0].desc)
		}
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
	for _, want := range []string{
		"source: git",
		"from: https://example.org/community/seismic-agents.git",
		"ref: main",
		"commit: 0123456789ab",
		"checksum: abcdef012345",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("blueprint provenance desc missing %q: %q", want, items[0].desc)
		}
	}
	if items[1].id != "source/0" || items[1].title != "Marketplace source · git · https://example.org/community/seismic-agents.git" {
		t.Fatalf("source row missing or wrong: %#v", items[1])
	}
	for _, want := range []string{
		"Marketplace Source",
		"source: https://example.org/community/seismic-agents.git",
		"source_kind: git",
		"ref: main",
		"commit: 0123456789abcdef",
		"checksum: abcdef0123456789",
		"blueprints: Seismic Marketplace",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("source row desc missing %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, `"install"`) {
		t.Fatalf("source row should be structured, not raw JSON:\n%s", items[1].desc)
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
	source := items[1]
	if source.statusTag != "attention" {
		t.Fatalf("source status = %q, want attention: %#v", source.statusTag, source)
	}
	for _, want := range []string{
		"status: sync_failed",
		"status_message: last sync failed",
		"trust: community",
		"synced_at: 2026-06-02T19:00:00Z",
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
	if len(items) < 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "warning" {
		t.Fatalf("warning-only blueprint should use warning status: %#v", items[0])
	}
	for _, want := range []string{
		"warnings: descriptor requires explicit trust before install; skill ndp resolved from community source",
		"source: git",
		"from: https://example.org/community/warning-agents.git",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("blueprint catalog row missing %q:\n%s", want, items[0].desc)
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

func TestExpertPackDetailItemsExposeActivationAndAgents(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{
			ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace", Enabled: true,
			Defaults: map[string]any{"provider": "openai"},
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
	if !strings.Contains(items[1].desc, "provider") {
		t.Fatalf("pack summary should surface defaults metadata:\n%s", items[1].desc)
	}
	if items[2].id != "agent/data.root" || !strings.Contains(items[2].desc, "mcp.parquet.read") {
		t.Fatalf("agent detail row missing drilldown/tool metadata: %#v", items[2])
	}
}

func TestAgentBlueprintDetailItemsExposeActivationMCPAndAgents(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "data-exploration", Title: "Data Exploration", Version: "1.0.0", Scope: "builtin",
			RootExpert: "data", Enabled: true, Defaults: map[string]any{"prompt_profile": "heavy"},
			Metadata: map[string]any{"install": map[string]any{
				"source":              "/tmp/community-blueprints",
				"source_kind":         "path",
				"checksum":            "abcdef0123456789",
				"installed_at":        "2026-06-02T20:00:00Z",
				"status":              "sync_failed",
				"status_message":      "last sync failed",
				"trust":               "community",
				"last_synced_at":      "2026-06-02T19:00:00Z",
				"validation_warnings": []any{"source has not been synced in 7 days"},
				"last_error":          "git fetch exited 128",
			}},
		},
		MCPDescriptors: []map[string]any{{
			"id": "earthscope", "name": "EarthScope MCP", "transport": "stdio",
			"command": "earthscope-mcp", "args": []any{"serve"}, "enabled": false, "status": "disabled",
			"trust":        map[string]any{"policy": "explicit", "trusted": false, "source": "blueprint"},
			"install":      map[string]any{"method": "manual", "status": "missing"},
			"runtime":      map[string]any{"transport": "stdio", "server_id": "mcp_earthscope"},
			"env_policy":   map[string]any{"mode": "restricted", "allowlist": []any{"EARTHSCOPE_TOKEN"}},
			"verification": map[string]any{"status": "unsigned", "checksum": "abcdef0123456789"},
			"validation_warnings": []any{
				"descriptor requires explicit trust before enabling",
			},
		}},
		HookDescriptors: []map[string]any{{
			"id": "pre_message", "title": "Pre Message", "event": "pre_message", "status": "disabled",
			"source": "agent_blueprint", "scope": "workspace", "definition_path": "/tmp/community-blueprints/hooks/pre_message.py",
			"checksum": "0123456789abcdef", "enabled": false,
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"Blueprint packaged hooks are disabled until explicitly enabled and trusted"},
		}},
		Agents: []gact.AgentDef{{
			ID: "data", Title: "Data Root", Source: "agent_blueprint", Enabled: true,
			Tools: []string{"mcp.parquet.read"}, Commands: []string{"/validate-dataset"},
		}},
	})

	if len(items) < 6 {
		t.Fatalf("detail items len = %d, want activation, blueprint, management actions, mcp, and agent", len(items))
	}
	if items[0].id != "activate" {
		t.Fatalf("first detail row = %q, want activate", items[0].id)
	}
	if !strings.Contains(items[1].desc, "prompt_profile") {
		t.Fatalf("blueprint summary should surface defaults:\n%s", items[1].desc)
	}
	for _, want := range []string{
		"Source provenance",
		"source: /tmp/community-blueprints",
		"source_kind: path",
		"checksum: abcdef0123456789",
		"status: sync_failed",
		"status_message: last sync failed",
		"trust: community",
		"synced_at: 2026-06-02T19:00:00Z",
		"Source warnings",
		"source has not been synced in 7 days",
		"Source errors",
		"git fetch exited 128",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint summary missing provenance %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, `"install"`) {
		t.Fatalf("blueprint install provenance should be structured, not raw metadata JSON:\n%s", items[1].desc)
	}
	if items[2].id != "blueprint-action/update" || !items[2].disabled {
		t.Fatalf("builtin blueprint update action should be visible but disabled: %#v", items[2])
	}
	for _, want := range []string{"protected scope: builtin", "source: /tmp/community-blueprints", "status: sync_failed", "status_message: last sync failed", "synced_at: 2026-06-02T19:00:00Z", "trust: community"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("builtin update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || !items[3].disabled {
		t.Fatalf("builtin blueprint delete action should be visible but disabled: %#v", items[3])
	}
	for _, want := range []string{
		"earthscope-mcp",
		"trust_policy: explicit",
		"trusted: false",
		"trust_source: blueprint",
		"install_method: manual",
		"install_status: missing",
		"runtime_transport: stdio",
		"runtime_server_id: mcp_earthscope",
		"env_policy: restricted",
		"env_policy_allowlist: EARTHSCOPE_TOKEN",
		"verification_checksum: abcdef0123456789",
		"verification_status: unsigned",
		"warnings: descriptor requires explicit trust before enabling",
	} {
		if items[4].id != "mcp/earthscope" || !strings.Contains(items[4].desc, want) {
			t.Fatalf("mcp descriptor row missing %q: %#v", want, items[4])
		}
	}
	if strings.Contains(items[4].desc, `"trust"`) || strings.Contains(items[4].desc, `"install"`) {
		t.Fatalf("mcp descriptor should be structured, not raw JSON: %#v", items[4])
	}
	if items[4].id != "mcp/earthscope" || !strings.Contains(items[4].desc, "earthscope-mcp") {
		t.Fatalf("mcp descriptor row missing enable target/command: %#v", items[4])
	}
	for _, want := range []string{"pre_message", "trust_policy: explicit", "trusted: false", "definition_path: /tmp/community-blueprints/hooks/pre_message.py", "checksum: 0123456789abcdef"} {
		if items[5].id != "hook/pre_message" || !strings.Contains(items[5].desc, want) {
			t.Fatalf("hook descriptor row missing %q: %#v", want, items[5])
		}
	}
	if strings.Contains(items[5].desc, `"trust"`) {
		t.Fatalf("hook descriptor should be structured, not raw JSON: %#v", items[5])
	}
	if items[6].id != "agent/data" || !strings.Contains(items[6].desc, "mcp.parquet.read") {
		t.Fatalf("agent row missing drilldown/tool metadata: %#v", items[6])
	}
	if !strings.Contains(items[6].desc, "commands: /validate-dataset") {
		t.Fatalf("agent row should show declared packaged commands: %#v", items[6])
	}
}

func TestPaletteCommandSubtitleSurfacesAgentBlueprintCommandProvenance(t *testing.T) {
	trueValue := true
	command := gact.Command{
		ID:                 "/validate-dataset",
		Title:              "Validate Dataset",
		CommandSource:      "agent_blueprint",
		CommandScope:       "agent_blueprint",
		CommandPath:        "/tmp/work/.clio/agent-blueprints/qc/commands/validate-dataset.md",
		AgentBlueprintID:   "qc-agent",
		AgentBlueprintRoot: "/tmp/work/.clio/agent-blueprints/qc",
		AgentID:            "root",
		UserInvocable:      &trueValue,
		AgentInvocable:     &trueValue,
		PlannerVisible:     &trueValue,
		ArgumentHint:       "<path>",
	}

	got := paletteCommandSubtitle(command)
	for _, want := range []string{
		"agent blueprint: qc-agent",
		"user",
		"agent",
		"planner",
		"owner: root",
		"args: <path>",
		"path: commands/validate-dataset.md",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("subtitle missing %q: %q", want, got)
		}
	}
}

func TestAgentBlueprintValidationFormatsPackagedHooks(t *testing.T) {
	out := formatAgentBlueprintValidation(gact.AgentBlueprintValidationResult{
		Enabled:            true,
		ValidationWarnings: []string{"descriptor requires explicit trust before install"},
		MCPDescriptors: []map[string]any{{
			"id": "earthscope", "name": "EarthScope MCP", "transport": "stdio",
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"descriptor requires explicit trust"},
		}},
		HookDescriptors: []map[string]any{{
			"id": "pre_message", "title": "Pre Message", "event": "pre_message",
			"source": "agent_blueprint", "definition_path": "/tmp/bp/hooks/pre_message.py",
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"disabled until trusted"},
		}},
	})
	for _, want := range []string{"status: warning", "warnings: descriptor requires explicit trust before install", "MCP descriptors", "EarthScope MCP", "warnings: descriptor requires explicit trust", "Packaged hooks", "Pre Message", "event: pre_message", "trust_policy: explicit", "trusted: false", "warnings: disabled until trusted"} {
		if !strings.Contains(out, want) {
			t.Fatalf("validation output missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"trust"`) {
		t.Fatalf("validation output should not dump hook JSON:\n%s", out)
	}
}

func TestAgentBlueprintDetailItemsExposeManagementActionsForInstalledBlueprint(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "workspace-blueprint", Title: "Workspace Blueprint", Scope: "workspace", Enabled: true,
			Metadata: map[string]any{"install": map[string]any{
				"source":         "https://example.org/community/workspace-blueprint.git",
				"source_kind":    "git",
				"status":         "update_available",
				"status_message": "new commit available",
				"last_sync":      "2026-06-03T01:00:00Z",
				"trust_policy":   "explicit",
			}},
		},
	})

	if len(items) < 4 {
		t.Fatalf("detail items len = %d, want activation, blueprint, update, delete", len(items))
	}
	if items[2].id != "blueprint-action/update" || items[2].disabled {
		t.Fatalf("workspace blueprint update action should be enabled: %#v", items[2])
	}
	for _, want := range []string{"refresh this installed blueprint through CLIO", "source: https://example.org/community/workspace-blueprint.git", "status: update_available", "status_message: new commit available", "synced_at: 2026-06-03T01:00:00Z", "trust: explicit"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("workspace update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || items[3].disabled {
		t.Fatalf("workspace blueprint delete action should be enabled: %#v", items[3])
	}
	for _, want := range []string{"remove this installed blueprint through CLIO", "source: https://example.org/community/workspace-blueprint.git", "status: update_available"} {
		if !strings.Contains(items[3].desc, want) {
			t.Fatalf("workspace delete action missing lifecycle state %q: %#v", want, items[3])
		}
	}
}

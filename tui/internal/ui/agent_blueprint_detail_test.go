package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

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

	if len(items) < 7 {
		t.Fatalf("detail items len = %d, want activation, overview, management actions, expert, mcp, and hook", len(items))
	}
	if items[0].id != "activate" {
		t.Fatalf("first detail row = %q, want activate", items[0].id)
	}
	for _, want := range []string{"only for the current selected session", "new sessions keep the workspace default"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("blueprint activation row missing scope/default text %q: %#v", want, items[0])
		}
	}
	if !strings.Contains(items[1].desc, "prompt_profile") {
		t.Fatalf("blueprint summary should surface defaults:\n%s", items[1].desc)
	}
	if items[1].title != "Overview" {
		t.Fatalf("blueprint summary should use a compact overview row: %#v", items[1])
	}
	for _, want := range []string{
		"Operator summary",
		"workflow: Data Exploration",
		"status: ready",
		"activation: select Activate to use this blueprint for the current session",
		"session scope: new sessions keep the workspace default",
		"Blueprint identity",
		"id: data-exploration",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint summary missing operator wording %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, "activation ready") || strings.Contains(items[1].desc, "blueprint id") {
		t.Fatalf("blueprint summary should not lead with schema-style labels:\n%s", items[1].desc)
	}
	if strings.Contains(items[0].desc+items[1].desc, "backend/workspace") {
		t.Fatalf("blueprint detail should not expose backend-default wording:\n%s\n%s", items[0].desc, items[1].desc)
	}
	for _, want := range []string{"ready", "root: data", "v1.0.0"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("blueprint summary inline preview missing %q: %#v", want, items[1])
		}
	}
	if strings.Contains(items[1].inlineDesc, "Operator summary") || strings.Contains(items[1].inlineDesc, "workflow:") {
		t.Fatalf("blueprint inline preview should stay compact: %#v", items[1])
	}
	for _, want := range []string{
		"Source provenance",
		"source url: /tmp/community-blueprints",
		"source type: path",
		"checksum: abcdef0123456789",
		"status: sync_failed",
		"status message: last sync failed",
		"trust: community",
		"last synced: 2026-06-02T19:00:00Z",
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
	for _, want := range []string{"protected scope: builtin", "source: /tmp/community-blueprints", "status: sync_failed", "status message: last sync failed", "last synced: 2026-06-02T19:00:00Z", "trust: community"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("builtin update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || !items[3].disabled {
		t.Fatalf("builtin blueprint delete action should be visible but disabled: %#v", items[3])
	}
	if items[4].id != "agent/data" || !strings.Contains(items[4].desc, "mcp.parquet.read") {
		t.Fatalf("agent row missing drilldown/tool metadata: %#v", items[4])
	}
	if items[4].statusTag != "root" {
		t.Fatalf("agent row should mark the root expert without backend source noise: %#v", items[4])
	}
	if items[4].title != "Data Root" {
		t.Fatalf("agent row should put the expert name first: %#v", items[4])
	}
	if !strings.Contains(items[4].inlineDesc, "tier 1") || !strings.Contains(items[4].inlineDesc, "1 tool") || !strings.Contains(items[4].inlineDesc, "1 command") {
		t.Fatalf("agent row should expose compact hierarchy summary: %#v", items[4])
	}
	if !strings.Contains(items[4].desc, "commands exposed: /validate-dataset") {
		t.Fatalf("agent row should show declared packaged commands: %#v", items[4])
	}
	for _, want := range []string{
		"MCP access",
		"earthscope-mcp",
		"server arguments: serve",
		"activation: disabled",
		"trust policy: explicit",
		"trusted: false",
		"trust source: blueprint",
		"install method: manual",
		"install status: missing",
		"runtime transport: stdio",
		"runtime server id: mcp_earthscope",
		"environment policy: restricted",
		"environment policy allowlist: EARTHSCOPE_TOKEN",
		"verification checksum: abcdef0123456789",
		"verification status: unsigned",
		"Warnings",
		"descriptor requires explicit trust before enabling",
	} {
		if items[5].id != "mcp/earthscope" || !strings.Contains(items[5].desc, want) {
			t.Fatalf("mcp descriptor row missing %q: %#v", want, items[5])
		}
	}
	if items[5].title != "EarthScope MCP access" {
		t.Fatalf("mcp descriptor should identify the access being granted: %#v", items[5])
	}
	for _, want := range []string{"calls earthscope-mcp", "disabled", "needs approval", "stdio", "mcp_earthscope", "warnings"} {
		if !strings.Contains(items[5].inlineDesc, want) {
			t.Fatalf("mcp descriptor inline summary missing %q: %#v", want, items[5])
		}
	}
	if strings.Contains(items[5].inlineDesc, "MCP access") || strings.Contains(items[5].inlineDesc, "server arguments") {
		t.Fatalf("mcp descriptor inline summary should stay compact: %#v", items[5])
	}
	if strings.Contains(items[5].desc, `"trust"`) || strings.Contains(items[5].desc, `"install"`) {
		t.Fatalf("mcp descriptor should be structured, not raw JSON: %#v", items[5])
	}
	for _, notWant := range []string{"\n  args: serve", "enabled: false"} {
		if strings.Contains(items[5].desc, notWant) {
			t.Fatalf("mcp descriptor leaked schema-style copy %q: %#v", notWant, items[5])
		}
	}
	if items[5].id != "mcp/earthscope" || !strings.Contains(items[5].desc, "earthscope-mcp") {
		t.Fatalf("mcp descriptor row missing enable target/command: %#v", items[5])
	}
	for _, want := range []string{"Message automation", "when: Before each user message", "activation: disabled", "trust policy: explicit", "trusted: false", "hook file: /tmp/community-blueprints/hooks/pre_message.py", "checksum: 0123456789abcdef"} {
		if items[6].id != "hook/pre_message" || !strings.Contains(items[6].desc, want) {
			t.Fatalf("hook descriptor row missing %q: %#v", want, items[6])
		}
	}
	if strings.Contains(items[6].desc, "enabled: false") {
		t.Fatalf("hook descriptor leaked schema-style enabled label: %#v", items[6])
	}
	if items[6].title != "Before each user message" {
		t.Fatalf("hook descriptor should explain when it runs: %#v", items[6])
	}
	for _, want := range []string{"Before each user message", "disabled", "needs approval", "workspace", "provided by agent blueprint", "warnings"} {
		if !strings.Contains(items[6].inlineDesc, want) {
			t.Fatalf("hook descriptor inline summary missing %q: %#v", want, items[6])
		}
	}
	if strings.Contains(items[6].inlineDesc, "Message automation") || strings.Contains(items[6].inlineDesc, "hook file") || strings.Contains(items[6].inlineDesc, "agent_blueprint") {
		t.Fatalf("hook descriptor inline summary should stay compact: %#v", items[6])
	}
	if strings.Contains(items[6].desc, "agent_blueprint") || strings.Contains(items[6].desc, `"trust"`) {
		t.Fatalf("hook descriptor should not leak raw backend enums or JSON: %#v", items[6])
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
		"from workflow qc-agent",
		"operator command",
		"expert root",
		"input <path>",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("subtitle missing %q: %q", want, got)
		}
	}
	for _, notWant := range []string{"agent blueprint:", "owner:", "args:", "path:", "planner", "commands/validate-dataset.md"} {
		if strings.Contains(got, notWant) {
			t.Fatalf("subtitle should not expose backend label %q: %q", notWant, got)
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
	for _, want := range []string{"status: warning", "warnings: descriptor requires explicit trust before install", "MCP descriptors", "EarthScope MCP", "Warnings", "descriptor requires explicit trust", "Packaged hooks", "Pre Message", "when: Before each user message", "trust policy: explicit", "trusted: false", "disabled until trusted"} {
		if !strings.Contains(out, want) {
			t.Fatalf("validation output missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"warnings: descriptor requires explicit trust\n", "warnings: disabled until trusted"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("validation descriptor detail should use warning sections, not inline labels %q:\n%s", notWant, out)
		}
	}
	if strings.Contains(out, `"trust"`) {
		t.Fatalf("validation output should not dump hook JSON:\n%s", out)
	}
}

func TestAgentBlueprintValidationWithSourceGivesInstallNextStep(t *testing.T) {
	out := formatAgentBlueprintValidationWithSource(gact.AgentBlueprintValidationResult{
		Enabled: true,
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID:      "seismic-waveform-review",
			Title:   "Seismic Waveform Review",
			Enabled: true,
		},
	}, "https://example.org/community/seismic-agents.git")

	for _, want := range []string{
		"Validated source",
		"source: https://example.org/community/seismic-agents.git",
		"next action: press Esc, choose install source, and use the same source",
		"Validation",
		"status: valid",
		"Blueprint identity",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("validation source report missing %q:\n%s", want, out)
		}
	}
}

func TestAgentBlueprintDetailItemsPrioritizeValidationBeforeUnsafeActivation(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "broken-blueprint", Title: "Broken Blueprint", Scope: "workspace", Enabled: true,
			ValidationErrors: []string{"root expert not found: missing"},
		},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want validation, activation, and summary", len(items))
	}
	if items[0].id != "validation" || items[0].statusTag != "error" {
		t.Fatalf("first row = %#v, want validation error before actions", items[0])
	}
	if items[1].id != "activate" || !items[1].disabled || items[1].statusTag != "blocked" {
		t.Fatalf("activation row = %#v, want disabled blocked activation", items[1])
	}
	if !strings.Contains(items[1].desc, "cannot activate until validation errors are resolved") {
		t.Fatalf("activation row should explain validation blocker: %#v", items[1])
	}
	if !strings.Contains(items[0].desc, "missing root expert") || strings.Contains(items[0].desc, "root_expert") {
		t.Fatalf("validation row should use operator-facing validation text: %#v", items[0])
	}
	if !strings.Contains(items[2].inlineDesc, "needs fix: missing root expert") || strings.Contains(items[2].inlineDesc, "invalid ·") || strings.Contains(items[2].inlineDesc, "root_expert") {
		t.Fatalf("broken blueprint summary should lead with repair reason, got %#v", items[2])
	}
}

func TestAgentBlueprintDetailItemsMarkActiveActivationState(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "seismic-market", Title: "Seismic Marketplace", Scope: "workspace", Enabled: true,
		},
	})
	items = markActiveAgentBlueprintDetailItems(items, "seismic-market", "seismic-market", "session")

	if len(items) < 2 {
		t.Fatalf("detail items len = %d, want activation and summary", len(items))
	}
	if items[0].id != "activate" || items[0].title != "Active" || items[0].statusTag != "active" {
		t.Fatalf("active activation row not marked clearly: %#v", items[0])
	}
	if items[0].desc != "" {
		t.Fatalf("session-scoped active row should not repeat active prose: %#v", items[0])
	}
	if strings.Contains(items[0].desc, "Press Enter") {
		t.Fatalf("active activation row should keep keypress prose out of the body: %#v", items[0])
	}
	if items[1].id != "blueprint/seismic-market" || items[1].statusTag == "active" {
		t.Fatalf("overview row should not repeat active state already shown above: %#v", items[1])
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
	for _, want := range []string{"refresh this installed blueprint through GACT", "source: https://example.org/community/workspace-blueprint.git", "status: update_available", "status message: new commit available", "last synced: 2026-06-03T01:00:00Z", "trust: explicit"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("workspace update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || items[3].disabled {
		t.Fatalf("workspace blueprint delete action should be enabled: %#v", items[3])
	}
	for _, want := range []string{"remove this installed blueprint through GACT", "source: https://example.org/community/workspace-blueprint.git", "status: update_available"} {
		if !strings.Contains(items[3].desc, want) {
			t.Fatalf("workspace delete action missing lifecycle state %q: %#v", want, items[3])
		}
	}
}

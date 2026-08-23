package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestFormatResolvedPromptShowsProvenanceAndText(t *testing.T) {
	out := formatResolvedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "debug", Scope: "global", SourcePath: "/tmp/prompt.md",
		Provider: "openai", Model: "gpt-5", Checksum: "abc123", FallbackProfile: "default",
		Text: "Stay grounded.", Metadata: map[string]any{"saved_by": "test"},
	})

	for _, want := range []string{
		"status: fallback profile used",
		"fallback profile: default",
		"provider: openai",
		"model: gpt-5",
		"source: /tmp/prompt.md",
		"Operator paths",
		"render preview: inspect the runtime prompt with session and workspace substitutions applied",
		"validate: check an edited profile before using it in a session",
		"customize: edit a profile or save the current profile as a codex override",
		"saved_by",
		"Stay grounded.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resolved prompt detail missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"press e", "s to save profile as codex", "Actions"} {
		if strings.Contains(out, raw) {
			t.Fatalf("resolved prompt detail should keep keypresses in footer/actions, found %q:\n%s", raw, out)
		}
	}
}

func TestFormatRenderedPromptValidationAndReload(t *testing.T) {
	rendered := formatRenderedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "heavy", Scope: "workspace", SourcePath: "/tmp/prompt.md",
		Checksum: "abc", Text: "Rendered body", Metadata: map[string]any{
			"session_id":   "s1",
			"workspace_id": "",
			"rendered":     true,
			"prompt_family": map[string]any{
				"id": "clio.chat",
			},
		},
	})
	for _, want := range []string{"Rendered body", "Operator context", "prompt: clio.chat", "profile: heavy", "scope: workspace", "Technical provenance", "checksum: abc", "Render provenance", "session: s1", "prompt family:"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered prompt missing %q:\n%s", want, rendered)
		}
	}
	if strings.Index(rendered, "Rendered body") > strings.Index(rendered, "Operator context") {
		t.Fatalf("rendered prompt body should appear before runtime provenance:\n%s", rendered)
	}
	for _, raw := range []string{`"session_id": "s1"`, "session_id:", "prompt_family:", "prompt id:", "prompt scope:", "rendered: true", `workspace: ""`, `workspace: "\"\""`} {
		if strings.Contains(rendered, raw) {
			t.Fatalf("rendered prompt should show provenance as operator labels, found %q:\n%s", raw, rendered)
		}
	}

	validation := formatPromptValidation(gact.PromptValidationResult{
		Enabled: false, ValidationErrors: []string{"unknown placeholder"},
		Prompt: gact.PromptDefinition{ID: "clio.chat", Scope: "workspace"},
	})
	for _, want := range []string{"status: invalid", "unknown placeholder", "prompt: clio.chat", "scope: workspace"} {
		if !strings.Contains(validation, want) {
			t.Fatalf("validation missing %q:\n%s", want, validation)
		}
	}
	for _, raw := range []string{"prompt_id:", "prompt id:", "prompt scope:"} {
		if strings.Contains(validation, raw) {
			t.Fatalf("validation should not expose raw prompt label %q:\n%s", raw, validation)
		}
	}

	reload := formatPromptReload(gact.PromptReloadResult{
		PromptCount: 2, PromptIDs: []string{"a", "b"}, Sources: []gact.PromptSource{{Scope: "workspace", Root: "/repo/.clio/prompts"}},
	})
	for _, want := range []string{"prompts loaded: 2", "prompt ids: a, b", "workspace: /repo/.clio/prompts"} {
		if !strings.Contains(reload, want) {
			t.Fatalf("reload missing %q:\n%s", want, reload)
		}
	}
	for _, raw := range []string{"prompt_count:", "prompt_ids:"} {
		if strings.Contains(reload, raw) {
			t.Fatalf("reload should not expose raw %q label:\n%s", raw, reload)
		}
	}
}

func TestPromptCatalogEmptyStateExplainsScope(t *testing.T) {
	items := promptCatalogItems(nil, client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	if row.disabled || row.statusTag != "empty" {
		t.Fatalf("empty prompt row should be visible empty state without disabled chrome: %#v", row)
	}
	combined := catalogItemTestText(items)
	for _, want := range []string{"No prompts available", "workflow prompt library is empty", "Activate workflow", "open /agent-blueprints and activate workflow", "Reload prompt library", "reopen /prompts after activation"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty prompt checklist missing %q:\n%s", want, combined)
		}
	}
	if intro := catalogBrowserIntro(catalogKindPrompts); intro != "" {
		t.Fatalf("prompt catalog should keep scope guidance in empty rows, not intro chrome, got %q", intro)
	}

	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindPrompts,
		title: "Prompts",
		items: items,
	}
	hint := catalogBrowserHintText(a.catalog.current)
	for _, want := range []string{"open /agent-blueprints", "activate workflow", "reopen /prompts"} {
		if !strings.Contains(hint, want) {
			t.Fatalf("empty prompt hint missing %q, got %q", want, hint)
		}
	}
	if strings.Contains(hint, "/agent-blueprints activate workflow") || strings.Contains(hint, "Enter prompt profiles") {
		t.Fatalf("empty prompt hint should route operators to activation path, got %q", hint)
	}
	_, cmd := a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on prompt empty state should not dispatch detail load")
	}
	a.catalog.current.sel = 1
	_, cmd = a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on prompt empty-state checklist row should not dispatch detail load")
	}
}

func TestCatalogEmptyStatesRenderAsGuidanceBlocks(t *testing.T) {
	tests := []struct {
		name string
		kind catalogBrowserKind
		rows []catalogItem
		want string
	}{
		{
			name: "prompts",
			kind: catalogKindPrompts,
			rows: promptCatalogItems(nil, client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"}),
			want: "Activate workflow",
		},
		{
			name: "skills",
			kind: catalogKindSkills,
			rows: []catalogItem{{
				id:         "none",
				title:      "No skills available",
				desc:       "Install or activate an agent blueprint that includes skills, then reopen this view.",
				inlineDesc: "install or activate workflow skills",
				statusTag:  "empty",
			}},
			want: "No skills available",
		},
		{
			name: "expert packs",
			kind: catalogKindExpertPacks,
			rows: expertPackCatalogItems(nil),
			want: "Next: Install workflow pack",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			a := newReadyApp(nil, nil)
			a.width = 120
			a.height = 36
			a.catalog.open = true
			a.catalog.current = &catalogBrowserState{
				kind:  tc.kind,
				title: catalogBrowserTitle(tc.kind),
				items: tc.rows,
			}

			out := ansi.Strip(a.catalog.view())
			if !strings.Contains(out, tc.want) {
				t.Fatalf("empty guidance missing %q:\n%s", tc.want, out)
			}
			if strings.Contains(out, "▌") {
				t.Fatalf("empty guidance should not render selected-list cursor:\n%s", out)
			}
			if !strings.Contains(out, "Esc close") {
				t.Fatalf("empty guidance footer should remain actionable:\n%s", out)
			}
		})
	}
}

func TestCatalogBrowserContextLineShowsPromptScope(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.wsID = "ws_demo"
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "DemoBench"}}
	a.session.sessions = []gact.Session{{
		ID:    "s1",
		Title: "San Diego review",
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-waveform-review",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.session.selected = 0
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindPrompts,
		title: "Prompts",
		items: promptCatalogItems([]gact.PromptDefinition{{
			ID: "clio.main.planner", Title: "Main planner", Scope: "agent_blueprint",
		}}, a.session.runtimeScope()),
	}

	out := ansi.Strip(a.catalog.view())
	for _, want := range []string{
		"Context:",
		"workspace DemoBench",
		"session San Diego review",
		"workflow seismic-waveform-review",
		"(session)",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt catalog context missing %q:\n%s", want, out)
		}
	}
}

func TestCatalogBrowserContextLineExplainsMissingSessionAndWorkflow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.wsID = "ws_demo"
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "DemoBench"}}
	a.session.selected = -1
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: expertPackCatalogItems(nil),
	}

	out := ansi.Strip(a.catalog.view())
	for _, want := range []string{
		"Context:",
		"workspace DemoBench",
		"session no session selected",
		"workflow no active workflow",
		"blueprint",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("expert-pack catalog context missing %q:\n%s", want, out)
		}
	}
}

func TestPromptCatalogEmptyStateExplainsMissingSession(t *testing.T) {
	items := promptCatalogItems(nil, client.RuntimeScope{WorkspaceID: "ws1"})
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	combined := catalogItemTestText(items)
	for _, want := range []string{"No prompts available", "No session is selected", "Start or select a session", "start/select a session first", "Then activate workflow", "open /agent-blueprints after selecting a session", "reopen /prompts after activation"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty prompt checklist without session missing %q:\n%s", want, combined)
		}
	}
	if !strings.Contains(row.inlineDesc, "start/select a session first") || strings.Contains(row.inlineDesc, "workspace/session") {
		t.Fatalf("empty prompt inline guidance should be session-specific: %#v", row)
	}
}

func TestPromptCatalogHintUsesProviderWording(t *testing.T) {
	cb := &catalogBrowserState{
		kind: catalogKindPrompts,
		items: []catalogItem{
			{id: "provider/built-in", title: "Provider · Built-in"},
			{id: "clio.chat", title: "└─ Chat agent"},
		},
	}
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter provider summary") || strings.Contains(hint, "source summary") {
		t.Fatalf("provider row hint should use prompt-provider wording, got %q", hint)
	}
	cb.sel = 1
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter prompt profiles") {
		t.Fatalf("prompt row hint should open profiles, got %q", hint)
	}
}

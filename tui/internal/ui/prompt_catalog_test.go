package ui

import (
	"strings"
	"testing"

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

package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
	}}, client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want provider header and prompt row", len(items))
	}
	if items[0].id != "provider/built-in" || items[0].title != "Provider · Built-in" {
		t.Fatalf("prompt catalog provider row = %#v, want built-in provider header", items[0])
	}
	if items[0].inlineDesc != "1 prompt" {
		t.Fatalf("prompt catalog provider inline = %q, want prompt count", items[0].inlineDesc)
	}
	if items[1].title != "  └─ Chat" {
		t.Fatalf("prompt catalog title = %q, want indented prompt title", items[1].title)
	}
	for _, want := range []string{"built-in prompt", "profiles: debug, default", "default profile: default", "validation: 1 validation error - bad override", "description: General conversation"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("prompt catalog desc missing %q: %q", want, items[1].desc)
		}
	}
	for _, want := range []string{"built-in", "2 profiles", "default profile", "1 validation issue"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("prompt catalog inline summary missing %q: %#v", want, items[1])
		}
	}
	for _, notWant := range []string{"Prompt ·", "available profiles:", "uses ", "error(s)", "General conversation", "scope:", "profiles:", "default:", "validation errors:"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("prompt catalog inline summary leaked backend wording %q: %#v", notWant, items[1])
		}
	}
}

func TestPromptProfileRowsHideChecksumUntilDetail(t *testing.T) {
	desc := promptProfileDescription("default", gact.PromptProfile{
		Name:       "default",
		Scope:      "workspace",
		Provider:   "openai",
		Model:      "gpt-5",
		Checksum:   "abc123def456",
		SourcePath: "/repo/.clio/prompts/chat/default.md",
		Text:       "Rendered prompt text",
	}, true)

	for _, want := range []string{"current default", "workspace profile", "provider: openai", "model: gpt-5", "source: default.md"} {
		if !strings.Contains(desc, want) {
			t.Fatalf("profile row missing %q: %q", want, desc)
		}
	}
	for _, notWant := range []string{"checksum", "abc123def456", "Rendered prompt text"} {
		if strings.Contains(desc, notWant) {
			t.Fatalf("profile row should keep raw provenance/detail out of the tree, found %q in %q", notWant, desc)
		}
	}
}

func TestPromptRowTitleNormalizationRemovesTreeChrome(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
	}{
		{in: "Prompt · Chat agent", want: "Chat agent"},
		{in: "  └─ Chat agent", want: "Chat agent"},
		{in: "Prompt ·   ├─ Data expert", want: "Data expert"},
	} {
		if got := stripPromptRowPrefix(tc.in); got != tc.want {
			t.Fatalf("stripPromptRowPrefix(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

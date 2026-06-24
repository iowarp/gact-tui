package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestOpenPromptDetailDoesNotDuplicatePromptPrefix(t *testing.T) {
	a := newReadyApp(nil, nil)
	cmd := a.catalog.openPromptDetail("clio.chat", "Prompt · Chat")
	if cmd == nil {
		t.Fatal("openPromptDetail should dispatch a detail load command")
	}
	if a.catalog.current == nil || a.catalog.current.title != "Prompt · Chat" {
		t.Fatalf("prompt detail title = %#v, want single Prompt prefix", a.catalog.current)
	}
}

func TestPromptDetailSeparatesManagementFromProfiles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:          catalogKindPromptDetail,
		title:         "Prompt · Chat",
		promptID:      "clio.chat",
		promptProfile: "default",
		items: []catalogItem{
			{id: "prompt/clio.chat", title: "Definition · Chat", desc: "General conversation", statusTag: "builtin"},
			{id: "profile/debug", title: "└─ debug", desc: "diagnostic output", statusTag: "builtin"},
			{id: "profile/default", title: "└─ default", desc: "operator output", statusTag: "builtin default"},
		},
	}

	out := ansi.Strip(a.catalog.view())
	for _, want := range []string{"Management", "render default", "validate default", "reload registry", "Prompt and profiles", "Definition · Chat", "└─ debug", "└─ default", "Enter details", "s save->codex"} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt detail missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Enter text") {
		t.Fatalf("prompt detail footer should not imply rows are raw text:\n%s", out)
	}
	if strings.Contains(out, "Profile ·") {
		t.Fatalf("prompt detail profile tree should not repeat object type labels:\n%s", out)
	}
	for _, legacyActionRow := range []string{"Rendered runtime preview", "Validate prompt", "Reload prompt registry"} {
		if strings.Contains(out, legacyActionRow) {
			t.Fatalf("prompt detail leaked legacy action row %q:\n%s", legacyActionRow, out)
		}
	}
}

func TestPromptDetailManagementShortcutsDispatch(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:          catalogKindPromptDetail,
		title:         "Prompt · Chat",
		promptID:      "clio.chat",
		promptProfile: "default",
		items: []catalogItem{
			{id: "prompt/clio.chat", title: "Definition · Chat"},
			{id: "profile/default", title: "└─ Profile · default"},
		},
	}

	for _, key := range []string{"r", "v", "u"} {
		_, cmd := a.catalog.handleKey(keyMsg(key))
		if cmd == nil {
			t.Fatalf("%q in prompt detail should dispatch a management command", key)
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
	for _, want := range []string{"prompt: clio.expert.data", "profile: heavy", "scope: global", "status: resolved", "provider: openai", "model: gpt-5"} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt resolution missing %q: %q", want, got)
		}
	}
	for _, raw := range []string{"prompt id:", "prompt scope:"} {
		if strings.Contains(got, raw) {
			t.Fatalf("prompt resolution should avoid backend-ish label %q: %q", raw, got)
		}
	}
}

func TestPromptEditModalStatesBuiltinOverrideScope(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.promptEdit.openModal("clio.chat", "default", "Chat", "Use grounded answers.")
	out := a.promptEdit.view()
	for _, want := range []string{"Edit prompt override · clio.chat", "profile codex", "Use grounded answers."} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt edit modal missing %q:\n%s", want, out)
		}
	}
}

package ui

import (
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigTransportMessageNamesCodexDirect(t *testing.T) {
	loc := newLocalizer("en")
	codex := client.LMProviderPreset{ID: "codex", Provider: "codex", APIBase: "codex://direct"}
	if got := loc.t(lmConfigTransportMessage(codex), nil); got != "transport: direct" {
		t.Fatalf("codex transport row = %q, want %q", got, "transport: direct")
	}
	claude := client.LMProviderPreset{ID: "claude_code", Provider: "claude_code", APIBase: "claude-code://sdk"}
	if got := loc.t(lmConfigTransportMessage(claude), nil); got != "transport: local CLI" {
		t.Fatalf("claude_code transport row = %q, want %q", got, "transport: local CLI")
	}
}

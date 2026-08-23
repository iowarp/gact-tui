package ui

// reload_render_dump_test.go renders the TUI conversation from a real GET
// /messages reload payload ONLY (no live SSE / no semantic-event ledger), so we
// can read what a cold /messages reload actually shows and compare it against
// the canonical grammar. Gated on GACT_RELOAD_JSON + GACT_RELOAD_DUMP so it is a
// no-op in normal CI.

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestRenderReloadMessagesOnly(t *testing.T) {
	src := os.Getenv("GACT_RELOAD_JSON")
	dump := os.Getenv("GACT_RELOAD_DUMP")
	if src == "" || dump == "" {
		t.Skip("set GACT_RELOAD_JSON and GACT_RELOAD_DUMP to run the reload-render dump")
	}
	raw, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read reload json: %v", err)
	}
	var payload struct {
		Messages []gact.Message `json:"messages"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal reload json: %v", err)
	}
	if len(payload.Messages) == 0 {
		t.Fatalf("no messages parsed from %s", src)
	}
	sid := payload.Messages[0].SessionID

	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: sid}}
	a.session.selected = 0
	// Exactly the cold /messages reload path: handleMessagesLoaded sets the
	// messages and nothing else (no recordSSE, no semantic-event ledger).
	a.conversation.messages = payload.Messages
	a.conversation.invalidateRenderCache()

	out := "=== currentSessionHasProjected: "
	if a.execution.currentSessionHasProjected() {
		out += "true ===\n\n"
	} else {
		out += "false  → flat transcript render ===\n\n"
	}
	// Unclipped execution render so the full structure is readable (no viewport).
	if projected, _, ok := a.execution.renderConversation(DefaultTheme(), 116); ok {
		out += ansi.Strip(projected)
	} else {
		out += ansi.Strip(a.conversation.render(120, 5000))
	}

	if err := os.WriteFile(dump, []byte(out), 0o644); err != nil {
		t.Fatalf("write dump: %v", err)
	}
	t.Logf("wrote reload-only render (%d msgs) to %s", len(payload.Messages), dump)
}

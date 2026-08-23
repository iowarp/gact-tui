package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplyNotificationSSESurfacesGlobalEventsWithoutSessionID(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "existing",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "keep me"}},
	}}

	a.conversation.applySSE(client.SSEEvent{
		Type: "notification",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "",
			"level":      "info",
			"title":      "MCP server reconnected",
			"body":       "mcp_docs",
		}},
	})

	if got := a.transientHint; !strings.Contains(got, "info: MCP connection reconnected") || !strings.Contains(got, "mcp_docs") {
		t.Fatalf("global notification hint = %q", got)
	}
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].Parts[0].Text != "keep me" {
		t.Fatalf("notification should not mutate transcript messages: %#v", a.conversation.messages)
	}

	a.conversation.applySSE(client.SSEEvent{
		Type: "notification",
		Payload: map[string]any{"payload": map[string]any{
			"level": "warning",
			"title": "Provider degraded",
		}},
	})

	if got := a.transientHint; got != "warning: Provider degraded" {
		t.Fatalf("missing-session notification hint = %q", got)
	}
}

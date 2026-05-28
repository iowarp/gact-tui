package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestFormatPermissionsInspectorShowsAuditAndPolicies(t *testing.T) {
	out := formatPermissionsInspector([]client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_1", SessionID: "sess_1", Summary: "Run shell",
			ToolCall: gact.PermissionToolCall{ToolName: "bash"},
		},
		Status: "pending",
	}}, []gact.Policy{{
		Scope: "session", ToolNamePattern: "bash", Action: "ask",
	}}, "sess_1")

	for _, want := range []string{"Permission audit", "scope: sess_1", "status: pending", "tool: bash", "Policies", "action: ask"} {
		if !strings.Contains(out, want) {
			t.Fatalf("permissions inspector missing %q:\n%s", want, out)
		}
	}
}

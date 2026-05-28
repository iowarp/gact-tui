package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func loadPermissionsInspectorCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		perms, err := c.ListPermissions(ctx, sessionID, false)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Permissions", err: err, standalone: true}
		}
		policies, _ := c.ListPolicies(ctx)
		return catalogDetailLoadedMsg{
			title:      "Permissions · audit and policy",
			text:       formatPermissionsInspector(perms, policies, sessionID),
			standalone: true,
		}
	}
}

func formatPermissionsInspector(perms []client.PermissionWire, policies []gact.Policy, sessionID string) string {
	scope := "all sessions"
	if sessionID != "" {
		scope = sessionID
	}
	rows := appendDetailSection(nil, "Permission audit",
		detailField{"scope", scope},
		detailField{"rows", fmt.Sprintf("%d", len(perms))},
	)
	if len(perms) == 0 {
		rows = append(rows, "  none reported")
	}
	for i, p := range perms {
		if i >= 20 {
			rows = append(rows, detailFieldRows("truncated", fmt.Sprintf("%d additional rows hidden", len(perms)-i))...)
			break
		}
		status := firstNonEmpty(p.Status, string(p.Action), "pending")
		tool := p.ToolCall.ToolName
		if tool == "" {
			tool = "unknown tool"
		}
		body := []string{
			"status: " + status,
			"tool: " + tool,
		}
		if p.Summary != "" {
			body = append(body, "summary: "+p.Summary)
		}
		if p.SessionID != "" {
			body = append(body, "session: "+p.SessionID)
		}
		rows = append(rows, detailFieldRows(shortID(firstNonEmpty(p.ID, tool)), strings.Join(body, "\n"))...)
	}
	rows = appendDetailSection(rows, "Policies",
		detailField{"rows", fmt.Sprintf("%d", len(policies))},
	)
	if len(policies) == 0 {
		rows = append(rows, "  none configured")
	}
	for _, p := range policies {
		label := firstNonEmpty(p.Scope, "policy")
		body := []string{"action: " + p.Action}
		if p.ToolNamePattern != "" {
			body = append(body, "tool: "+p.ToolNamePattern)
		}
		if p.PathPattern != "" {
			body = append(body, "path: "+p.PathPattern)
		}
		rows = append(rows, detailFieldRows(label, strings.Join(body, "\n"))...)
	}
	return strings.Join(rows, "\n")
}

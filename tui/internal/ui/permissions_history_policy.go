package ui

// permissions_history_policy.go formats permission history rows and policy-conflict rows.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func permissionPolicyConflictRows(policies []gact.Policy) []string {
	out := []string{}
	seen := map[string]string{}
	for _, p := range policies {
		key := strings.Join([]string{
			firstNonEmpty(p.Scope, "policy"),
			p.ScopeID,
			p.ToolNamePattern,
			p.PathPattern,
		}, "\x00")
		action := strings.ToLower(strings.TrimSpace(p.Action))
		prev, ok := seen[key]
		if ok && prev != "" && action != "" && prev != action {
			out = append(out, fmt.Sprintf("%s %s on tool %s path %s", permissionPolicyActionLabel(prev), permissionPolicyActionLabel(action), firstNonEmpty(p.ToolNamePattern, "*"), firstNonEmpty(p.PathPattern, "*")))
			continue
		}
		if !ok {
			seen[key] = action
		}
	}
	return out
}

func permissionHistoryRows(perms []client.PermissionWire) []string {
	rows := []string{}
	for _, p := range perms {
		status := strings.ToLower(firstNonEmpty(p.Status, string(p.Action)))
		if status == "" || status == "pending" {
			continue
		}
		label := firstNonEmpty(p.ToolCall.ToolName, "unknown tool") + " · " + permissionDisplayStatus(p)
		rows = append(rows, detailFieldRows(label, permissionRequestBody(p))...)
		if len(rows) >= 10 {
			rows = append(rows, detailFieldRows("truncated", "additional resolved requests hidden")...)
			break
		}
	}
	return rows
}

func permissionDisplayStatus(p client.PermissionWire) string {
	status := strings.ToLower(strings.TrimSpace(firstNonEmpty(p.Status, string(p.Action))))
	action := strings.ToLower(strings.TrimSpace(string(p.Action)))
	switch {
	case status == "resolved" && action == string(gact.PermDeny):
		return "denied"
	case status == "resolved" && action == string(gact.PermAllow):
		return "allowed once"
	case status == "resolved" && action == string(gact.PermAllowSession):
		return "allowed for session"
	case status == "resolved" && action == string(gact.PermAllowWorkspace):
		return "allowed for workspace"
	case status == "allow":
		return "allowed"
	case status == "deny":
		return "denied"
	default:
		return firstNonEmpty(status, action, "resolved")
	}
}

func permissionPolicyActionLabel(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "ask":
		return "ask before running"
	case "allow":
		return "allowed automatically"
	case "deny":
		return "denied automatically"
	default:
		return firstNonEmpty(action, "policy")
	}
}

func permissionRequestBody(p client.PermissionWire) string {
	body := []string{}
	if p.Summary != "" {
		body = append(body, "request: "+p.Summary)
	}
	if summary := permissionToolCallSummary(p.ToolCall); summary != "" {
		body = append(body, "will run: "+summary)
	}
	diagnostics := []string{}
	if p.ToolCall.CallID != "" {
		diagnostics = append(diagnostics, "call "+shortID(p.ToolCall.CallID))
	}
	if p.ToolCall.ServerID != "" {
		body = append(body, "connection: "+p.ToolCall.ServerID+" MCP")
	}
	if p.SessionID != "" {
		diagnostics = append(diagnostics, "session "+shortID(p.SessionID))
	}
	if p.ID != "" {
		diagnostics = append(diagnostics, "request "+shortID(p.ID))
	}
	if len(diagnostics) > 0 {
		body = append(body, "audit trail: "+strings.Join(diagnostics, " · "))
	}
	if len(body) == 0 {
		return "no request details supplied"
	}
	return strings.Join(body, "\n")
}

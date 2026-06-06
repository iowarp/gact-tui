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

type permissionInspectorRespondedMsg struct {
	sessionID    string
	permissionID string
	action       gact.PermissionAction
	text         string
	err          error
}

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
			title:      "Permissions",
			text:       formatPermissionsInspector(perms, policies, sessionID),
			standalone: true,
		}
	}
}

func respondPermissionInspectorCmd(c *client.Client, sessionID string, action gact.PermissionAction) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		perms, err := c.ListPermissions(ctx, sessionID, true)
		if err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, action: action, err: err}
		}
		var pending client.PermissionWire
		found := false
		for _, p := range perms {
			if strings.EqualFold(firstNonEmpty(p.Status, string(p.Action)), "pending") {
				pending = p
				found = true
				break
			}
		}
		if !found || pending.ID == "" {
			return permissionInspectorRespondedMsg{sessionID: sessionID, action: action, err: fmt.Errorf("no pending permission requests")}
		}
		if err := c.RespondPermission(ctx, pending.ID, action); err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, permissionID: pending.ID, action: action, err: err}
		}
		refreshed, err := c.ListPermissions(ctx, sessionID, false)
		if err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, permissionID: pending.ID, action: action, err: err}
		}
		policies, _ := c.ListPolicies(ctx)
		return permissionInspectorRespondedMsg{
			sessionID:    sessionID,
			permissionID: pending.ID,
			action:       action,
			text:         formatPermissionsInspector(refreshed, policies, sessionID),
		}
	}
}

func formatPermissionsInspector(perms []client.PermissionWire, policies []gact.Policy, sessionID string) string {
	scope := "all sessions"
	if sessionID != "" {
		scope = "current session"
	}
	pendingRows := make([]client.PermissionWire, 0, len(perms))
	pending, allowed, denied, destructive, openWorld := 0, 0, 0, 0, 0
	for _, p := range perms {
		switch strings.ToLower(firstNonEmpty(p.Status, string(p.Action))) {
		case "pending":
			pending++
			pendingRows = append(pendingRows, p)
		case "allowed", "allow":
			allowed++
		case "denied", "deny":
			denied++
		}
		if p.ToolCall.Annotations.DestructiveHint {
			destructive++
		}
		if p.ToolCall.Annotations.OpenWorldHint {
			openWorld++
		}
	}
	rows := appendPermissionOperatorDecision(nil, pendingRows, pending, scope)
	rows = appendDetailSection(rows, "Review queue",
		detailField{"reviewing", scope},
		detailField{"waiting for decision", fmt.Sprintf("%d", pending)},
	)
	if pending == 0 {
		rows = append(rows, "  no pending requests for this scope")
	}
	for i, p := range pendingRows {
		if i >= 20 {
			rows = append(rows, detailFieldRows("truncated", fmt.Sprintf("%d additional pending rows hidden", len(pendingRows)-i))...)
			break
		}
		rows = append(rows, detailFieldRows(permissionDecisionLabel(i, p), permissionDecisionBody(p, sessionID))...)
	}
	rows = appendDetailSection(rows, "Decision history",
		detailField{"pending", fmt.Sprintf("%d", pending)},
		detailField{"allowed", fmt.Sprintf("%d", allowed)},
		detailField{"denied", fmt.Sprintf("%d", denied)},
		detailField{"destructive requests", fmt.Sprintf("%d", destructive)},
		detailField{"external access requests", fmt.Sprintf("%d", openWorld)},
		detailField{"policy rules", fmt.Sprintf("%d", len(policies))},
	)
	historyRows := permissionHistoryRows(perms)
	if len(historyRows) > 0 {
		rows = appendDetailSection(rows, "Resolved requests")
		rows = append(rows, historyRows...)
	}
	rows = appendDetailSection(rows, "Review guardrails")
	if len(policies) == 0 {
		rows = append(rows, "  none configured")
	}
	for _, conflict := range permissionPolicyConflictRows(policies) {
		rows = append(rows, detailFieldRows("policy conflict", conflict)...)
	}
	for i, p := range policies {
		label := fmt.Sprintf("%d. %s requests · %s", i+1, firstNonEmpty(p.Scope, "policy"), permissionPolicyActionLabel(p.Action))
		body := []string{}
		if p.ToolNamePattern != "" {
			body = append(body, "tool: "+p.ToolNamePattern)
		}
		if p.PathPattern != "" {
			body = append(body, "path: "+p.PathPattern)
		}
		if p.ScopeID != "" {
			body = append(body, "scope id: "+p.ScopeID)
		}
		rows = append(rows, detailFieldRows(label, strings.Join(body, "\n"))...)
	}
	return strings.Join(rows, "\n")
}

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

func appendPermissionOperatorDecision(rows []string, pendingRows []client.PermissionWire, pending int, scope string) []string {
	if pending == 0 {
		rows = appendDetailSection(rows, "Operator decision")
		rows = append(rows,
			"  No approval is needed for "+scope+".",
			"  Continue monitoring this session.",
		)
		return rows
	}
	rows = appendDetailSection(rows, "Operator decision")
	rows = append(rows, "  "+fmt.Sprintf("%d approval request%s waiting in %s.", pending, pluralSuffix(pending), scope))
	p := pendingRows[0]
	if headline := permissionDecisionHeadline(p); headline != "" {
		rows = append(rows, "  Next: "+headline+".")
	}
	if p.Summary != "" {
		rows = append(rows, "  Request: "+p.Summary+".")
	}
	if summary := permissionToolCallSummary(p.ToolCall); summary != "" {
		rows = append(rows, "  Will run: "+summary+".")
	}
	if risk := permissionSafetyHints(p.ToolCall.Annotations); risk != "none supplied" {
		rows = append(rows, "  Risk: "+risk+".")
	}
	rows = append(rows, "  Recommended choice: "+permissionDecisionGuidance(p)+".")
	return rows
}

func permissionDecisionHeadline(p client.PermissionWire) string {
	tool := firstNonEmpty(p.ToolCall.ToolName, "requested tool")
	risk := permissionSafetyHints(p.ToolCall.Annotations)
	if risk == "none supplied" {
		return tool + " needs approval before running"
	}
	return tool + " needs approval before running · " + risk
}

func permissionDecisionGuidance(p client.PermissionWire) string {
	ann := p.ToolCall.Annotations
	switch {
	case ann.DestructiveHint:
		return "deny unless this exact destructive action is expected"
	case ann.OpenWorldHint:
		return "allow once only if external access is expected for this task"
	case ann.ReadOnlyHint:
		return "allow once if the request matches the current task"
	default:
		return "allow once for this request, or deny if it is unexpected"
	}
}

func pluralSuffix(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func permissionDecisionLabel(index int, p client.PermissionWire) string {
	status := firstNonEmpty(p.Status, string(p.Action), "pending")
	tool := firstNonEmpty(p.ToolCall.ToolName, "unknown tool")
	risk := permissionSafetyHints(p.ToolCall.Annotations)
	if risk == "none supplied" {
		return fmt.Sprintf("%d. %s · %s", index+1, tool, status)
	}
	return fmt.Sprintf("%d. %s · %s · %s", index+1, tool, status, risk)
}

func permissionDecisionBody(p client.PermissionWire, scopeSessionID string) string {
	body := []string{}
	if risk := permissionSafetyHints(p.ToolCall.Annotations); risk != "none supplied" {
		body = append(body, "risk: "+risk)
	}
	if p.Summary != "" {
		body = append(body, "request: "+p.Summary)
	}
	if summary := permissionToolCallSummary(p.ToolCall); summary != "" {
		body = append(body, "will run: "+summary)
	}
	if p.ToolCall.ServerID != "" {
		body = append(body, "connection: "+p.ToolCall.ServerID+" MCP")
	}
	trace := permissionTraceSummary(p, scopeSessionID)
	if trace != "" {
		body = append(body, "audit trail: "+trace)
	}
	if len(body) == 0 {
		return "no request details supplied"
	}
	return strings.Join(body, "\n")
}

func permissionTraceSummary(p client.PermissionWire, scopeSessionID string) string {
	parts := []string{}
	if p.ToolCall.CallID != "" {
		parts = append(parts, "call "+shortID(p.ToolCall.CallID))
	}
	if p.ID != "" {
		parts = append(parts, "request "+shortID(p.ID))
	}
	if p.SessionID != "" && p.SessionID != scopeSessionID {
		parts = append(parts, "session "+shortID(p.SessionID))
	}
	return strings.Join(parts, " · ")
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

func permissionRequestLabel(index int, p client.PermissionWire) string {
	status := firstNonEmpty(p.Status, string(p.Action), "pending")
	tool := firstNonEmpty(p.ToolCall.ToolName, "unknown tool")
	risk := permissionSafetyHints(p.ToolCall.Annotations)
	if risk == "none supplied" {
		return fmt.Sprintf("%d. %s · %s", index+1, tool, status)
	}
	return fmt.Sprintf("%d. %s · %s · %s", index+1, tool, status, risk)
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

func permissionToolCallSummary(call gact.PermissionToolCall) string {
	tool := firstNonEmpty(call.ToolName, "tool")
	summary := toolCallSummary(gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: tool,
		Input:    call.Input,
	})
	if summary == "" {
		return tool
	}
	return capitalizeToolName(tool) + "(" + summary + ")"
}

func permissionSafetyHints(ann gact.ToolAnnotations) string {
	hints := []string{}
	if ann.ReadOnlyHint {
		hints = append(hints, "read-only")
	}
	if ann.DestructiveHint {
		hints = append(hints, "destructive")
	}
	if ann.IdempotentHint {
		hints = append(hints, "idempotent")
	}
	if ann.OpenWorldHint {
		hints = append(hints, "external access")
	}
	if len(hints) == 0 {
		return "none supplied"
	}
	return strings.Join(hints, ", ")
}

package ui

// permissions_format.go formats the permissions inspector (decisions, guidance, trace, safety hints).

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func formatPermissionsInspector(perms []client.PermissionWire, policies []gact.Policy, sessionID string) string {
	scope := "all sessions"
	if sessionID != "" {
		scope = "current session"
	}
	pendingRows := make([]client.PermissionWire, 0, len(perms))
	pending, allowed, denied, destructive, openWorld := 0, 0, 0, 0, 0
	for _, p := range perms {
		switch strings.ToLower(valuefmt.FirstNonEmpty(p.Status, string(p.Action))) {
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
		label := fmt.Sprintf("%d. %s requests · %s", i+1, valuefmt.FirstNonEmpty(p.Scope, "policy"), permissionPolicyActionLabel(p.Action))
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
	tool := valuefmt.FirstNonEmpty(p.ToolCall.ToolName, "requested tool")
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
	status := valuefmt.FirstNonEmpty(p.Status, string(p.Action), "pending")
	tool := valuefmt.FirstNonEmpty(p.ToolCall.ToolName, "unknown tool")
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

func permissionToolCallSummary(call gact.PermissionToolCall) string {
	tool := valuefmt.FirstNonEmpty(call.ToolName, "tool")
	summary := toolCallSummary(gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: tool,
		Input:    call.Input,
	})
	if summary == "" {
		return tool
	}
	return render.CapitalizeToolName(tool) + "(" + summary + ")"
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

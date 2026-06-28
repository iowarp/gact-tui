package ui

// render_handoff_workflow_state.go handles embedded workflow-state within handoff output and stage/status labels.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func embeddedWorkflowStateDominates(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	labels := []string{
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"Retained typed workflow state:",
		"workflow state:",
	}
	lower := strings.ToLower(text)
	for _, label := range labels {
		idx := strings.Index(lower, strings.ToLower(label))
		if idx < 0 {
			continue
		}
		before := strings.TrimSpace(text[:idx])
		return before == "" || len(before) < 240
	}
	return false
}

func stripEmbeddedWorkflowStateBlock(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	cutAt := -1
	for _, marker := range []string{
		"CLIO durable typed workflow state:",
		"CLIO typed workflow state:",
		"Retained typed workflow state:",
	} {
		if idx := indexFold(text, marker); idx > 0 {
			if cutAt < 0 || idx < cutAt {
				cutAt = idx
			}
		}
	}
	if cutAt > 0 {
		return strings.TrimSpace(strings.TrimRight(text[:cutAt], " \n:.-"))
	}
	return text
}

func attachWorkflowStateSummary(output string, p gact.Part) string {
	workflowSummary := strings.TrimSpace(stringValue(p.Metadata["workflow_summary"]))
	if workflowSummary == "" {
		workflowSummary = workflowStateSummary(mapValue(p.Metadata["workflow_state"]))
	}
	if workflowSummary == "" {
		return output
	}
	if output == "" {
		return workflowStateBlockFromSummary(workflowSummary)
	}
	if expertHandoffOutputIsRich(output) {
		return output
	}
	if strings.Contains(output, workflowSummary) {
		return output
	}
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(output)) {
		return output + "\n\n" + workflowStateBlockFromSummary(workflowSummary)
	}
	if stateBlock := workflowStateBlockFromSummary(workflowSummary); stateBlock != "" {
		return output + "\n" + stateBlock
	}
	return output
}

func expertHandoffOutputIsRich(output string) bool {
	text := strings.TrimSpace(output)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "state:") || strings.Contains(lower, "workflow_state") {
		return false
	}
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(text)) {
		return true
	}
	if strings.Count(text, "\n") >= 2 {
		return true
	}
	for _, token := range []string{
		"staged", "selected", "station", "artifact", "plot", "resource",
		"resolved", "profile", "coverage", "provenance", "trust", "limitation",
	} {
		if strings.Contains(lower, token) {
			return true
		}
	}
	return len(text) > 180
}

func formattedWorkflowStateSummary(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	return lower == "state:" || strings.HasPrefix(lower, "state:\n")
}

func containsFormattedWorkflowStateSummary(text string) bool {
	text = strings.TrimSpace(text)
	if formattedWorkflowStateSummary(text) {
		return true
	}
	return strings.Contains(strings.ToLower(text), "\nstate:\n")
}

func expertHandoffStageLabel(stage string) string {
	stage = strings.TrimSpace(stage)
	switch strings.ToLower(stage) {
	case "delegate.started", "delegation.started":
		return "delegating"
	case "delegate.completed", "delegation.completed":
		return "returned"
	case "parent.resumed", "parent_resumed":
		return "parent resumed"
	case "agent.invocation.started", "invocation.started":
		return "started"
	case "agent.invocation.completed", "invocation.completed":
		return "routed"
	case "agent.invocation.failed", "invocation.failed":
		return "failed"
	default:
		return stage
	}
}

func expertHandoffStarted(stage string, status string) bool {
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	return strings.Contains(stage, "started") || status == "running"
}

func expertHandoffFailed(status string, metadata map[string]any) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "failure" || status == "failed" || status == "error" {
		return true
	}
	return strings.TrimSpace(expertHandoffErrorSummary(metadata["error"])) != ""
}

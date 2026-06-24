package ui

// live_semantic_event_summaries.go builds human-readable summaries for semantic event payloads.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func semanticUserSummary(payload map[string]any, eventType string) string {
	rawSummary := strings.TrimSpace(stringValue(payload["summary"]))
	summary := rawSummary
	nested := mapValue(payload["payload"])
	if summary == "" {
		rawSummary = strings.TrimSpace(stringValue(nested["summary"]))
		summary = rawSummary
	}
	if markerSummary := semanticLifecycleMarkerSummary(rawSummary); markerSummary != "" {
		summary = markerSummary
	}
	outputSummary := semanticNestedOutputSummary(payload, nested)
	summary = stripSemanticControlContracts(summary)
	if workflowSummary := summarizeEmbeddedWorkflowStateText(summary); workflowSummary != "" {
		summary = workflowSummary
	}
	intent := semanticControlIntentSummary(payload, eventType, rawSummary)
	if outputSummary != "" && (summary == "" || semanticSummaryIsPlumbing(summary, eventType)) {
		return appendSemanticControlIntent(outputSummary, intent)
	}
	if failure := semanticFailureSummary(payload, eventType); failure != "" {
		if summary == "" || semanticSummaryIsPlumbing(summary, eventType) || semanticSummaryIsGenericFailure(summary) {
			return appendSemanticControlIntent(failure, intent)
		}
	}
	fallback := semanticWorkflowFallbackSummary(payload, eventType)
	if summary == "" || semanticSummaryIsPlumbing(summary, eventType) {
		if fallback != "" {
			return appendSemanticControlIntent(fallback, intent)
		}
	}
	if summary == "" {
		summary = humanizeSemanticEventType(eventType)
	}
	return appendSemanticControlIntent(summary, intent)
}

func semanticNestedOutputSummary(payload map[string]any, nested map[string]any) string {
	summary := firstNonEmpty(
		stringValue(nested["output_summary"]),
		stringValue(payload["output_summary"]),
		stringValue(nested["result_summary"]),
		stringValue(payload["result_summary"]),
		stringValue(nested["return_summary"]),
		stringValue(payload["return_summary"]),
		stringValue(nested["observation_summary"]),
		stringValue(payload["observation_summary"]),
	)
	if markerSummary := semanticLifecycleMarkerSummary(summary); markerSummary != "" {
		summary = markerSummary
	}
	summary = stripSemanticControlContracts(summary)
	if summary == "" {
		return semanticStructuredOutputSummary(payload, nested)
	}
	if workflowSummary := summarizeEmbeddedWorkflowStateText(summary); workflowSummary != "" {
		return workflowSummary
	}
	return summarizeExpertHandoffOutput(summary)
}

func semanticStructuredValueSummary(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		text := stripSemanticControlContracts(typed)
		if text == "" || semanticSummaryIsPlumbing(text, "") {
			return ""
		}
		return summarizeExpertHandoffOutput(text)
	case map[string]any:
		if summary := summarizeStructuredHandoffObject(typed); summary != "" {
			return summary
		}
		if summary := summarizeToolResult("", typed); summary != "" {
			return summary
		}
		if artifact := firstStringValue(typed, "artifact_path", "output_path", "plot_path", "artifact", "path", "file", "filepath"); artifact != "" {
			return "artifact: " + shortenPathForInline(artifact)
		}
		return summarizeGenericStructuredObject(typed)
	case []any:
		if text := summarizeAnyItems(typed); text != "" {
			return "items: " + text
		}
	}
	return ""
}

func semanticLifecycleMarkerSummary(text string) string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" {
		return ""
	}
	markers := []struct {
		token string
		label string
	}{
		{token: "ISSUE_RESOLVED", label: "Issue resolved"},
		{token: "ISSUE_CLOSED", label: "Issue closed"},
		{token: "BLOCKER_RESOLVED", label: "Blocker resolved"},
		{token: "TASK_COMPLETED", label: "Task completed"},
	}
	upper := strings.ToUpper(text)
	for _, marker := range markers {
		idx := strings.Index(upper, marker.token)
		if idx < 0 {
			continue
		}
		after := strings.TrimSpace(text[idx+len(marker.token):])
		after = strings.TrimLeft(after, ":=- ")
		if after == "" {
			return marker.label + "."
		}
		return marker.label + ": " + textutil.Truncate(after, 240)
	}
	return ""
}

func semanticWorkflowFallbackSummary(payload map[string]any, eventType string) string {
	refs := semanticWorkflowRefs(payload, eventType)
	nested := mapValue(payload["payload"])
	agent := strings.TrimSpace(refs.agent)
	parent := strings.TrimSpace(refs.parent)
	switch {
	case strings.HasPrefix(eventType, "blueprint.delegation."):
		stage := strings.ToLower(strings.TrimSpace(refs.stage))
		switch {
		case strings.Contains(stage, "started"):
			if parent != "" && agent != "" {
				return parent + " handed work to " + agent + "."
			}
			if agent != "" {
				return agent + " started."
			}
		case strings.Contains(stage, "completed"):
			if agent != "" && parent != "" {
				return agent + " returned evidence to " + parent + "."
			}
			if agent != "" {
				return agent + " returned evidence."
			}
		case strings.Contains(stage, "failed") || refs.status == "failed" || refs.status == "error":
			if agent != "" && parent != "" {
				return agent + " failed while returning to " + parent + "."
			}
			if agent != "" {
				return agent + " failed."
			}
		}
	case strings.HasPrefix(eventType, "agent.invocation."):
		if agent == "" {
			return ""
		}
		switch {
		case strings.Contains(eventType, ".started"):
			return agent + " started."
		case strings.Contains(eventType, ".completed"):
			selected := firstNonEmpty(
				stringValue(nested["selected_expert"]),
				stringValue(payload["selected_expert"]),
				stringValue(nested["selected_agent"]),
				stringValue(payload["selected_agent"]),
			)
			routeReason := firstNonEmpty(
				stringValue(nested["route_reason"]),
				stringValue(payload["route_reason"]),
				stringValue(nested["reason"]),
				stringValue(payload["reason"]),
			)
			if selected != "" && routeReason != "" {
				return agent + " selected " + selected + " - " + textutil.Truncate(routeReason, 180)
			}
			if selected != "" {
				return agent + " selected " + selected + "."
			}
			return agent + " completed."
		case strings.Contains(eventType, ".failed") || refs.status == "failed" || refs.status == "error":
			return agent + " failed."
		}
	}
	return ""
}

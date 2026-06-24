package ui

// detail_view_semantic_operator.go builds the operator-facing semantic-event detail summary rows.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func appendSemanticEventOperatorView(rows []string, event map[string]any) []string {
	payload := mapValue(event["payload"])
	actor := mapValue(event["actor"])
	subject := mapValue(event["subject"])
	blueprint := mapValue(event["blueprint"])
	provider := mapValue(event["provider"])

	tool := firstNonEmpty(
		runtimeScalar(payload["tool"]),
		runtimeScalar(payload["tool_name"]),
		runtimeScalar(actor["tool"]),
		runtimeScalar(actor["tool_name"]),
		runtimeScalar(subject["tool"]),
		runtimeScalar(subject["tool_name"]),
	)
	agent := firstNonEmpty(
		runtimeScalar(actor["agent_id"]),
		runtimeScalar(actor["agent"]),
		runtimeScalar(subject["agent_id"]),
		runtimeScalar(subject["agent"]),
		runtimeScalar(payload["agent_id"]),
	)
	workflow := firstNonEmpty(
		runtimeScalar(blueprint["id"]),
		runtimeScalar(blueprint["agent_blueprint_id"]),
		runtimeScalar(blueprint["pack_id"]),
	)
	model := firstNonEmpty(
		runtimeScalar(provider["model_id"]),
		runtimeScalar(provider["model"]),
	)
	providerLabel := semanticProviderLabel(provider)
	apiBase := firstNonEmpty(runtimeScalar(provider["api_base"]), runtimeScalar(provider["base_url"]))
	status := runtimeScalar(event["status"])
	if status == "" {
		status = runtimeScalar(payload["status"])
	}
	if ok, known := optionalBoolValue(firstNonNil(payload["ok"], event["ok"])); known {
		if ok {
			status = firstNonEmpty(status, "completed")
		} else {
			status = firstNonEmpty(status, "failed")
		}
	}
	duration := ""
	if ms, ok := floatValue(firstNonNil(payload["duration_ms"], event["duration_ms"])); ok && ms > 0 {
		duration = fmt.Sprintf("%.0fms", ms)
	}
	argsPreview := semanticArgsPreview(payload, event)
	workflowSummary := workflowStateSummary(firstNonEmptyMap(
		mapValue(payload["workflow_state"]),
		mapValue(event["workflow_state"]),
	))
	userSummary := semanticEventReadableResult(event)
	failureSummary := semanticFailureSummary(event, runtimeScalar(event["event_type"]))
	fallbackSummary := semanticStreamFallbackSummary(event)
	fields := []detailField{
		{"result", userSummary},
		{"status", status},
		{"failure", failureSummary},
		{"fallback", fallbackSummary},
		{"agent", humanizeSemanticOperatorValue(agent)},
		{"workflow state", workflowSummary},
		{"duration", duration},
		{"input", argsPreview},
	}
	if strings.TrimSpace(tool) != "" {
		fields = append(fields, detailField{"tool", toolDisplayName(tool)})
	}
	if workflow != "" {
		fields = append(fields, detailField{"workflow", workflow})
	}
	if providerLabel != "" {
		fields = append(fields, detailField{"provider", providerLabel})
	}
	if model != "" {
		fields = append(fields, detailField{"model", model})
	}
	if apiBase != "" {
		fields = append(fields, detailField{"endpoint", apiBase})
	}
	return appendDetailSection(rows, "Operator view", fields...)
}

func semanticEventReadableResult(event map[string]any) string {
	eventType := runtimeScalar(event["event_type"])
	if strings.HasPrefix(eventType, "tool.call.") {
		payload := semanticToolPayload(event)
		tool := firstNonEmpty(
			runtimeScalar(payload["tool"]),
			runtimeScalar(payload["tool_name"]),
			runtimeScalar(mapValue(event["actor"])["tool"]),
			runtimeScalar(mapValue(event["actor"])["tool_name"]),
			runtimeScalar(mapValue(event["subject"])["tool"]),
			runtimeScalar(mapValue(event["subject"])["tool_name"]),
			"tool",
		)
		if strings.HasSuffix(eventType, ".completed") {
			duration, hasDuration := floatValue(firstNonNil(payload["duration_ms"], event["duration_ms"]))
			cached, hasCached := firstNonNil(payload["cached"], event["cached"]).(bool)
			summary := semanticToolCompletionSummary(
				tool,
				runtimeScalar(event["summary"]),
				payload,
				event,
				duration,
				hasDuration,
				cached,
				hasCached,
			)
			if strings.TrimSpace(summary) != "" {
				return compactSemanticDetailResult(summary)
			}
		}
		if strings.HasSuffix(eventType, ".started") {
			if args := semanticInlineArgsPreview(payload, event); args != "" {
				return toolDisplayName(tool) + " started with " + args
			}
			return toolDisplayName(tool) + " started."
		}
	}
	return compactSemanticDetailResult(semanticUserSummary(event, eventType))
}

func compactSemanticDetailResult(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if looksLikeMarkdownBlock(text) {
		return truncateMarkdownBlock(text, 650, 10)
	}
	lines := strings.Split(text, "\n")
	if len(lines) > 8 {
		return strings.TrimSpace(strings.Join(lines[:8], "\n")) + "\n\n_full result available below_"
	}
	return textutil.Truncate(text, 720)
}

func firstNonEmptyMap(values ...map[string]any) map[string]any {
	for _, value := range values {
		if len(value) > 0 {
			return value
		}
	}
	return nil
}

func humanizeSemanticOperatorValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return humanizeAgentLabel(value)
}

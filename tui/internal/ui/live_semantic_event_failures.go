package ui

// live_semantic_event_failures.go summarizes failure/fallback semantic events.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func semanticFailureSummary(payload map[string]any, eventType string) string {
	status := strings.ToLower(strings.TrimSpace(stringValue(payload["status"])))
	if status != "failed" && status != "error" && !strings.Contains(eventType, ".failed") && !strings.Contains(eventType, ".degraded") {
		return ""
	}
	nested := mapValue(payload["payload"])
	errorInfo := firstNonEmptyMap(mapValue(payload["error_info"]), mapValue(nested["error_info"]))
	details := mapValue(errorInfo["details"])
	code := firstNonEmpty(
		stringValue(errorInfo["error"]),
		stringValue(nested["error"]),
		stringValue(payload["error"]),
		stringValue(details["error"]),
	)
	message := firstNonEmpty(
		stringValue(errorInfo["message"]),
		stringValue(nested["message"]),
		stringValue(payload["message"]),
		stringValue(details["message"]),
		semanticStreamFallbackSummary(payload),
	)
	if message == "" {
		return ""
	}
	message = strings.TrimSpace(strings.Join(strings.Fields(message), " "))
	message = strings.ReplaceAll(message, "before emitting output", "before visible output")
	message = strings.TrimSuffix(message, ".")
	label := "Failure"
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "provider_error":
		label = "Provider error"
	case "tool_error":
		label = "Tool error"
	case "permission_error":
		label = "Permission error"
	case "hook_error":
		label = "Hook error"
	case "":
		if strings.HasPrefix(eventType, "turn.") {
			label = "Turn failed"
		}
	default:
		label = humanizeSemanticEventType(code)
	}
	if provider := semanticProviderLabel(mapValue(payload["provider"])); provider != "" {
		message += " (" + provider + ")"
	}
	return textutil.Truncate(label+": "+message+".", 320)
}

func semanticSummaryIsGenericFailure(summary string) bool {
	normalized := strings.ToLower(strings.TrimSpace(strings.Join(strings.Fields(summary), " ")))
	normalized = strings.Trim(normalized, " .")
	return normalized == "turn failed" ||
		strings.HasPrefix(normalized, "turn failed:") ||
		strings.HasPrefix(normalized, "llm request failed") ||
		strings.Contains(normalized, "hook dispatch failed") ||
		strings.HasPrefix(normalized, "clio turn failed:") ||
		strings.HasPrefix(normalized, "provider error")
}

func semanticStreamFallbackSummary(payload map[string]any) string {
	nested := mapValue(payload["payload"])
	errorInfo := firstNonEmptyMap(mapValue(payload["error_info"]), mapValue(nested["error_info"]))
	metadata := mapValue(errorInfo["metadata"])
	fallback := firstNonEmptyMap(
		mapValue(payload["stream_fallback"]),
		mapValue(nested["stream_fallback"]),
		mapValue(errorInfo["stream_fallback"]),
		mapValue(metadata["stream_fallback"]),
	)
	if len(fallback) == 0 {
		return ""
	}
	category := strings.TrimSpace(stringValue(fallback["category"]))
	description := strings.TrimSpace(stringValue(fallback["description"]))
	switch {
	case category != "" && description != "":
		return category + ": " + description
	case description != "":
		return description
	default:
		return category
	}
}

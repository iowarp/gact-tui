package ui

// live_semantic_tool_summary.go builds semantic tool-completion summaries and args previews.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func semanticToolCompletionSummary(toolName string, summaryText string, toolPayload map[string]any, eventPayload map[string]any, duration float64, hasDuration bool, cached bool, hasCached bool) string {
	summary := stripSemanticControlContracts(summaryText)
	if !isGenericToolCompletionSummary(summary, toolName) {
		return summary
	}
	resultPayload := firstNonNil(
		toolPayload["result"],
		toolPayload["output"],
		toolPayload["stdout"],
		toolPayload["artifact"],
		eventPayload["result"],
		eventPayload["output"],
		eventPayload["stdout"],
		eventPayload["artifact"],
	)
	if text := toolEvidenceResultText(toolName, resultPayload); text != "" {
		return text
	}
	if text := summarizeToolResult(toolName, semanticToolEvidencePayload(toolPayload)); text != "" {
		return text
	}
	if text := summarizeToolResult(toolName, semanticToolEvidencePayload(eventPayload)); text != "" {
		return text
	}
	name := strings.TrimSpace(toolName)
	if name == "" {
		name = "tool"
	}
	if display := strings.TrimSpace(toolDisplayName(name)); display != "" {
		name = display
	}
	parts := []string{name + " completed"}
	if hasDuration && duration > 0 {
		parts = append(parts, fmt.Sprintf("%.0fms", duration))
	}
	if hasCached && cached {
		parts = append(parts, "cached")
	}
	if args := semanticInlineArgsPreview(toolPayload, eventPayload); args != "" {
		parts = append(parts, textutil.Truncate("args: "+args, 120))
	}
	return strings.Join(parts, " · ")
}

func semanticToolEvidencePayload(payload map[string]any) map[string]any {
	if len(payload) == 0 {
		return nil
	}
	bookkeeping := map[string]bool{
		"tool": true, "tool_name": true, "name": true,
		"call_id": true, "id": true,
		"ok": true, "cached": true,
		"duration_ms": true, "telemetry_source": true,
		"args": true, "args_preview": true,
		"payload":  true,
		"event_id": true, "session_id": true, "workspace_id": true,
		"trace_id": true, "turn_id": true, "span_id": true, "parent_span_id": true,
		"event_type": true, "detail_level": true, "live_observed": true, "occurred_at": true,
		"actor": true, "subject": true, "blueprint": true, "provider": true,
		"schema_version": true, "summary": true,
	}
	out := make(map[string]any)
	for key, value := range payload {
		normalized := strings.ToLower(strings.TrimSpace(key))
		if bookkeeping[normalized] {
			continue
		}
		if normalized == "status" || normalized == "state" {
			status := strings.ToLower(strings.TrimSpace(stringValue(value)))
			switch status {
			case "", "completed", "complete", "success", "ok", "done", "running", "started":
				continue
			}
		}
		out[key] = value
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func semanticInlineArgsPreview(toolPayload map[string]any, eventPayload map[string]any) string {
	text := semanticArgsPreview(toolPayload, eventPayload)
	if semanticPreviewIsInlineRedaction(text) {
		return ""
	}
	return text
}

func semanticArgsPreview(toolPayload map[string]any, eventPayload map[string]any) string {
	text := firstNonEmpty(
		stringValue(toolPayload["args_preview"]),
		stringValue(eventPayload["args_preview"]),
		stringValue(toolPayload["args"]),
		stringValue(eventPayload["args"]),
	)
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if semanticPreviewIsRedacted(text) {
		return "input redacted by runtime"
	}
	return text
}

func semanticPreviewIsInlineRedaction(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	normalized = strings.Trim(normalized, ". ")
	return normalized == "input redacted by runtime" || semanticPreviewIsRedacted(text)
}

func semanticPreviewIsRedacted(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	normalized = strings.Trim(normalized, ". ")
	switch normalized {
	case "[redacted]", "redacted", "<redacted>", "(redacted)":
		return true
	default:
		return strings.Contains(normalized, "[redacted]")
	}
}

func isGenericToolCompletionSummary(summary string, toolName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(summary))
	normalized = strings.Trim(normalized, " .")
	switch normalized {
	case "", "completed", "complete", "done", "success", "ok", "tool completed", "tool call completed":
		return true
	}
	tool := strings.ToLower(strings.TrimSpace(toolName))
	tool = strings.Trim(tool, " .")
	if tool != "" {
		display := strings.ToLower(strings.TrimSpace(toolDisplayName(toolName)))
		display = strings.Trim(display, " .")
		for _, candidate := range []string{
			tool + " completed",
			"tool " + tool + " completed",
			display + " completed",
			"tool " + display + " completed",
		} {
			candidate = strings.TrimSpace(candidate)
			if candidate != "" && normalized == candidate {
				return true
			}
		}
	}
	return strings.HasPrefix(normalized, "tool ") && strings.HasSuffix(normalized, " completed")
}

func semanticToolPayload(payload map[string]any) map[string]any {
	if nested := mapValue(payload["payload"]); len(nested) > 0 {
		return nested
	}
	return payload
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

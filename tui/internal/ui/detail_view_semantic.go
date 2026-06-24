package ui

// detail_view_semantic.go appends semantic-event detail rows to the detail view.

import (
	"os"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func isSemanticEventPart(p gact.Part) bool {
	return p.Metadata != nil && p.Metadata["semantic_event"] == true && len(mapValue(p.Metadata["raw_event"])) > 0
}

func appendSemanticEventDetail(rows []string, event map[string]any) []string {
	if len(event) == 0 {
		return rows
	}
	userSummary := semanticEventReadableResult(event)
	rows = appendSemanticEventOperatorView(rows, event)
	rows = appendDetailSection(rows, "Event summary",
		detailField{"what happened", userSummary},
		detailField{"status", runtimeScalar(event["status"])},
		detailField{"event", runtimeScalar(event["event_type"])},
		detailField{"stream", semanticEventStreamLabel(event["live_observed"])},
		detailField{"time", runtimeScalar(event["occurred_at"])},
	)
	rows = appendDetailSection(rows, "Workflow trace",
		detailField{"session", runtimeScalar(event["session_id"])},
		detailField{"workspace", runtimeScalar(event["workspace_id"])},
		detailField{"trace", runtimeScalar(event["trace_id"])},
		detailField{"turn", runtimeScalar(event["turn_id"])},
		detailField{"span", runtimeScalar(event["span_id"])},
		detailField{"parent span", runtimeScalar(event["parent_span_id"])},
	)
	rows = appendDetailSection(rows, "Technical trace",
		detailField{"format", runtimeScalar(event["schema_version"])},
		detailField{"event", runtimeScalar(event["event_id"])},
		detailField{"detail", runtimeScalar(event["detail_level"])},
	)
	rows = appendSemanticEventMapSection(rows, "Actor", mapValue(event["actor"]),
		"agent_id", "agent", "role", "tool", "tool_name", "provider_id", "model_id", "kind", "source", "execution_mode")
	rows = appendSemanticEventMapSection(rows, "Subject", mapValue(event["subject"]),
		"agent_id", "parent_id", "child_id", "role", "tool", "tool_name", "call_id", "message_id", "path", "artifact_type")
	rows = appendSemanticEventMapSection(rows, "Blueprint", mapValue(event["blueprint"]),
		"id", "agent_blueprint_id", "pack_id", "version", "pack_version", "scope", "definition_path")
	rows = appendSemanticEventMapSection(rows, "Provider", mapValue(event["provider"]),
		"provider_id", "model_id", "model", "source")
	rows = appendSemanticEventMapSection(rows, "Tool evidence", mapValue(event["payload"]),
		"stage", "status", "parent_id", "agent_id", "return_to", "resumed_from", "tool", "tool_name", "call_id", "ok", "duration_ms", "cached", "telemetry_source", "args_preview", "args", "input_preview", "input", "error", "message", "path", "artifact_type")
	if semanticRawEventDetailEnabled() {
		rows = appendAnyJSONSection(rows, "Raw semantic event", event)
	}
	return rows
}

func semanticRawEventDetailEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GACT_SEMANTIC_RAW_EVENT_DETAIL"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func semanticEventStreamLabel(v any) string {
	switch value := v.(type) {
	case bool:
		if value {
			return "live"
		}
		return "batch"
	case string:
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "true", "live", "yes":
			return "live"
		case "false", "batch", "recorded", "no":
			return "batch"
		default:
			return strings.TrimSpace(value)
		}
	default:
		return runtimeScalar(v)
	}
}

func appendSemanticEventMapSection(rows []string, title string, m map[string]any, preferred ...string) []string {
	if len(m) == 0 {
		return rows
	}
	fields := make([]detailField, 0, len(m))
	seen := map[string]bool{}
	for _, key := range preferred {
		if value := semanticEventDetailValue(key, m[key]); value != "" {
			fields = append(fields, detailField{semanticEventDetailLabel(key), value})
			seen[key] = true
		}
	}
	for _, key := range sortedAnyMapKeys(m) {
		if seen[key] {
			continue
		}
		if value := semanticEventDetailValue(key, m[key]); value != "" {
			fields = append(fields, detailField{semanticEventDetailLabel(key), value})
		}
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func semanticEventDetailValue(key string, value any) string {
	text := runtimeScalar(value)
	switch key {
	case "args", "args_preview", "input", "input_preview":
		if semanticPreviewIsRedacted(text) {
			return "input redacted by runtime"
		}
	}
	return text
}

func semanticEventDetailLabel(key string) string {
	switch key {
	case "artifact_type":
		return "artifact type"
	case "args", "args_preview", "input", "input_preview":
		return "input"
	case "call_id":
		return "call"
	case "child_id":
		return "child"
	case "detail_level":
		return "detail"
	case "event_id":
		return "event"
	case "event_type":
		return "type"
	case "live_observed":
		return "live"
	case "occurred_at":
		return "time"
	case "pack_id":
		return "pack"
	case "pack_version":
		return "pack version"
	case "parent_span_id":
		return "parent span"
	case "resumed_from":
		return "resumed from"
	case "span_id":
		return "span"
	case "telemetry_source":
		return "telemetry"
	default:
		return runtimeProvenanceLabel(key)
	}
}

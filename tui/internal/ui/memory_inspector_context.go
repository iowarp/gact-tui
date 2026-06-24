package ui

// memory_inspector_context.go appends context-frame rows to the memory inspector.

import (
	"fmt"
	"strings"
)

func appendContextFrameRows(rows []string, frames []map[string]any) []string {
	latest := frames[len(frames)-1]
	items := contextFrameItems(latest)
	messageItems, fileItems, errorItems := 0, 0, 0
	for _, item := range items {
		switch stringValue(item["kind"]) {
		case "message":
			messageItems++
		case "context_file":
			fileItems++
		}
		if included, ok := item["included"].(bool); ok && !included {
			errorItems++
		}
	}
	rows = appendDetailSection(rows, "Context frame",
		detailField{"frame id", stringValue(latest["id"])},
		detailField{"status", stringValue(latest["status"])},
		detailField{"turn", firstNonEmpty(stringValue(latest["turn_id"]), stringValue(latest["user_message_id"]))},
		detailField{"assistant message", stringValue(latest["assistant_message_id"])},
		detailField{"estimated tokens", scalarText(latest["tokens_estimated"])},
		detailField{"items", fmt.Sprintf("%d messages · %d files · %d excluded", messageItems, fileItems, errorItems)},
	)
	if agent := mapValue(latest["agent"]); len(agent) > 0 {
		if summary := contextMapSummary(agent, "id", "mode", "routing_mode", "session_mode", "edit_mode"); summary != "" {
			rows = append(rows, detailFieldRows("agent", summary)...)
		}
	}
	if prompt := mapValue(latest["prompt"]); len(prompt) > 0 {
		if summary := contextMapSummary(prompt, "id", "profile", "source", "checksum"); summary != "" {
			rows = append(rows, detailFieldRows("prompt", summary)...)
		}
	}
	if model := mapValue(latest["model"]); len(model) > 0 {
		if summary := contextMapSummary(model, "provider_id", "model_id", "variant"); summary != "" {
			rows = append(rows, detailFieldRows("model", summary)...)
		}
	}
	displayItems := contextFrameDisplayItems(items)
	for i, item := range displayItems {
		if i >= 6 {
			rows = append(rows, detailFieldRows("more items", fmt.Sprintf("%d hidden", len(displayItems)-i))...)
			break
		}
		label := firstNonEmpty(stringValue(item["kind"]), "item")
		if source := firstNonEmpty(stringValue(item["display_path"]), stringValue(item["path"]), stringValue(item["source_id"])); source != "" {
			label += " · " + source
		}
		body := []string{
			"included: " + scalarText(item["included"]),
			"reason: " + stringValue(item["reason"]),
			"tokens: " + scalarText(item["tokens_estimated"]),
		}
		if role := stringValue(item["role"]); role != "" {
			body = append(body, "role: "+role)
		}
		rows = append(rows, detailFieldRows(label, strings.Join(body, "\n"))...)
	}
	if metadata := mapValue(latest["metadata"]); len(metadata) > 0 {
		rows = append(rows, detailFieldRows("frame metadata", contextMapSummary(metadata, "retained_context_source", "token_estimate", "context_file_injected_chars"))...)
		if detailErr := stringValue(metadata["detail_error"]); detailErr != "" {
			rows = append(rows, detailFieldRows("detail error", detailErr)...)
		}
	}
	return rows
}

func contextFrameDisplayItems(items []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	appendMatching := func(match func(map[string]any) bool) {
		for _, item := range items {
			if match(item) {
				out = append(out, item)
			}
		}
	}
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return ok && !included
	})
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return stringValue(item["kind"]) == "context_file" && (!ok || included)
	})
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return !((ok && !included) || stringValue(item["kind"]) == "context_file")
	})
	return out
}

func contextFrameItems(frame map[string]any) []map[string]any {
	raw, _ := frame["items"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if row := mapValue(item); len(row) > 0 {
			out = append(out, row)
		}
	}
	return out
}

func contextMapSummary(m map[string]any, keys ...string) string {
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		if value := scalarText(m[key]); strings.TrimSpace(value) != "" {
			if key == "source" || key == "retained_context_source" {
				value = memorySourceText(value)
			}
			parts = append(parts, memoryContextLabel(key)+": "+value)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	return ""
}

func memoryContextLabel(key string) string {
	switch key {
	case "id":
		return "id"
	case "provider_id":
		return "provider"
	case "model_id":
		return "model"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

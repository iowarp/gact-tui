package ui

// render_handoffs_structured.go summarizes structured (JSON) handoff output objects.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func summarizeEmbeddedStructuredHandoffText(output string) string {
	output = strings.TrimSpace(strings.Join(strings.Fields(output), " "))
	start := strings.IndexByte(output, '{')
	if start < 0 {
		return ""
	}
	end := matchingJSONObjectEnd(output[start:])
	if end < 0 {
		return ""
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(output[start:start+end]), &obj); err != nil {
		return ""
	}
	summary := summarizeStructuredHandoffObject(obj)
	if summary == "" {
		return ""
	}
	prefix := strings.TrimSpace(output[:start])
	prefix = strings.TrimRight(prefix, ":. -")
	if handoffPrefixIsNoise(prefix) {
		return summary
	}
	if prefix == "" {
		return summary
	}
	return textutil.Truncate(prefix+" · "+summary, 320)
}

func handoffPrefixIsNoise(prefix string) bool {
	normalized := strings.ToLower(strings.TrimSpace(prefix))
	normalized = strings.Trim(normalized, ":. -")
	if normalized == "" {
		return true
	}
	noise := []string{
		"retained typed workflow state",
		"clio durable typed workflow state",
		"typed workflow state",
		"workflow state",
	}
	for _, item := range noise {
		if strings.Contains(normalized, item) {
			return true
		}
	}
	return false
}

func summarizeStructuredHandoffObject(obj map[string]any) string {
	if len(obj) == 0 {
		return ""
	}
	if summary := summarizeStructuredHandoffObjectStatus(obj); summary != "" {
		return summary
	}
	if state := mapValue(obj["workflow_state"]); len(state) > 0 {
		if summary := workflowStateBlockSummary(state); summary != "" {
			return summary
		}
	}
	if summary := summarizeRegionResolutionObject(obj); summary != "" {
		return summary
	}
	if summary := summarizeToolResult("", obj); summary != "" {
		return summary
	}
	return summarizeGenericStructuredObject(obj)
}

func summarizeStructuredHandoffObjectStatus(obj map[string]any) string {
	if summary := summarizeErrorResult(obj); summary != "" {
		return summary
	}
	rows := []string{}
	if code := firstStringValue(obj, "error", "code", "type"); code != "" {
		rows = append(rows, "status: "+code)
	}
	if message := firstStringValue(obj, "message", "summary"); message != "" {
		rows = append(rows, "message: "+shortenKnownPaths(message))
	}
	if details, ok := obj["details"].(map[string]any); ok {
		if stage := firstStringValue(details, "stage"); stage != "" {
			rows = append(rows, "stage: "+stage)
		}
		if stepLimit, ok := floatValue(details["step_limit"]); ok {
			rows = append(rows, fmt.Sprintf("step limit: %.0f", stepLimit))
		}
		if actions := summarizeNamedItems(details, "recovery_actions"); actions != "" {
			rows = append(rows, "recovery: "+actions)
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeRegionResolutionObject(obj map[string]any) string {
	label := firstNonEmpty(
		firstStringValue(obj, "REGION_LABEL", "region_label", "label", "location", "place"),
	)
	lat, hasLat := firstNumericValue(obj, "CENTER_LAT", "center_lat", "lat", "latitude")
	lon, hasLon := firstNumericValue(obj, "CENTER_LON", "center_lon", "lon", "longitude")
	radius, hasRadius := firstNumericValue(obj, "RADIUS_KM", "radius_km", "radius")
	confidence := firstStringValue(obj, "CONFIDENCE", "confidence")
	if label == "" && !hasLat && !hasLon && !hasRadius && confidence == "" {
		return ""
	}
	var parts []string
	if label != "" {
		parts = append(parts, "resolved region: "+label)
	} else {
		parts = append(parts, "resolved region")
	}
	if hasLat && hasLon {
		parts = append(parts, "center "+formatCompactFloat(lat)+", "+formatCompactFloat(lon))
	}
	if hasRadius {
		parts = append(parts, "radius "+formatCompactFloat(radius)+" km")
	}
	if confidence != "" {
		parts = append(parts, "confidence "+confidence)
	}
	return strings.Join(parts, " · ")
}

func firstNumericValue(result map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if value, ok := floatValue(result[key]); ok {
			return value, true
		}
	}
	return 0, false
}

func summarizeGenericStructuredObject(obj map[string]any) string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		label := strings.TrimSpace(key)
		if label == "" || genericStructuredKeyIsNoise(label) {
			continue
		}
		value := genericStructuredValueSummary(label, obj[key])
		if value == "" {
			continue
		}
		parts = append(parts, humanizeStructuredKey(label)+": "+value)
		if len(parts) >= 4 {
			break
		}
	}
	if len(parts) == 0 {
		return "structured evidence available"
	}
	return "structured evidence: " + strings.Join(parts, " · ")
}

func genericStructuredKeyIsNoise(key string) bool {
	lower := strings.ToLower(key)
	return lower == "_meta" ||
		strings.Contains(lower, "metadata_source_url") ||
		strings.Contains(lower, "source_url") ||
		strings.Contains(lower, "download") ||
		strings.Contains(lower, "raw")
}

func genericStructuredValueSummary(key string, raw any) string {
	switch value := raw.(type) {
	case nil:
		return ""
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return ""
		}
		lower := strings.ToLower(key)
		if strings.Contains(lower, "path") || strings.Contains(lower, "file") {
			return shortenPathForInline(text)
		}
		return textutil.Truncate(shortenKnownPaths(text), 80)
	case bool:
		if value {
			return "yes"
		}
		return "no"
	case float64:
		return formatCompactFloat(value)
	case json.Number:
		return value.String()
	case []any:
		if len(value) == 0 {
			return ""
		}
		if items := summarizeAnyItems(value); items != "" {
			return textutil.Truncate(items, 80)
		}
	case map[string]any:
		if status := firstStringValue(value, "status", "state"); status != "" {
			return status
		}
		if summary := firstStringValue(value, "summary", "message", "description"); summary != "" {
			return textutil.Truncate(shortenKnownPaths(summary), 80)
		}
		if len(value) > 0 {
			return fmt.Sprintf("%d fields", len(value))
		}
	}
	return ""
}

func humanizeStructuredKey(key string) string {
	key = strings.TrimSpace(key)
	key = strings.ReplaceAll(key, "_", " ")
	key = strings.ReplaceAll(key, "-", " ")
	return strings.ToLower(key)
}

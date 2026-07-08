package ui

// execution_observations.go builds compact execution observation previews and noise filtering.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func executionArgsPreview(args any) string {
	obj := valuefmt.MapValue(args)
	if len(obj) == 0 {
		if text := strings.TrimSpace(valuefmt.StringValue(args)); text != "" && !semanticPreviewIsRedacted(text) {
			return textutil.Truncate(strings.Join(strings.Fields(text), " "), 140)
		}
		return ""
	}
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		value := executionCompactValue(obj[key])
		if value == "" || semanticPreviewIsRedacted(value) {
			continue
		}
		parts = append(parts, key+": "+value)
	}
	return textutil.Truncate(strings.Join(parts, " · "), 180)
}

func executionCompactValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case []any:
		items := make([]string, 0, len(v))
		for _, item := range v {
			text := executionCompactValue(item)
			if text != "" {
				items = append(items, text)
			}
		}
		return strings.Join(items, ", ")
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func (t Theme) executionObservationPreview(toolName string, observation any) string {
	if observation == nil {
		return ""
	}
	if preview := executionSpecificObservationPreview(toolName, observation, t.CollapseThreshold); preview != "" {
		return preview
	}
	text := toolEvidenceResultText(toolName, observation)
	if raw := strings.TrimSpace(valuefmt.StringValue(observation)); raw != "" {
		if preview := executionSpecificTextObservationPreview(toolName, raw); preview != "" {
			return preview
		}
		if summary := summarizeNonJSONToolResultText(toolName, raw); summary != "" {
			text = summary
		}
	}
	if parsed, ok := parseLooseJSON(observation); ok {
		if preview := executionSpecificObservationPreview(toolName, parsed, t.CollapseThreshold); preview != "" {
			return preview
		}
		if summary := toolEvidenceResultText(toolName, parsed); summary != "" {
			text = summary
		}
		if artifact := executionArtifactPreview(parsed); artifact != "" && (summaryLooksLikeRawJSON(text) || text == "") {
			text = artifact
		}
	}
	text = strings.TrimSpace(stripSemanticControlContracts(text))
	if semanticPreviewIsRedacted(text) || executionObservationIsNoise(text) {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(toolName)), "ndp_search") {
		if csv := firstCSVName(text); csv != "" {
			return csv
		}
	}
	visible, hidden := collapseForPreview(text, max(1, t.CollapseThreshold))
	if hidden > 0 {
		visible += "\nCtrl+E full output"
	}
	return visible
}

func executionFirstScalarValue(result map[string]any, keys ...string) string {
	for _, key := range keys {
		value := result[key]
		switch typed := value.(type) {
		case nil:
			continue
		case string:
			if text := strings.TrimSpace(typed); text != "" {
				return text
			}
		case float64:
			return formatCompactFloat(typed)
		case float32:
			return formatCompactFloat(float64(typed))
		case int:
			return fmt.Sprintf("%d", typed)
		case int64:
			return fmt.Sprintf("%d", typed)
		case json.Number:
			if f, err := typed.Float64(); err == nil {
				return formatCompactFloat(f)
			}
			if text := strings.TrimSpace(typed.String()); text != "" {
				return text
			}
		case bool:
			return fmt.Sprintf("%t", typed)
		default:
			text := strings.TrimSpace(fmt.Sprint(typed))
			if text != "" {
				return text
			}
		}
	}
	return ""
}

func firstCSVName(text string) string {
	fields := strings.FieldsFunc(text, func(r rune) bool {
		return r == '"' || r == '\'' || r == ',' || r == '[' || r == ']' || r == '{' || r == '}' || r == ':' || r == ' ' || r == '\n' || r == '\t'
	})
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if strings.HasSuffix(strings.ToLower(field), ".csv") {
			return field
		}
	}
	return ""
}

func summaryLooksLikeRawJSON(text string) bool {
	text = strings.TrimSpace(text)
	return strings.HasPrefix(text, "{") || strings.HasPrefix(text, "[")
}

func executionFinishPreview(node executionTimelineNode) string {
	text := strings.TrimSpace(valuefmt.FirstNonEmpty(valuefmt.StringValue(node.Observation), node.Summary))
	if executionObservationIsNoise(text) || semanticPreviewIsRedacted(text) {
		return ""
	}
	return text
}

func executionObservationIsNoise(text string) bool {
	normalized := strings.ToLower(strings.Trim(strings.TrimSpace(text), "."))
	switch normalized {
	case "", "completed", "complete", "done", "success", "ok":
		return true
	default:
		return false
	}
}

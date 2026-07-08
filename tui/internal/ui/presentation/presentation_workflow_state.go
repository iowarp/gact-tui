package presentation

// presentation_workflow_state.go summarizes workflow-state maps into compact display lines.

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func WorkflowStateSummary(state map[string]any) string {
	return strings.Join(workflowStateSummaryLines(state), " · ")
}

func workflowStateSummaryLines(state map[string]any) []string {
	keys := SortedWorkflowStateKeys(state)
	parts := make([]string, 0, valuefmt.MinInt(4, len(keys)))
	for _, key := range keys {
		text := workflowStateValueSummary(key, state[key])
		if text == "" {
			continue
		}
		parts = append(parts, text)
		if len(parts) == 4 {
			break
		}
	}
	return parts
}

func WorkflowStateBlockSummary(state map[string]any) string {
	return WorkflowStateBlockFromSummary(WorkflowStateSummary(state))
}

func WorkflowStateBlockFromSummary(summary string) string {
	parts := splitWorkflowStateSummaryParts(summary)
	if len(parts) == 0 {
		return ""
	}
	lines := make([]string, 0, len(parts)+1)
	lines = append(lines, "state:")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			lines = append(lines, "- "+part)
		}
	}
	return strings.Join(lines, "\n")
}

func splitWorkflowStateSummaryParts(summary string) []string {
	summary = strings.TrimSpace(summary)
	if summary == "" {
		return nil
	}
	rawParts := strings.Split(summary, " · ")
	parts := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		part = strings.TrimSpace(part)
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) > 1 {
		return parts
	}
	return valuefmt.SplitSummarySegments(summary)
}

func workflowStateValueSummary(key string, value any) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	switch v := value.(type) {
	case map[string]any:
		return workflowStateMapSummary(key, v)
	case []any:
		if len(v) == 0 {
			return ""
		}
		return valuefmt.HumanizeAgentLabel(key) + "=" + valuefmt.PluralizeCount(len(v), "item")
	default:
		text := strings.TrimSpace(valuefmt.StringValue(value))
		if text == "" {
			text = strings.TrimSpace(fmt.Sprint(value))
		}
		if text == "" || text == "<nil>" {
			return ""
		}
		return workflowStateFieldSummary(key, text)
	}
}

func workflowStateMapSummary(key string, values map[string]any) string {
	if len(values) == 0 {
		return ""
	}
	parts := make([]string, 0, 3)
	if status := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(values["status"]),
		valuefmt.StringValue(values["state"]),
		valuefmt.StringValue(values["stage"]),
	); status != "" {
		parts = append(parts, status)
	}
	for _, field := range []string{
		"artifact_path", "plot_path", "local_path", "staged_path", "filepath",
		"file", "path", "dataset_id", "resource_id", "station", "network",
		"record_count", "feature_count", "warning_count", "trace_count",
		"candidate_count", "station_count", "station_ids", "artifact",
	} {
		if len(parts) >= 3 {
			break
		}
		if text := workflowStateLeafText(values[field]); text != "" {
			parts = append(parts, workflowStateFieldSummary(field, text))
		}
	}
	if len(parts) == 0 {
		return valuefmt.HumanizeAgentLabel(key) + "=" + valuefmt.PluralizeCount(len(values), "field")
	}
	return valuefmt.HumanizeAgentLabel(key) + " " + strings.Join(parts, ", ")
}

func workflowStateFieldSummary(field, text string) string {
	field = strings.TrimSpace(field)
	text = strings.TrimSpace(text)
	if field == "" || text == "" {
		return ""
	}
	label := workflowStateFieldLabel(field)
	value := valuefmt.CompactCatalogText(text)
	if workflowStateFieldIsPath(field) {
		value = valuefmt.ShortenKnownPaths(value)
		if strings.Contains(value, "/") {
			value = filepath.Base(value)
		}
	}
	if value == "" || value == "." {
		return ""
	}
	return label + " " + textutil.Truncate(value, 44)
}

func workflowStateFieldLabel(field string) string {
	switch strings.ToLower(strings.TrimSpace(field)) {
	case "dataset_id", "dataset_identifier":
		return "dataset"
	case "resource_id":
		return "resource"
	case "record_count":
		return "records"
	case "feature_count":
		return "features"
	case "warning_count":
		return "warnings"
	case "trace_count":
		return "traces"
	case "candidate_count":
		return "candidates"
	case "station_count":
		return "stations"
	case "station_ids":
		return "stations"
	case "artifact", "artifact_path", "plot_path":
		return "artifact"
	case "local_path", "staged_path", "filepath", "file", "path":
		return "file"
	default:
		return valuefmt.HumanizeAgentLabel(field)
	}
}

func workflowStateFieldIsPath(field string) bool {
	switch strings.ToLower(strings.TrimSpace(field)) {
	case "artifact", "artifact_path", "plot_path", "local_path", "staged_path", "filepath", "file", "path":
		return true
	default:
		return false
	}
}

func workflowStateLeafText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case map[string]any:
		if name := valuefmt.FirstNonEmpty(
			valuefmt.StringValue(v["name"]),
			valuefmt.StringValue(v["path"]),
			valuefmt.StringValue(v["id"]),
			valuefmt.StringValue(v["status"]),
		); name != "" {
			return name
		}
		return ""
	case []any:
		if len(v) == 0 {
			return ""
		}
		return valuefmt.PluralizeCount(len(v), "item")
	default:
		text := strings.TrimSpace(valuefmt.StringValue(value))
		if text == "" {
			text = strings.TrimSpace(fmt.Sprint(value))
		}
		if text == "" || text == "<nil>" {
			return ""
		}
		return text
	}
}

func SortedWorkflowStateKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

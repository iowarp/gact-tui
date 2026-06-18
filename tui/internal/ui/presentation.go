package ui

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

func workflowStateSummary(state map[string]any) string {
	return strings.Join(workflowStateSummaryLines(state), " · ")
}

func workflowStateSummaryLines(state map[string]any) []string {
	keys := sortedWorkflowStateKeys(state)
	parts := make([]string, 0, minInt(4, len(keys)))
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

func workflowStateBlockSummary(state map[string]any) string {
	return workflowStateBlockFromSummary(workflowStateSummary(state))
}

func workflowStateBlockFromSummary(summary string) string {
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
	return splitSummarySegments(summary)
}

func summarizeEmbeddedWorkflowStateText(text string) string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" {
		return ""
	}
	labels := []string{
		"Retained typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO typed workflow state:",
		"workflow state:",
	}
	for _, label := range labels {
		idx := indexFold(text, label)
		if idx < 0 {
			continue
		}
		before := strings.TrimSpace(text[:idx])
		raw := strings.TrimSpace(text[idx+len(label):])
		state, ok := parseWorkflowStateJSON(raw)
		if !ok {
			continue
		}
		summary := workflowStateSummary(state)
		if summary == "" {
			continue
		}
		stateSummary := workflowStateBlockFromSummary(summary)
		if before == "" {
			return stateSummary
		}
		return strings.TrimRight(before, ".") + "\n" + stateSummary
	}
	return ""
}

func parseWorkflowStateJSON(text string) (map[string]any, bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, false
	}
	start := strings.IndexByte(text, '{')
	if start < 0 {
		return nil, false
	}
	end := matchingJSONObjectEnd(text[start:])
	if end < 0 {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(text[start:start+end]), &payload); err != nil {
		return nil, false
	}
	if state := mapValue(payload["workflow_state"]); len(state) > 0 {
		return state, true
	}
	return payload, len(payload) > 0
}

func matchingJSONObjectEnd(text string) int {
	depth := 0
	inString := false
	escaped := false
	for i, r := range text {
		if inString {
			switch {
			case escaped:
				escaped = false
			case r == '\\':
				escaped = true
			case r == '"':
				inString = false
			}
			continue
		}
		switch r {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i + 1
			}
		}
	}
	return -1
}

func indexFold(text, needle string) int {
	return strings.Index(strings.ToLower(text), strings.ToLower(needle))
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
		return humanizeAgentLabel(key) + "=" + pluralizeCount(len(v), "item")
	default:
		text := strings.TrimSpace(stringValue(value))
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
	if status := firstNonEmpty(
		stringValue(values["status"]),
		stringValue(values["state"]),
		stringValue(values["stage"]),
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
		return humanizeAgentLabel(key) + "=" + pluralizeCount(len(values), "field")
	}
	return humanizeAgentLabel(key) + " " + strings.Join(parts, ", ")
}

func workflowStateFieldSummary(field, text string) string {
	field = strings.TrimSpace(field)
	text = strings.TrimSpace(text)
	if field == "" || text == "" {
		return ""
	}
	label := workflowStateFieldLabel(field)
	value := compactCatalogText(text)
	if workflowStateFieldIsPath(field) {
		value = shortenKnownPaths(value)
		if strings.Contains(value, "/") {
			value = filepath.Base(value)
		}
	}
	if value == "" || value == "." {
		return ""
	}
	return label + " " + truncate(value, 44)
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
		return humanizeAgentLabel(field)
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
		if name := firstNonEmpty(
			stringValue(v["name"]),
			stringValue(v["path"]),
			stringValue(v["id"]),
			stringValue(v["status"]),
		); name != "" {
			return name
		}
		return ""
	case []any:
		if len(v) == 0 {
			return ""
		}
		return pluralizeCount(len(v), "item")
	default:
		text := strings.TrimSpace(stringValue(value))
		if text == "" {
			text = strings.TrimSpace(fmt.Sprint(value))
		}
		if text == "" || text == "<nil>" {
			return ""
		}
		return text
	}
}

func sortedWorkflowStateKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func toolEvidenceResultText(toolName string, raw any) string {
	if raw == nil {
		return ""
	}
	if result, ok := raw.(map[string]any); ok {
		if summary := summarizeErrorResult(result); summary != "" {
			return summary
		}
		if stdout, ok := result["stdout"].(string); ok && strings.TrimSpace(stdout) != "" {
			return strings.TrimSpace(stdout)
		}
		if errorText, ok := result["error"].(string); ok && strings.TrimSpace(errorText) != "" {
			return strings.TrimSpace(errorText)
		}
	}
	if summary := summarizeToolResult(toolName, raw); summary != "" {
		return summary
	}
	if text := compactJSON(raw); text != "" {
		return text
	}
	return fmt.Sprint(raw)
}

func summarizeToolResult(toolName string, raw any) string {
	result, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	if text := summarizeErrorResult(result); text != "" {
		return text
	}
	lowerTool := strings.ToLower(toolName)
	if strings.HasPrefix(lowerTool, "ndp_") {
		if text := summarizeNDPResult(result); text != "" {
			return text
		}
	}
	if text := summarizeFeatureCollectionResult(result); text != "" {
		return text
	}
	if strings.Contains(lowerTool, "parquet") {
		if text := summarizeTableLikeResult("parquet", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "csv") {
		if text := summarizeTableLikeResult("csv", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "hdf5") || strings.Contains(lowerTool, "h5") {
		if text := summarizeContainerResult("hdf5", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "adios") || strings.Contains(lowerTool, "bp5") || strings.Contains(lowerTool, "bp4") {
		if text := summarizeContainerResult("adios", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "sac") || strings.Contains(lowerTool, "seismic") {
		if text := summarizeSACResult(result); text != "" {
			return text
		}
	}
	if lowerTool == "" && looksLikeSACResult(result) {
		if text := summarizeSACResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "shell") || strings.Contains(lowerTool, "bash") || strings.Contains(lowerTool, "command") {
		if text := summarizeShellResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") ||
		strings.Contains(lowerTool, "visual") || strings.Contains(lowerTool, "dashboard") {
		if text := summarizeVisualizationResult(result); text != "" {
			return text
		}
	}
	if text := summarizeStructuredEvidenceResult(result); text != "" {
		return text
	}
	return ""
}

func looksLikeSACResult(result map[string]any) bool {
	if firstStringValue(result, "archive_path", "sac_path", "sac_file", "kstnm", "kcmpnm") != "" {
		return true
	}
	if firstStringValue(result, "network", "network_code", "station", "channel") != "" &&
		firstStringValue(result, "start_time", "event_time", "origin_time") != "" {
		return true
	}
	for _, key := range []string{"trace_count", "sac_trace_count", "traces_analyzed", "traces_plotted"} {
		if _, ok := result[key]; ok {
			return true
		}
	}
	return false
}

func summarizeErrorResult(result map[string]any) string {
	errorPayload, ok := result["error"].(map[string]any)
	if !ok {
		return ""
	}
	var rows []string
	rows = append(rows, "error result:")
	if code := firstStringValue(errorPayload, "code", "type"); code != "" {
		rows = append(rows, "code: "+code)
	}
	if message := firstStringValue(errorPayload, "message", "error"); message != "" {
		rows = append(rows, "message: "+shortenKnownPaths(message))
	}
	if nextAction := firstStringValue(errorPayload, "next_action", "recovery"); nextAction != "" {
		rows = append(rows, "next action: "+shortenKnownPaths(nextAction))
	}
	if path := firstStringValue(errorPayload, "path", "filepath", "file"); path != "" {
		rows = append(rows, "path: "+shortenPathForInline(path))
	}
	if field := firstStringValue(errorPayload, "field"); field != "" {
		rows = append(rows, "field: "+field)
	}
	if tool := firstStringValue(errorPayload, "tool"); tool != "" {
		rows = append(rows, "tool: "+tool)
	}
	return strings.Join(rows, "\n")
}

func summarizeTableLikeResult(label string, result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "path", "file", "file_path", "dataset_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if table := firstStringValue(result, "table", "dataset", "name"); table != "" {
		rows = append(rows, "dataset: "+table)
	}
	dtype := firstStringValue(result, "dtype", "type", "data_type")
	if column := firstStringValue(result, "column", "column_name", "field", "variable"); column != "" {
		line := "column: " + column
		if dtype != "" {
			line += " · type: " + dtype
		}
		rows = append(rows, line)
	}
	stats := summarizeNumericFields(result, []string{
		"rows", "row_count", "count", "nulls", "null_count", "unique", "mean", "std", "min", "median", "max",
	})
	if stats != "" {
		rows = append(rows, stats)
	}
	if dtype != "" && firstStringValue(result, "column", "column_name", "field", "variable") == "" {
		rows = append(rows, "type: "+dtype)
	}
	if cols := summarizeColumnNames(result); cols != "" {
		rows = append(rows, "columns: "+cols)
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{label + " result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeContainerResult(label string, result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "path", "file", "file_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if datasets := summarizeNamedItems(result, "datasets", "dataset_paths", "groups"); datasets != "" {
		rows = append(rows, "datasets: "+datasets)
	}
	if variables := summarizeNamedItems(result, "variables", "variable_names"); variables != "" {
		rows = append(rows, "variables: "+variables)
	}
	if attrs := summarizeNamedItems(result, "attributes", "attrs"); attrs != "" {
		rows = append(rows, "attributes: "+attrs)
	}
	if shape := summarizeNamedItems(result, "shape", "dims", "dimensions"); shape != "" {
		rows = append(rows, "shape: "+shape)
	}
	if dtype := firstStringValue(result, "dtype", "type", "data_type"); dtype != "" {
		rows = append(rows, "type: "+dtype)
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{label + " result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeSACResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "value"); artifact != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(artifact))
	}
	if stats := summarizeNumericFields(result, []string{
		"sac_trace_count", "trace_count", "traces_plotted", "traces_analyzed", "traces", "events", "event_count", "station_count", "npts", "sample_rate_hz", "sampling_rate", "delta", "duration_s", "duration", "magnitude", "min_magnitude", "min", "max", "mean",
	}); stats != "" {
		rows = append(rows, stats)
	}
	if path := firstStringValue(result, "path", "file", "file_path", "filepath", "archive_path", "sac_path", "sac_file"); path != "" {
		rows = append(rows, "file: "+shortenPathForInline(path))
	}
	if network := firstStringValue(result, "network", "network_code"); network != "" {
		rows = append(rows, "network: "+network)
	}
	if station := firstStringValue(result, "station", "kstnm"); station != "" {
		rows = append(rows, "station: "+station)
	}
	if channel := firstStringValue(result, "channel", "kcmpnm", "component"); channel != "" {
		rows = append(rows, "channel: "+channel)
	}
	if location := firstStringValue(result, "location", "location_code"); location != "" {
		rows = append(rows, "location: "+location)
	}
	if start := firstStringValue(result, "start_time", "start", "time_start"); start != "" {
		rows = append(rows, "start: "+start)
	}
	if end := firstStringValue(result, "end_time", "end", "time_end"); end != "" {
		rows = append(rows, "end: "+end)
	}
	if eventTime := firstStringValue(result, "event_time", "origin_time", "time"); eventTime != "" {
		rows = append(rows, "event_time: "+eventTime)
	}
	if members := summarizeNamedItems(result, "members", "sample_members", "files", "trace_files", "selected_traces", "traces_sampled"); members != "" {
		rows = append(rows, "members: "+shortenKnownPaths(members))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"SAC evidence:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeShellResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if code, ok := floatValue(result["exit_code"]); ok {
		rows = append(rows, fmt.Sprintf("exit_code: %.0f", code))
	}
	for _, key := range []string{"stdout", "stderr", "error"} {
		if text := strings.TrimSpace(stringValue(result[key])); text != "" {
			rows = append(rows, key+": "+truncateString(strings.Join(strings.Fields(text), " "), 220))
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeVisualizationResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "output_path", "artifact_path", "artifact", "value", "path", "file", "file_path"); path != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(path))
	}
	if chart := firstStringValue(result, "chart_type", "plot_type", "type"); chart != "" {
		rows = append(rows, "chart: "+chart)
	}
	if x := firstStringValue(result, "x_column", "x", "x_axis"); x != "" {
		rows = append(rows, "x: "+x)
	}
	if y := firstStringValue(result, "y_column", "y", "y_axis"); y != "" {
		rows = append(rows, "y: "+y)
	}
	if summary := firstStringValue(result, "title", "summary", "description"); summary != "" {
		rows = append(rows, "summary: "+truncateString(strings.Join(strings.Fields(summary), " "), 180))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"artifact result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeStatusRows(result map[string]any) []string {
	var rows []string
	if status := firstStringValue(result, "status", "state"); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := firstStringValue(meta, "status", "state"); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if errText := firstStringValue(result, "error", "message"); errText != "" {
		rows = append(rows, "error: "+errText)
	}
	return rows
}

func firstStringValue(result map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(stringValue(result[key])); value != "" {
			return value
		}
	}
	return ""
}

func summarizeNumericFields(result map[string]any, keys []string) string {
	var bits []string
	for _, key := range keys {
		if value, ok := floatValue(result[key]); ok {
			bits = append(bits, fmt.Sprintf("%s: %s", key, formatCompactFloat(value)))
		}
	}
	return strings.Join(bits, " · ")
}

func formatCompactFloat(value float64) string {
	if value == float64(int64(value)) {
		return fmt.Sprintf("%.0f", value)
	}
	return fmt.Sprintf("%.4g", value)
}

func summarizeColumnNames(result map[string]any) string {
	for _, key := range []string{"columns", "schema", "fields"} {
		if text := summarizeNamedItems(result, key); text != "" {
			return text
		}
	}
	return ""
}

func summarizeNamedItems(result map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := summarizeAnyItems(result[key]); text != "" {
			return text
		}
	}
	return ""
}

func summarizeAnyItems(raw any) string {
	switch value := raw.(type) {
	case nil:
		return ""
	case []any:
		items := make([]string, 0, min(len(value), 5))
		for _, item := range value {
			items = appendSummaryItem(items, item)
			if len(items) >= 5 {
				break
			}
		}
		if len(value) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(value)-len(items)))
		}
		return strings.Join(items, ", ")
	case map[string]any:
		if nested, ok := value["items"]; ok {
			return summarizeAnyItems(nested)
		}
		items := make([]string, 0, min(len(value), 5))
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			item := value[key]
			label := strings.TrimSpace(key)
			if label == "" {
				continue
			}
			if itemMap, ok := item.(map[string]any); ok {
				if dtype := firstStringValue(itemMap, "dtype", "type", "data_type"); dtype != "" {
					label += " " + dtype
				}
			}
			items = append(items, label)
			if len(items) >= 5 {
				break
			}
		}
		if len(value) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(value)-len(items)))
		}
		return strings.Join(items, ", ")
	case string:
		return strings.TrimSpace(value)
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

func appendSummaryItem(items []string, item any) []string {
	switch typed := item.(type) {
	case string:
		if text := strings.TrimSpace(typed); text != "" {
			return append(items, text)
		}
	case map[string]any:
		name := firstNonEmpty(
			firstStringValue(typed, "station", "station_id", "site", "site_id", "id", "name", "path", "column", "dataset", "variable", "title"),
			"(unnamed)",
		)
		if dtype := firstStringValue(typed, "dtype", "type", "data_type"); dtype != "" {
			name += " " + dtype
		}
		if distance, ok := firstNumericValue(typed, "distance_km", "distance"); ok {
			name += " (" + formatCompactFloat(distance) + " km)"
		}
		return append(items, name)
	default:
		text := strings.TrimSpace(fmt.Sprint(item))
		if text != "" {
			return append(items, text)
		}
	}
	return items
}

func summarizeNDPResult(result map[string]any) string {
	var rows []string
	featureRows := summarizeFeatureCollectionRows(result)
	if status := stringValue(result["status"]); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := stringValue(meta["status"]); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if count, ok := floatValue(result["count"]); ok && len(featureRows) == 0 {
		rows = append(rows, fmt.Sprintf("count: %.0f", count))
	}
	if ds, ok := result["datasets"].(map[string]any); ok {
		if items, ok := ds["items"].([]any); ok {
			rows = append(rows, summarizeNDPItems("datasets", items)...)
		}
	}
	if orgs, ok := result["organizations"].(map[string]any); ok {
		if items, ok := orgs["items"].([]any); ok {
			rows = append(rows, summarizeNDPItems("organizations", items)...)
		}
	}
	if len(featureRows) > 0 {
		rows = append(rows, featureRows...)
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeStructuredEvidenceResult(result map[string]any) string {
	var rows []string
	rows = append(rows, summarizeStatusRows(result)...)
	if label := firstStringValue(result, "region", "region_name", "name", "label", "title"); label != "" {
		rows = append(rows, "scope: "+label)
	}
	if location := summarizeCoordinateScope(result); location != "" {
		rows = append(rows, "location: "+location)
	}
	if count := summarizeEvidenceCounts(result); count != "" {
		rows = append(rows, count)
	}
	if samples := summarizeEvidenceSamples(result); samples != "" {
		rows = append(rows, samples)
	}
	if bounds := summarizeNamedItems(result, "bbox", "bounds", "bounding_box"); bounds != "" {
		rows = append(rows, "bounds: "+bounds)
	}
	if summary := firstStringValue(result, "summary", "message", "description"); summary != "" {
		rows = append(rows, "summary: "+truncateString(strings.Join(strings.Fields(summary), " "), 220))
	}
	if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "path", "file", "file_path", "filepath"); artifact != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(artifact))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"structured result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeCoordinateScope(result map[string]any) string {
	center := summarizeCoordinatePair(result)
	radius, hasRadius := firstNumericValue(result, "radius_km", "radius", "search_radius_km")
	if center == "" && !hasRadius {
		return ""
	}
	if center == "" {
		return "radius " + formatCompactFloat(radius) + " km"
	}
	if hasRadius {
		return center + " · radius " + formatCompactFloat(radius) + " km"
	}
	return center
}

func summarizeCoordinatePair(result map[string]any) string {
	if center := mapValue(result["center"]); len(center) > 0 {
		lat, hasLat := firstNumericValue(center, "lat", "latitude", "center_lat")
		lon, hasLon := firstNumericValue(center, "lon", "lng", "longitude", "center_lon")
		if hasLat && hasLon {
			return formatCompactFloat(lat) + ", " + formatCompactFloat(lon)
		}
	}
	lat, hasLat := firstNumericValue(result, "center_lat", "lat", "latitude")
	lon, hasLon := firstNumericValue(result, "center_lon", "lon", "lng", "longitude")
	if hasLat && hasLon {
		return formatCompactFloat(lat) + ", " + formatCompactFloat(lon)
	}
	return ""
}

func summarizeEvidenceCounts(result map[string]any) string {
	var bits []string
	for _, pair := range []struct {
		label string
		keys  []string
	}{
		{"input", []string{"input_count", "source_count", "total_count", "total"}},
		{"matched", []string{"matched_count", "filtered_count", "match_count"}},
		{"records", []string{"count", "record_count", "feature_count", "point_count"}},
		{"rows", []string{"rows", "row_count"}},
	} {
		if value, ok := firstNumericValue(result, pair.keys...); ok {
			bits = append(bits, pair.label+": "+formatCompactFloat(value))
		}
	}
	return strings.Join(bits, " · ")
}

func summarizeEvidenceSamples(result map[string]any) string {
	items := []any{}
	for _, key := range []string{"items", "records", "features", "results", "warnings", "events", "points", "matches", "matched", "stations", "candidates"} {
		if found := featureItemsFromAny(result[key]); len(found) > 0 {
			items = found
			break
		}
	}
	if len(items) == 0 {
		return ""
	}
	limit := min(len(items), 4)
	samples := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		samples = appendSummaryItem(samples, items[i])
	}
	if hidden := len(items) - len(samples); hidden > 0 {
		samples = append(samples, fmt.Sprintf("... %d more", hidden))
	}
	if len(samples) == 0 {
		return ""
	}
	return "sample: " + strings.Join(samples, ", ")
}

func summarizeFeatureCollectionResult(result map[string]any) string {
	featureRows := summarizeFeatureCollectionRows(result)
	if len(featureRows) == 0 {
		return ""
	}
	rows := summarizeStatusRows(result)
	rows = append(rows, featureRows...)
	rows = append([]string{"records result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeFeatureCollectionRows(result map[string]any) []string {
	items := featureItemsFromResult(result)
	if len(items) == 0 {
		return nil
	}
	var rows []string
	if source := firstStringValue(result, "source", "layer", "dataset", "service", "name", "title"); source != "" {
		rows = append(rows, "source: "+source)
	}
	count := len(items)
	for _, key := range []string{"count", "record_count", "feature_count", "total", "total_count"} {
		if value, ok := floatValue(result[key]); ok {
			count = int(value)
			break
		}
	}
	rows = append(rows, fmt.Sprintf("records: %d", count))
	limit := min(len(items), 4)
	for i := 0; i < limit; i++ {
		if line := summarizeFeatureRecord(items[i]); line != "" {
			rows = append(rows, "sample: "+line)
		}
		if i == 0 {
			if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "path", "file", "file_path"); artifact != "" {
				rows = append(rows, "artifact: "+shortenPathForInline(artifact))
			}
		}
	}
	if hidden := len(items) - limit; hidden > 0 {
		rows = append(rows, fmt.Sprintf("... %d more", hidden))
	}
	return rows
}

func featureItemsFromResult(result map[string]any) []any {
	for _, key := range []string{"features", "records", "items", "warnings", "events"} {
		if items := featureItemsFromAny(result[key]); len(items) > 0 {
			return items
		}
	}
	if collection, ok := result["featureCollection"].(map[string]any); ok {
		if items := featureItemsFromAny(collection["features"]); len(items) > 0 {
			return items
		}
	}
	return nil
}

func featureItemsFromAny(raw any) []any {
	switch typed := raw.(type) {
	case []any:
		return typed
	case map[string]any:
		for _, key := range []string{"items", "features", "records"} {
			if items, ok := typed[key].([]any); ok {
				return items
			}
		}
	}
	return nil
}

func summarizeFeatureRecord(raw any) string {
	record, ok := raw.(map[string]any)
	if !ok {
		return truncateString(strings.Join(strings.Fields(fmt.Sprint(raw)), " "), 180)
	}
	fields := featureRecordFields(record)
	title := firstNonEmpty(
		firstStringValue(fields, "IncidentName", "incident_name", "name", "Name", "title", "Title", "headline", "Headline", "event", "Event", "areaDesc", "AreaDesc"),
		firstStringValue(fields, "id", "ID", "OBJECTID", "objectid"),
		"(unnamed)",
	)
	var bits []string
	for _, pair := range []struct {
		label string
		keys  []string
	}{
		{"id", []string{"id", "ID", "OBJECTID", "objectid"}},
		{"status", []string{"status", "Status", "incident_status", "IncidentStatus", "IncidentStatusCategory"}},
		{"event", []string{"event", "Event", "event_type", "EventType", "phenomena", "Phenomena"}},
		{"severity", []string{"severity", "Severity", "significance", "Significance"}},
		{"area", []string{"area", "Area", "areaDesc", "AreaDesc", "county", "County", "zone", "Zone"}},
		{"acres", []string{"acres", "Acres", "GISAcres", "DailyAcres"}},
		{"containment", []string{"containment", "Containment", "PercentContained", "percent_contained"}},
		{"start", []string{"start", "Start", "start_time", "StartTime", "effective", "Effective", "CreateDate", "created"}},
		{"expires", []string{"expires", "Expires", "expiration", "Expiration"}},
		{"updated", []string{"updated", "Updated", "modified", "Modified", "UpdateDate", "LastUpdate"}},
	} {
		if text := firstScalarValue(fields, pair.keys...); text != "" {
			bits = append(bits, pair.label+": "+truncateString(strings.Join(strings.Fields(text), " "), 80))
		}
		if len(bits) >= 4 {
			break
		}
	}
	if len(bits) == 0 {
		return truncateString(strings.Join(strings.Fields(title), " "), 180)
	}
	return truncateString(strings.Join(strings.Fields(title), " "), 90) + " · " + strings.Join(bits, " · ")
}

func featureRecordFields(record map[string]any) map[string]any {
	fields := map[string]any{}
	for key, value := range record {
		if key == "geometry" {
			continue
		}
		fields[key] = value
	}
	for _, key := range []string{"attributes", "properties"} {
		if nested, ok := record[key].(map[string]any); ok {
			for nestedKey, value := range nested {
				fields[nestedKey] = value
			}
		}
	}
	return fields
}

func firstScalarValue(result map[string]any, keys ...string) string {
	for _, key := range keys {
		value := result[key]
		if text := strings.TrimSpace(stringValue(value)); text != "" {
			return text
		}
		if number, ok := floatValue(value); ok {
			return formatCompactFloat(number)
		}
	}
	return ""
}

func summarizeNDPItems(label string, items []any) []string {
	rows := []string{fmt.Sprintf("%s:", label)}
	limit := min(len(items), 5)
	for i := 0; i < limit; i++ {
		item, ok := items[i].(map[string]any)
		if !ok {
			continue
		}
		title := firstNonEmpty(
			stringValue(item["title"]),
			stringValue(item["name"]),
			stringValue(item["id"]),
		)
		if title == "" {
			title = "(untitled)"
		}
		var bits []string
		if org := stringValue(item["owner_org"]); org != "" {
			bits = append(bits, "org: "+org)
		}
		if n, ok := floatValue(item["resource_count"]); ok {
			bits = append(bits, fmt.Sprintf("resources: %.0f", n))
		}
		if formats := compactStringItems(item["resource_formats"]); formats != "" {
			bits = append(bits, "formats: "+formats)
		}
		if url := firstCompactStringItem(item["resource_urls"]); url != "" {
			bits = append(bits, "url: "+url)
		}
		suffix := ""
		if len(bits) > 0 {
			suffix = " · " + strings.Join(bits, " · ")
		}
		rows = append(rows, "- "+title+suffix)
	}
	if hidden := len(items) - limit; hidden > 0 {
		rows = append(rows, fmt.Sprintf("... %d more", hidden))
	}
	return rows
}

func compactStringItems(raw any) string {
	container, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	items, ok := container["items"].([]any)
	if !ok {
		return ""
	}
	values := make([]string, 0, min(len(items), 4))
	for _, item := range items {
		value := strings.TrimSpace(fmt.Sprint(item))
		if value != "" {
			values = append(values, value)
		}
		if len(values) >= 4 {
			break
		}
	}
	return strings.Join(values, ", ")
}

func firstCompactStringItem(raw any) string {
	container, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	items, ok := container["items"].([]any)
	if !ok || len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(items[0]))
}

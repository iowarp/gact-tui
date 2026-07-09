package presentation

// presentation_tool_kinds.go summarizes table/container/shell/visualization tool-result kinds.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func summarizeTableLikeResult(label string, result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := FirstStringValue(result, "path", "file", "file_path", "dataset_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if table := FirstStringValue(result, "table", "dataset", "name"); table != "" {
		rows = append(rows, "dataset: "+table)
	}
	dtype := FirstStringValue(result, "dtype", "type", "data_type")
	if column := FirstStringValue(result, "column", "column_name", "field", "variable"); column != "" {
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
	if dtype != "" && FirstStringValue(result, "column", "column_name", "field", "variable") == "" {
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
	if path := FirstStringValue(result, "path", "file", "file_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if datasets := SummarizeNamedItems(result, "datasets", "dataset_paths", "groups"); datasets != "" {
		rows = append(rows, "datasets: "+datasets)
	}
	if variables := SummarizeNamedItems(result, "variables", "variable_names"); variables != "" {
		rows = append(rows, "variables: "+variables)
	}
	if attrs := SummarizeNamedItems(result, "attributes", "attrs"); attrs != "" {
		rows = append(rows, "attributes: "+attrs)
	}
	if shape := SummarizeNamedItems(result, "shape", "dims", "dimensions"); shape != "" {
		rows = append(rows, "shape: "+shape)
	}
	if dtype := FirstStringValue(result, "dtype", "type", "data_type"); dtype != "" {
		rows = append(rows, "type: "+dtype)
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{label + " result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeShellResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if code, ok := valuefmt.FloatValue(result["exit_code"]); ok {
		rows = append(rows, fmt.Sprintf("exit_code: %.0f", code))
	}
	for _, key := range []string{"stdout", "stderr", "error"} {
		if text := strings.TrimSpace(valuefmt.StringValue(result[key])); text != "" {
			rows = append(rows, key+": "+textutil.Truncate(strings.Join(strings.Fields(text), " "), 220))
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeVisualizationResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := FirstStringValue(result, "output_path", "artifact_path", "artifact", "value", "path", "file", "file_path"); path != "" {
		rows = append(rows, "artifact: "+valuefmt.ShortenPathForInline(path))
	}
	if chart := FirstStringValue(result, "chart_type", "plot_type", "type"); chart != "" {
		rows = append(rows, "chart: "+chart)
	}
	if x := FirstStringValue(result, "x_column", "x", "x_axis"); x != "" {
		rows = append(rows, "x: "+x)
	}
	if y := FirstStringValue(result, "y_column", "y", "y_axis"); y != "" {
		rows = append(rows, "y: "+y)
	}
	if summary := FirstStringValue(result, "title", "summary", "description"); summary != "" {
		rows = append(rows, "summary: "+textutil.Truncate(strings.Join(strings.Fields(summary), " "), 180))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"artifact result:"}, rows...)
	return strings.Join(rows, "\n")
}

package ui

// render_scientific_tool_calls.go summarizes scientific tool-call inputs into compact labels.

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func scientificToolCallSummary(tool string, input map[string]any) string {
	keys := []string{}
	switch {
	case strings.Contains(tool, "geo_geocode") || strings.Contains(tool, "geocode"):
		keys = []string{"query", "countrycodes", "limit"}
	case strings.Contains(tool, "filter_points") || strings.Contains(tool, "points_by_radius"):
		keys = []string{"center_lat", "center_lon", "radius_km", "id_column", "data_path", "lat_column", "lon_column"}
	case strings.HasPrefix(tool, "ndp_search"):
		keys = []string{"search_terms", "query", "limit", "server"}
	case strings.HasPrefix(tool, "ndp_list"):
		keys = []string{"name_filter", "server"}
	case strings.HasPrefix(tool, "ndp_get"):
		keys = []string{"dataset_identifier", "identifier_type", "server"}
	case strings.HasPrefix(tool, "ndp_stage"):
		keys = []string{"dataset_identifier", "resource_index", "server"}
	case strings.HasPrefix(tool, "ndp_query") || strings.Contains(tool, "arcgis"):
		keys = []string{"dataset_identifier", "query", "where", "server", "limit"}
	case strings.Contains(tool, "sac"):
		keys = []string{"location", "days_back", "start_time", "duration", "min_magnitude", "filepath", "path", "max_traces", "max_members"}
	case strings.Contains(tool, "parquet"):
		keys = []string{"filepath", "path", "file", "column", "columns"}
	case strings.Contains(tool, "csv"):
		keys = []string{"filepath", "path", "file", "limit", "columns"}
	case strings.Contains(tool, "hdf5") || strings.Contains(tool, "h5") ||
		strings.Contains(tool, "adios") || strings.Contains(tool, "bp5"):
		keys = []string{"filepath", "path", "file", "dataset", "variable"}
	case strings.Contains(tool, "plot") || strings.Contains(tool, "chart") ||
		strings.Contains(tool, "visual") || strings.Contains(tool, "dashboard"):
		keys = []string{"output_path", "artifact_path", "x_column", "y_column", "filepath", "path"}
	}
	if len(keys) == 0 {
		return ""
	}
	var bits []string
	for _, key := range keys {
		value, ok := input[key]
		if !ok || value == nil {
			continue
		}
		text := summarizeInputValue(value)
		if text == "" {
			continue
		}
		if key == "path" || key == "file" || key == "filepath" ||
			key == "output_path" || key == "artifact_path" {
			text = valuefmt.ShortenPathForInline(text)
		}
		label, formatted := scientificToolCallArgLabelAndValue(key, text)
		bits = append(bits, label+": "+formatted)
		if len(bits) >= 4 {
			break
		}
	}
	return strings.Join(bits, " · ")
}

func scientificToolCallArgLabelAndValue(key, text string) (string, string) {
	switch key {
	case "days_back":
		return "window", "last " + text + " days"
	case "duration":
		return "duration", text + "s"
	case "min_magnitude":
		return "min magnitude", text
	case "max_traces":
		return "max traces", text
	case "max_members":
		return "max members", text
	case "output_path":
		return "artifact", text
	case "artifact_path":
		return "artifact", text
	case "start_time":
		return "start", text
	case "search_terms":
		return "search", text
	case "dataset_identifier":
		return "dataset", text
	case "resource_index":
		return "resource", text
	default:
		return strings.ReplaceAll(key, "_", " "), text
	}
}

func summarizeInputValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		items := make([]string, 0, min(len(typed), 4))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" {
				items = append(items, text)
			}
			if len(items) >= 4 {
				break
			}
		}
		if len(typed) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(typed)-len(items)))
		}
		return strings.Join(items, ", ")
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

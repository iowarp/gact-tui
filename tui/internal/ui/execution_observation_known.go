package ui

// execution_observation_known.go builds tool-specific (geocode/NDP/ranking) execution observation previews.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"regexp"
	"strings"
)

func executionSpecificObservationPreview(toolName string, observation any, threshold int) string {
	obj := valuefmt.MapValue(observation)
	if len(obj) == 0 {
		return ""
	}
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	switch {
	case strings.Contains(lowerTool, "geo_geocode"):
		return executionGeocodeObservationPreview(obj)
	case strings.Contains(lowerTool, "ndp_search"):
		return executionNDPSearchObservationPreview(obj, threshold)
	case strings.Contains(lowerTool, "filter_points") || strings.Contains(lowerTool, "points_by_radius"):
		return executionPointRankingPreview(obj, threshold)
	case strings.HasPrefix(lowerTool, "ndp_stage"):
		return executionStagedResourcePreview(obj, threshold)
	case lowerTool == "shell_bash":
		return executionShellObservationPreview(obj, threshold)
	case strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") || strings.Contains(lowerTool, "visual"):
		return executionPlotObservationPreview(obj)
	default:
		return ""
	}
}

func executionSpecificTextObservationPreview(toolName string, raw string) string {
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	if strings.Contains(lowerTool, "geo_geocode") {
		return executionGeocodeTextPreview(raw)
	}
	return ""
}

func executionGeocodeObservationPreview(obj map[string]any) string {
	name := executionFirstScalarValue(obj, "display_name", "name", "label")
	lat := executionFirstScalarValue(obj, "lat", "latitude", "center_lat")
	lon := executionFirstScalarValue(obj, "lon", "longitude", "center_lon")
	source := executionFirstScalarValue(obj, "provenance", "source")
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center "+lat+", "+lon)
	}
	if source != "" {
		rows = append(rows, "source "+source)
	}
	return strings.Join(rows, "\n")
}

func executionGeocodeTextPreview(raw string) string {
	name := executionRegexValue(raw, `['"]display_name['"]\s*:\s*['"]([^'"]+)['"]`)
	lat := executionRegexValue(raw, `['"]lat['"]\s*:\s*([\-0-9.]+)`)
	lon := executionRegexValue(raw, `['"]lon['"]\s*:\s*([\-0-9.]+)`)
	source := executionRegexValue(raw, `['"]provenance['"]\s*:\s*['"]([^'"]+)['"]`)
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center "+lat+", "+lon)
	}
	if source != "" {
		rows = append(rows, "source "+source)
	}
	return strings.Join(rows, "\n")
}

func executionRegexValue(raw string, pattern string) string {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return ""
	}
	matches := re.FindStringSubmatch(raw)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
}

func executionNDPSearchObservationPreview(obj map[string]any, threshold int) string {
	datasets, _ := obj["datasets"].([]any)
	if len(datasets) == 0 {
		if nested := valuefmt.MapValue(obj["datasets"]); len(nested) > 0 {
			datasets, _ = nested["items"].([]any)
		}
	}
	if len(datasets) == 0 {
		return ""
	}
	limit := min(max(1, threshold), 3)
	var rows []string
	for _, rawDataset := range datasets {
		dataset := valuefmt.MapValue(rawDataset)
		resources, _ := dataset["resources"].([]any)
		for _, rawResource := range resources {
			resource := valuefmt.MapValue(rawResource)
			name := executionFirstScalarValue(resource, "name", "title")
			format := strings.ToLower(executionFirstScalarValue(resource, "format"))
			if name == "" || (format != "" && format != "csv" && !strings.HasSuffix(strings.ToLower(name), ".csv")) {
				continue
			}
			rows = append(rows, name)
			if len(rows) >= limit {
				break
			}
		}
		if len(rows) >= limit {
			break
		}
	}
	if len(rows) == 0 {
		for i, rawDataset := range datasets {
			if i >= limit {
				break
			}
			dataset := valuefmt.MapValue(rawDataset)
			if name := executionFirstScalarValue(dataset, "title", "name", "id"); name != "" {
				rows = append(rows, name)
			}
		}
	}
	total := len(datasets)
	if count, ok := valuefmt.FirstNumericValue(obj, "count", "total_found"); ok && count > float64(total) {
		total = int(count)
	}
	if total > len(rows) {
		rows = append(rows, "Ctrl+E full output")
	}
	return strings.Join(rows, "\n")
}

func executionPointRankingPreview(obj map[string]any, threshold int) string {
	count := valuefmt.FirstNonEmpty(executionFirstScalarValue(obj, "within_radius_count"), executionFirstScalarValue(obj, "count"))
	radius := executionFirstScalarValue(obj, "radius_km")
	var rows []string
	if count != "" {
		line := count + " stations within radius"
		if radius != "" {
			line += " (" + radius + " km)"
		}
		rows = append(rows, line)
	}
	points, _ := obj["points"].([]any)
	limit := min(max(1, threshold), 3)
	for i, raw := range points {
		if i >= limit {
			break
		}
		point := valuefmt.MapValue(raw)
		id := firstStringValueFold(point, "site", "station", "station_id", "id", "name")
		if id == "" {
			continue
		}
		if distance, ok := valuefmt.FirstNumericValue(point, "distance_km", "distance"); ok {
			rows = append(rows, id+" "+formatCompactFloat(distance)+" km")
		} else {
			rows = append(rows, id)
		}
	}
	if len(points) > limit {
		rows = append(rows, "Ctrl+E full output")
	}
	return strings.Join(rows, "\n")
}

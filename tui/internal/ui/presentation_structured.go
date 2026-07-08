package ui

// presentation_structured.go summarizes structured-evidence tool results (coordinates, evidence counts/samples).

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

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
		rows = append(rows, "summary: "+textutil.Truncate(strings.Join(strings.Fields(summary), " "), 220))
	}
	if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "path", "file", "file_path", "filepath"); artifact != "" {
		rows = append(rows, "artifact: "+valuefmt.ShortenPathForInline(artifact))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"structured result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeCoordinateScope(result map[string]any) string {
	center := summarizeCoordinatePair(result)
	radius, hasRadius := valuefmt.FirstNumericValue(result, "radius_km", "radius", "search_radius_km")
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
	if center := valuefmt.MapValue(result["center"]); len(center) > 0 {
		lat, hasLat := valuefmt.FirstNumericValue(center, "lat", "latitude", "center_lat")
		lon, hasLon := valuefmt.FirstNumericValue(center, "lon", "lng", "longitude", "center_lon")
		if hasLat && hasLon {
			return formatCompactFloat(lat) + ", " + formatCompactFloat(lon)
		}
	}
	lat, hasLat := valuefmt.FirstNumericValue(result, "center_lat", "lat", "latitude")
	lon, hasLon := valuefmt.FirstNumericValue(result, "center_lon", "lon", "lng", "longitude")
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
		{"input", []string{"input_count", "source_count", "total_count", "total", "total_points"}},
		{"matched", []string{"matched_count", "filtered_count", "match_count", "within_radius_count"}},
		{"records", []string{"count", "record_count", "feature_count", "point_count", "station_count", "candidate_count"}},
		{"rows", []string{"rows", "row_count"}},
		{"skipped", []string{"skipped_invalid", "skipped_count"}},
	} {
		if value, ok := valuefmt.FirstNumericValue(result, pair.keys...); ok {
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

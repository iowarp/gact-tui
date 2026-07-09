package ui

// execution_report_structured.go builds structured-map execution report previews (profiles, catalogs, images).

import (
	"path/filepath"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/presentation"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func executionStructuredMapPreview(agent string, obj map[string]any) string {
	var rows []string
	if stationCatalog := valuefmt.MapValue(obj["station_catalog"]); len(stationCatalog) > 0 {
		rows = append(rows, executionStationCatalogPreview(stationCatalog)...)
	}
	if acquisition := valuefmt.MapValue(obj["acquisition"]); len(acquisition) > 0 {
		if status := executionFirstScalarValue(acquisition, "status"); status != "" {
			rows = append(rows, "acquisition "+status)
		}
		if path := executionFirstScalarValue(acquisition, "metadata_path", "local_path", "path"); path != "" {
			rows = append(rows, valuefmt.ShortenPathForInline(path))
		}
		if ready := executionFirstScalarValue(acquisition, "analysis_ready"); ready != "" {
			rows = append(rows, "analysis ready "+ready)
		}
	}
	if resource := valuefmt.MapValue(obj["resource_candidate"]); len(resource) > 0 {
		if name := executionFirstScalarValue(resource, "resource_name", "dataset_name"); name != "" {
			rows = append(rows, name)
		}
	}
	if profile := valuefmt.MapValue(obj["profile"]); len(profile) > 0 {
		rows = append(rows, executionProfilePreview(profile)...)
	}
	for _, key := range []string{"artifact", "plot"} {
		if artifact := valuefmt.MapValue(obj[key]); len(artifact) > 0 {
			if kind := executionFirstScalarValue(artifact, "kind", "plot_type", "type"); kind != "" {
				rows = append(rows, kind)
			}
			if path := executionFirstScalarValue(artifact, "path", "local_path", "output_path", "plot_path", "artifact_path"); path != "" {
				rows = append(rows, valuefmt.ShortenPathForInline(path))
				if executionPathLooksLikeImage(path) {
					rows = append(rows, "Ctrl+E full image")
				}
			}
			if columns := presentation.SummarizeNamedItems(artifact, "columns", "y_columns"); columns != "" {
				rows = append(rows, "columns "+columns)
			}
			if status := executionFirstScalarValue(artifact, "status"); status != "" && status != "completed" {
				rows = append(rows, "status "+status)
			}
		}
	}
	if name := executionFirstScalarValue(obj, "region_name", "display_name", "name", "title", "dataset", "station_id", "site"); name != "" {
		rows = append(rows, name)
	}
	if lat := executionFirstScalarValue(obj, "center_lat", "lat", "latitude", "Latitude"); lat != "" {
		if lon := executionFirstScalarValue(obj, "center_lon", "lon", "longitude", "Longitude"); lon != "" {
			rows = append(rows, "center "+lat+", "+lon)
		}
	}
	if path := executionFirstScalarValue(obj, "path", "local_path", "cleaned_path", "output_path", "plot_path", "artifact_path"); path != "" {
		rows = append(rows, valuefmt.ShortenPathForInline(path))
	}
	if radius := executionFirstScalarValue(obj, "radius_km"); radius != "" {
		rows = append(rows, "radius "+radius+" km")
	}
	if confidence := executionFirstScalarValue(obj, "confidence"); confidence != "" {
		rows = append(rows, "confidence "+confidence)
	}
	if provenance := executionFirstScalarValue(obj, "provenance", "source"); provenance != "" {
		rows = append(rows, "provenance "+provenance)
	}
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "status "+status)
	}
	if len(rows) == 0 {
		for _, key := range sortedExecutionMapKeys(obj) {
			text := executionCompactValue(obj[key])
			if text != "" && !semanticPreviewIsRedacted(text) {
				rows = append(rows, key+" "+textutil.Truncate(text, 120))
			}
			if len(rows) >= 4 {
				break
			}
		}
	}
	return strings.Join(rows, "\n")
}

func executionProfilePreview(obj map[string]any) []string {
	var rows []string
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "profile "+status)
	} else {
		rows = append(rows, "profile")
	}
	if path := executionFirstScalarValue(obj, "path", "file_path", "local_path"); path != "" {
		rows = append(rows, valuefmt.ShortenPathForInline(path))
	}
	if scanLimited := executionFirstScalarValue(obj, "scan_limited", "profile_limited"); scanLimited != "" {
		rows = append(rows, "scan limited "+scanLimited)
	}
	return rows
}

func executionStationCatalogPreview(obj map[string]any) []string {
	var rows []string
	if count := executionFirstScalarValue(obj, "candidate_count", "count"); count != "" {
		rows = append(rows, count+" candidate stations")
	}
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "status "+status)
	}
	ids, _ := obj["station_ids"].([]any)
	limit := min(3, len(ids))
	for i := 0; i < limit; i++ {
		id := strings.TrimSpace(valuefmt.StringValue(ids[i]))
		if id != "" {
			rows = append(rows, id)
		}
	}
	if len(ids) > limit {
		rows = append(rows, "Ctrl+E full output")
	}
	return rows
}

func executionPathLooksLikeImage(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return true
	default:
		return false
	}
}

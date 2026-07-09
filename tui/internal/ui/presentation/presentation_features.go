package presentation

// presentation_features.go summarizes GeoJSON FeatureCollection tool results.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

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
	if source := FirstStringValue(result, "source", "layer", "dataset", "service", "name", "title"); source != "" {
		rows = append(rows, "source: "+source)
	}
	count := len(items)
	for _, key := range []string{"count", "record_count", "feature_count", "total", "total_count"} {
		if value, ok := valuefmt.FloatValue(result[key]); ok {
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
			if artifact := FirstStringValue(result, "output_path", "artifact_path", "artifact", "path", "file", "file_path"); artifact != "" {
				rows = append(rows, "artifact: "+valuefmt.ShortenPathForInline(artifact))
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
		return textutil.Truncate(strings.Join(strings.Fields(fmt.Sprint(raw)), " "), 180)
	}
	fields := featureRecordFields(record)
	title := valuefmt.FirstNonEmpty(
		FirstStringValue(fields, "IncidentName", "incident_name", "name", "Name", "title", "Title", "headline", "Headline", "event", "Event", "areaDesc", "AreaDesc"),
		FirstStringValue(fields, "id", "ID", "OBJECTID", "objectid"),
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
			bits = append(bits, pair.label+": "+textutil.Truncate(strings.Join(strings.Fields(text), " "), 80))
		}
		if len(bits) >= 4 {
			break
		}
	}
	if len(bits) == 0 {
		return textutil.Truncate(strings.Join(strings.Fields(title), " "), 180)
	}
	return textutil.Truncate(strings.Join(strings.Fields(title), " "), 90) + " · " + strings.Join(bits, " · ")
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
		if text := strings.TrimSpace(valuefmt.StringValue(value)); text != "" {
			return text
		}
		if number, ok := valuefmt.FloatValue(value); ok {
			return FormatCompactFloat(number)
		}
	}
	return ""
}

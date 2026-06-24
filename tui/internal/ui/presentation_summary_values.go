package ui

// presentation_summary_values.go provides scalar/numeric/named-item value extractors for tool-result summaries.

import (
	"fmt"
	"sort"
	"strings"
)

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
			firstStringValueFold(typed, "station", "station_id", "site", "site_id", "id", "name", "path", "column", "dataset", "variable", "title"),
			"(unnamed)",
		)
		if dtype := firstStringValueFold(typed, "dtype", "type", "data_type"); dtype != "" {
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

func firstStringValueFold(result map[string]any, keys ...string) string {
	if len(result) == 0 {
		return ""
	}
	for _, key := range keys {
		if text := strings.TrimSpace(stringValue(result[key])); text != "" {
			return text
		}
	}
	lowerKeys := make(map[string]bool, len(keys))
	for _, key := range keys {
		lowerKeys[strings.ToLower(strings.TrimSpace(key))] = true
	}
	for key, value := range result {
		if !lowerKeys[strings.ToLower(strings.TrimSpace(key))] {
			continue
		}
		if text := strings.TrimSpace(stringValue(value)); text != "" {
			return text
		}
	}
	return ""
}

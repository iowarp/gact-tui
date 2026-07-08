package ui

// presentation_ndp.go summarizes NDP catalog tool results.

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func summarizeNDPCatalogResult(result map[string]any) string {
	var rows []string
	featureRows := summarizeFeatureCollectionRows(result)
	if status := valuefmt.StringValue(result["status"]); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := valuefmt.StringValue(meta["status"]); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if count, ok := valuefmt.FloatValue(result["count"]); ok && len(featureRows) == 0 {
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

func summarizeNDPItems(label string, items []any) []string {
	rows := []string{fmt.Sprintf("%s:", label)}
	limit := min(len(items), 5)
	for i := 0; i < limit; i++ {
		item, ok := items[i].(map[string]any)
		if !ok {
			continue
		}
		title := valuefmt.FirstNonEmpty(
			valuefmt.StringValue(item["title"]),
			valuefmt.StringValue(item["name"]),
			valuefmt.StringValue(item["id"]),
		)
		if title == "" {
			title = "(untitled)"
		}
		var bits []string
		if org := valuefmt.StringValue(item["owner_org"]); org != "" {
			bits = append(bits, "org: "+org)
		}
		if n, ok := valuefmt.FloatValue(item["resource_count"]); ok {
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

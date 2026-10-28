package ui

// catalog_tool_detail.go formats a tool's detail text, including provider and annotations.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func formatToolDetail(tool gact.Tool) string {
	summary := []detailField{
		{"name", valuefmt.FirstNonEmpty(tool.Name, tool.ID)},
		{"comes from", toolProviderLabel(tool)},
	}
	if tool.ServerID != "" {
		summary = append(summary, detailField{"connection", tool.ServerID})
	}
	if tool.Owner != "" {
		summary = append(summary, detailField{"workflow area", tool.Owner})
	}
	if tool.PermissionDefault != "" {
		summary = append(summary, detailField{"approval needed", tool.PermissionDefault})
	}
	if tool.ID != "" && tool.ID != tool.Name {
		summary = append(summary, detailField{"technical id", tool.ID})
	}
	rows := appendDetailSection(nil, "Operator summary", summary...)

	availability := make([]detailField, 0, 3)
	if len(tool.VisibleTo) > 0 {
		availability = append(availability, detailField{"available to", strings.Join(tool.VisibleTo, ", ")})
	}
	if len(tool.Tags) > 0 {
		availability = append(availability, detailField{"tagged", strings.Join(tool.Tags, ", ")})
	}
	if len(availability) > 0 {
		rows = appendDetailSection(rows, "Availability", availability...)
	}

	if desc := strings.TrimSpace(tool.Description); desc != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", desc})
	}
	rows = appendSchemaSection(rows, "Inputs", tool.InputSchema)
	rows = appendSchemaSection(rows, "Outputs", tool.OutputSchema)
	rows = appendToolAnnotationsSection(rows, tool.Annotations)
	return strings.Join(rows, "\n")
}

func toolProviderLabel(tool gact.Tool) string {
	source := strings.TrimSpace(tool.Source)
	switch source {
	case "builtin":
		return "built-in"
	case "mcp":
		if tool.ServerID != "" {
			return "MCP"
		}
		return "MCP connection"
	case "":
		return "unknown"
	default:
		return source
	}
}

func appendToolAnnotationsSection(rows []string, annotations *gact.ToolAnnotations) []string {
	if annotations == nil {
		return rows
	}
	fields := make([]detailField, 0, 2)
	if title := strings.TrimSpace(annotations.Title); title != "" {
		fields = append(fields, detailField{"label", title})
	}
	hints := make([]string, 0, 4)
	if annotations.ReadOnlyHint {
		hints = append(hints, "read-only")
	}
	if annotations.DestructiveHint {
		hints = append(hints, "destructive")
	}
	if annotations.IdempotentHint {
		hints = append(hints, "idempotent")
	}
	if annotations.OpenWorldHint {
		hints = append(hints, "open-world")
	}
	hintText := "none supplied"
	if len(hints) > 0 {
		hintText = strings.Join(hints, ", ")
	}
	fields = append(fields, detailField{"hints", hintText})
	return appendDetailSection(rows, "Safety", fields...)
}

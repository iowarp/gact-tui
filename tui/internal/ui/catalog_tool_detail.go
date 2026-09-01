package ui

// catalog_tool_detail.go formats a tool's detail text, including provider, annotations, and owning agents.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func formatToolDetailWithAgents(tool gact.Tool, agents []gact.AgentDef) string {
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
	if owners := owningAgentsForTool(tool, agents); len(owners) > 0 {
		ownerRows := make([]string, 0, len(owners))
		for _, owner := range owners {
			ownerRows = append(ownerRows, "- "+owner)
		}
		availability = append(availability, detailField{"used by", strings.Join(ownerRows, "\n") + "\n"})
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

func owningAgentsForTool(tool gact.Tool, agents []gact.AgentDef) []string {
	toolIDs := map[string]bool{}
	for _, id := range []string{tool.ID, tool.Name, tool.Title} {
		id = strings.TrimSpace(id)
		if id != "" {
			toolIDs[id] = true
		}
	}
	visible := map[string]bool{}
	for _, id := range tool.VisibleTo {
		id = strings.TrimSpace(id)
		if id != "" {
			visible[id] = true
		}
	}
	owners := make([]string, 0)
	seen := map[string]bool{}
	for _, agent := range agents {
		if agent.ID == "" {
			continue
		}
		usesTool := visible[agent.ID]
		for _, declared := range agent.Tools {
			if toolIDs[strings.TrimSpace(declared)] {
				usesTool = true
				break
			}
		}
		if !usesTool {
			continue
		}
		label := operatorAgentTitle(agent)
		if agent.Specialization != "" {
			label += " · " + agent.Specialization
		} else if agent.Tier > 0 {
			label += " · tier " + itoa2(agent.Tier)
		}
		if !seen[label] {
			seen[label] = true
			owners = append(owners, label)
		}
	}
	sort.Strings(owners)
	return owners
}

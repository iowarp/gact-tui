package ui

// catalog_text_helpers.go provides tool catalog metadata/label helpers and description de-duplication.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func toolCatalogMetadata(tool gact.Tool) []string {
	parts := make([]string, 0, 6)
	if tool.Owner != "" {
		parts = append(parts, "owned by "+tool.Owner)
	}
	if tool.PermissionDefault != "" {
		parts = append(parts, toolPermissionLabel(tool.PermissionDefault))
	}
	if fields := schemaFieldNames(tool.InputSchema, 2); len(fields) > 0 {
		parts = append(parts, "needs "+strings.Join(fields, ", "))
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tagged "+strings.Join(limitStrings(tool.Tags, 1), ", "))
	}
	if len(parts) == 0 {
		if desc := toolPurposeSummary(tool); desc != "" {
			parts = append(parts, desc)
		}
	}
	return parts
}

func toolPermissionLabel(permission string) string {
	switch strings.ToLower(strings.TrimSpace(permission)) {
	case "ask", "prompt", "confirm":
		return "asks first"
	case "allow", "allowed", "auto", "always":
		return "runs directly"
	case "deny", "denied", "disabled", "never":
		return "blocked by default"
	case "":
		return ""
	default:
		return "permission " + permission
	}
}

func operatorSourceValueLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "agent_blueprint":
		return "agent blueprint"
	case "expert_pack":
		return "workflow pack"
	case "builtin":
		return "built-in"
	default:
		return valuefmt.HumanizeAgentLabel(source)
	}
}

func toolPurposeSummary(tool gact.Tool) string {
	desc := strings.TrimSpace(tool.Description)
	if desc == "" || toolDescriptionRepeatsName(desc, tool) {
		return ""
	}
	for _, marker := range []string{"\n\n", "\nAgent story:", "Agent story:"} {
		if idx := strings.Index(desc, marker); idx >= 0 {
			desc = strings.TrimSpace(desc[:idx])
		}
	}
	return valuefmt.CompactCatalogText(desc)
}

func schemaFieldNames(schema map[string]any, limit int) []string {
	if limit < 1 {
		limit = 1
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok || len(props) == 0 {
		return nil
	}
	names := sortedAnyMapKeys(props)
	if len(names) <= limit {
		return names
	}
	out := append([]string(nil), names[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(names)-limit))
	return out
}

func limitStrings(values []string, limit int) []string {
	if limit < 1 || len(values) <= limit {
		return values
	}
	out := append([]string(nil), values[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(values)-limit))
	return out
}

func toolDescriptionRepeatsName(desc string, tool gact.Tool) bool {
	return catalogDescriptionRepeatsAny(desc, tool.ID, tool.Name, tool.Title)
}

func nonRepeatingCatalogDescription(desc string, candidates ...string) string {
	desc = valuefmt.CompactCatalogText(desc)
	if desc == "" || catalogDescriptionRepeatsAny(desc, candidates...) {
		return ""
	}
	return desc
}

func catalogDescriptionRepeatsAny(desc string, candidates ...string) bool {
	normalizedDesc := normalizeCatalogComparable(desc)
	if normalizedDesc == "" {
		return false
	}
	for _, candidate := range candidates {
		if normalizedDesc == normalizeCatalogComparable(candidate) {
			return true
		}
	}
	return false
}

func normalizeCatalogComparable(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.Trim(text, "`'\". ")
	return strings.Join(strings.Fields(text), " ")
}

func toolSummary(tool gact.Tool) string {
	parts := make([]string, 0, 4)
	if desc := strings.TrimSpace(tool.Description); desc != "" && !toolDescriptionRepeatsName(desc, tool) {
		parts = append(parts, desc)
	}
	if tool.ServerID != "" {
		parts = append(parts, "connection: "+tool.ServerID)
	}
	if len(tool.Tags) > 0 {
		parts = append(parts, "tagged: "+strings.Join(tool.Tags, ", "))
	}
	if len(tool.VisibleTo) > 0 {
		parts = append(parts, "available to: "+strings.Join(tool.VisibleTo, ", "))
	}
	return strings.Join(parts, " · ")
}

func mcpDetailToolSummary(tool gact.Tool) string {
	if desc := strings.TrimSpace(tool.Description); desc != "" && !toolDescriptionRepeatsName(desc, tool) {
		return desc
	}
	if len(tool.Tags) > 0 {
		return "tags: " + strings.Join(tool.Tags, ", ")
	}
	return ""
}

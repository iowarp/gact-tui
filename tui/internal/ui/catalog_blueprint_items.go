package ui

// catalog_blueprint_items.go builds provider-grouped blueprint catalog items and marks the active blueprint.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentBlueprintProviderCatalogItem(key string, blueprints []gact.AgentBlueprintDefinition) catalogItem {
	label := agentBlueprintProviderGroupLabel(key)
	return catalogItem{
		id:         "provider/" + key,
		title:      label + " blueprints",
		desc:       fmt.Sprintf("%s provides %s in this workspace.", label, valuefmt.PluralizeCount(len(blueprints), "blueprint")),
		inlineDesc: valuefmt.PluralizeCount(len(blueprints), "blueprint"),
		statusTag:  strings.ToLower(label),
	}
}

func agentBlueprintProviderGroupKey(blueprint gact.AgentBlueprintDefinition) string {
	scope := compactStatusTag(valuefmt.FirstNonEmpty(blueprint.Scope, "workspace"))
	switch scope {
	case "builtin", "built-in", "built_in":
		return "built-in"
	case "workspace":
		return "workspace"
	case "session":
		return "session"
	default:
		if scope == "" {
			return "workspace"
		}
		return scope
	}
}

func agentBlueprintProviderGroupLabel(key string) string {
	switch key {
	case "built-in":
		return "Built-in"
	case "workspace":
		return "Workspace"
	case "session":
		return "Session"
	default:
		return valuefmt.HumanizeAgentLabel(key)
	}
}

func agentBlueprintProviderGroupRank(key string) int {
	switch key {
	case "built-in":
		return 0
	case "workspace":
		return 1
	case "session":
		return 2
	default:
		return 10
	}
}

func agentBlueprintCatalogItem(blueprint gact.AgentBlueprintDefinition, prefix string) catalogItem {
	title := valuefmt.FirstNonEmpty(blueprint.Title, blueprint.ID)
	if prefix != "" {
		title = prefix + title
	}
	return catalogItem{
		id:         blueprint.ID,
		title:      title,
		desc:       agentBlueprintDescription(blueprint),
		inlineDesc: agentBlueprintInlineSummary(blueprint),
		statusTag:  agentBlueprintCatalogStatus(blueprint),
	}
}

func markActiveAgentBlueprintCatalogItems(items []catalogItem, activeID, activeScope string) []catalogItem {
	activeID = strings.TrimSpace(activeID)
	if activeID == "" {
		return items
	}
	scope := valuefmt.FirstNonEmpty(strings.TrimSpace(activeScope), "unknown scope")
	out := append([]catalogItem(nil), items...)
	for i := range out {
		if out[i].id != activeID {
			continue
		}
		out[i].title = activeAgentBlueprintTitle(out[i].title)
		if scope != "session" {
			out[i].inlineDesc = appendCatalogInline(out[i].inlineDesc, scope+" blueprint")
		}
		out[i].statusTag = "active"
	}
	return out
}

func markActiveAgentBlueprintDetailItems(items []catalogItem, blueprintID, activeID, activeScope string) []catalogItem {
	if strings.TrimSpace(blueprintID) == "" || strings.TrimSpace(blueprintID) != strings.TrimSpace(activeID) {
		return items
	}
	scope := valuefmt.FirstNonEmpty(strings.TrimSpace(activeScope), "unknown scope")
	out := append([]catalogItem(nil), items...)
	for i := range out {
		switch out[i].id {
		case "activate":
			out[i].title = "Active"
			out[i].desc = ""
			if scope != "session" {
				out[i].desc = scope + " source"
			}
			out[i].statusTag = "active"
			out[i].disabled = false
		case "blueprint/" + blueprintID:
		}
	}
	return out
}

func activeAgentBlueprintDetailStatus(items []catalogItem) string {
	for _, item := range items {
		if item.id != "activate" || item.statusTag != "active" {
			continue
		}
		detail := valuefmt.CompactCatalogText(item.desc)
		if detail == "" {
			return "Active"
		}
		return "Active · " + detail
	}
	return ""
}

func activeAgentBlueprintTitle(title string) string {
	for _, prefix := range []string{"  ├─ ", "  └─ "} {
		if strings.HasPrefix(title, prefix) {
			label := strings.TrimSpace(strings.TrimPrefix(title, prefix))
			if strings.HasPrefix(label, "◆ ") {
				return prefix + label
			}
			return prefix + "◆ " + label
		}
	}
	if strings.HasPrefix(title, "◆ ") {
		return title
	}
	return "◆ " + strings.TrimSpace(title)
}

func appendCatalogInline(existing, suffix string) string {
	existing = strings.TrimSpace(existing)
	suffix = strings.TrimSpace(suffix)
	if suffix == "" {
		return existing
	}
	if existing == "" {
		return suffix
	}
	if strings.Contains(existing, suffix) {
		return existing
	}
	return existing + " · " + suffix
}

func treePrefix(index, total int) string {
	if total <= 1 || index == total-1 {
		return "  └─ "
	}
	return "  ├─ "
}

func agentBlueprintInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 7)
	if blueprint.Version != "" {
		parts = append(parts, "v"+blueprint.Version)
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, state)
	} else if blueprint.Scope != "" {
		parts = append(parts, blueprint.Scope)
	}
	if len(blueprint.ValidationErrors) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(blueprint.ValidationErrors), "error"))
	} else if len(blueprint.ValidationWarnings) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(blueprint.ValidationWarnings), "warning"))
	}
	if len(parts) == 0 {
		return "markdown agent blueprint"
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintCatalogStatus(blueprint gact.AgentBlueprintDefinition) string {
	if !blueprint.Enabled || len(blueprint.ValidationErrors) > 0 {
		return "invalid"
	}
	if len(blueprint.ValidationWarnings) > 0 {
		return "warning"
	}
	if agentBlueprintSourceKey(blueprint) == "" {
		return valuefmt.FirstNonEmpty(blueprint.Scope, "blueprint")
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if status := compactStatusTag(valuefmt.StringValue(install["status"])); status != "" {
		return status
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		return state
	}
	return valuefmt.FirstNonEmpty(blueprint.Scope, "blueprint")
}

func compactStatusTag(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	status = strings.ReplaceAll(status, " ", "_")
	status = strings.ReplaceAll(status, "-", "_")
	return status
}

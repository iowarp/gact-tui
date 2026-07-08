package ui

// catalog_blueprint_detail_items.go builds the detail catalog items for a single agent blueprint and its activation status text.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentBlueprintDetailItems(detail gact.AgentBlueprintDetail) []catalogItem {
	blueprint := detail.AgentBlueprint
	activation := catalogItem{
		id:        "activate",
		title:     "Activate for current session",
		desc:      sessionActivationDescription("markdown agent blueprint"),
		statusTag: "session",
	}
	if reason := agentBlueprintActivationBlockReason(blueprint); reason != "" {
		activation.desc = reason + " · " + activation.desc
		activation.statusTag = "blocked"
		activation.disabled = true
	}
	summary := catalogItem{
		id:         "blueprint/" + blueprint.ID,
		title:      "Overview",
		desc:       formatAgentBlueprintSummary(blueprint),
		inlineDesc: agentBlueprintDetailInlineSummary(blueprint),
	}
	items := []catalogItem{}
	if len(blueprint.ValidationErrors) > 0 {
		items = append(items, catalogItem{id: "validation", title: "Check · Validation errors", desc: strings.Join(displayValidationErrors(blueprint.ValidationErrors), "; "), statusTag: "error"})
	}
	if len(blueprint.ValidationWarnings) > 0 {
		items = append(items, catalogItem{id: "validation-warnings", title: "Check · Validation warnings", desc: strings.Join(blueprint.ValidationWarnings, "; "), statusTag: "warning"})
	}
	items = append(items, activation, summary)
	manageable := blueprint.Scope == "workspace" || blueprint.Scope == "global"
	items = append(items, catalogItem{
		id:        "blueprint-action/update",
		title:     "Update installed blueprint",
		desc:      agentBlueprintLifecycleActionDescription(blueprint, "update", manageable),
		statusTag: "manage",
		disabled:  !manageable,
	}, catalogItem{
		id:        "blueprint-action/delete",
		title:     "Delete installed blueprint",
		desc:      agentBlueprintLifecycleActionDescription(blueprint, "delete", manageable),
		statusTag: "delete",
		disabled:  !manageable,
	})
	for _, agentItem := range agentCatalogItems(detail.Agents, catalogKindAgents) {
		agentID := strings.TrimPrefix(agentItem.id, "agent/")
		agentItem.id = "agent/" + agentID
		agentItem.title = agentBlueprintExpertTitle(agentItem.title)
		if agentItem.statusTag != "invalid" && agentItem.statusTag != "warning" {
			if strings.Contains(agentItem.inlineDesc, "tier 1") {
				agentItem.statusTag = "root"
			} else {
				agentItem.statusTag = "expert"
			}
		}
		items = append(items, agentItem)
	}
	for _, descriptor := range detail.MCPDescriptors {
		id := valuefmt.StringValue(descriptor["id"])
		title := valuefmt.FirstNonEmpty(valuefmt.StringValue(descriptor["name"]), id)
		status := valuefmt.FirstNonEmpty(valuefmt.StringValue(descriptor["status"]), "mcp")
		if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         "mcp/" + id,
			title:      title + " access",
			desc:       agentBlueprintMCPDescription(descriptor),
			inlineDesc: agentBlueprintMCPInlineSummary(descriptor),
			statusTag:  status,
		})
	}
	for _, descriptor := range detail.HookDescriptors {
		id := valuefmt.StringValue(descriptor["id"])
		title := agentBlueprintHookTitle(descriptor)
		status := valuefmt.FirstNonEmpty(valuefmt.StringValue(descriptor["status"]), "hook")
		if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         "hook/" + id,
			title:      title,
			desc:       agentBlueprintHookDescription(descriptor),
			inlineDesc: agentBlueprintHookInlineSummary(descriptor),
			statusTag:  status,
		})
	}
	return items
}

func agentBlueprintActivationBlockReason(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		return "cannot activate until validation errors are resolved"
	}
	if !blueprint.Enabled {
		return "cannot activate because this blueprint is disabled"
	}
	if strings.TrimSpace(blueprint.RootExpert) == "" {
		return "cannot activate until a root expert is defined"
	}
	return ""
}

func sessionActivationDescription(runtime string) string {
	return "sets this " + runtime + " only for the current selected session; " + sessionDefaultDescription()
}

func sessionDefaultDescription() string {
	return "new sessions keep the workspace default"
}

func formatAgentBlueprintSummary(blueprint gact.AgentBlueprintDefinition) string {
	workflow := nonRepeatingCatalogDescription(blueprint.Description, blueprint.Title, blueprint.ID)
	if workflow == "" {
		workflow = valuefmt.FirstNonEmpty(blueprint.Title, blueprint.ID)
	}
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"workflow", workflow},
		detailField{"status", agentBlueprintStatusText(blueprint)},
		detailField{"activation", "select Activate to use this blueprint for the current session"},
		detailField{"session scope", sessionDefaultDescription()},
		detailField{"root expert", blueprint.RootExpert},
	)
	rows = appendDetailSection(rows, "Blueprint identity",
		detailField{"id", blueprint.ID},
		detailField{"title", blueprint.Title},
		detailField{"version", blueprint.Version},
		detailField{"scope", blueprint.Scope},
		detailField{"enabled", fmt.Sprintf("%t", blueprint.Enabled)},
		detailField{"blueprint root", blueprint.Root},
		detailField{"definition file", valuefmt.FirstNonEmpty(blueprint.DefinitionPath, blueprint.RootPath)},
	)
	rows = appendAgentBlueprintProvenanceSection(rows, blueprint)
	if len(blueprint.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(displayValidationErrors(blueprint.ValidationErrors), "\n")})
	}
	if len(blueprint.ValidationWarnings) > 0 {
		rows = appendDetailSection(rows, "Validation warnings", detailField{"warnings", strings.Join(blueprint.ValidationWarnings, "\n")})
	}
	if len(blueprint.Defaults) > 0 {
		if payload, err := json.MarshalIndent(blueprint.Defaults, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Defaults", detailField{"", string(payload)})
		}
	}
	if metadata := agentBlueprintDisplayMetadata(blueprint); len(metadata) > 0 {
		if payload, err := json.MarshalIndent(metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	if desc := nonRepeatingCatalogDescription(blueprint.Description, blueprint.Title, blueprint.ID); desc != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", desc})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintStatusText(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		return "invalid"
	}
	if !blueprint.Enabled {
		return "disabled"
	}
	if len(blueprint.ValidationWarnings) > 0 {
		return fmt.Sprintf("ready with %d warning%s", len(blueprint.ValidationWarnings), plural(len(blueprint.ValidationWarnings)))
	}
	return "ready"
}

func agentBlueprintDetailInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	if len(blueprint.ValidationErrors) > 0 {
		parts := []string{"needs fix: " + displayValidationError(blueprint.ValidationErrors[0])}
		if blueprint.Scope != "" {
			parts = append(parts, blueprint.Scope)
		}
		if blueprint.Version != "" {
			parts = append(parts, "v"+blueprint.Version)
		}
		return strings.Join(parts, " · ")
	}
	parts := []string{agentBlueprintStatusText(blueprint)}
	if root := strings.TrimSpace(blueprint.RootExpert); root != "" {
		parts = append(parts, "root: "+root)
	}
	if summary := agentBlueprintInlineSummary(blueprint); summary != "" && summary != "markdown agent blueprint" {
		parts = append(parts, summary)
	}
	return strings.Join(parts, " · ")
}

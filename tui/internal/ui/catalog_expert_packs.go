package ui

// catalog_expert_packs.go builds expert-pack catalog items, summaries, and detail items.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func expertPackCatalogItems(packs []gact.ExpertPackDefinition) []catalogItem {
	if len(packs) == 0 {
		return []catalogItem{{
			id:         "none",
			title:      "No expert packs installed",
			desc:       "Open /agent-blueprints, install a workflow blueprint from a marketplace source, then reopen /expert-packs to inspect and activate the pack for the current session.",
			inlineDesc: "workflow pack library is empty",
			statusTag:  "empty",
		}, {
			id:         "none",
			title:      "Install workflow pack",
			desc:       "Open /agent-blueprints and install a workflow blueprint from a marketplace source.",
			inlineDesc: "open /agent-blueprints and install from marketplace",
		}, {
			id:         "none",
			title:      "Activate for session",
			desc:       "Reopen /expert-packs, inspect the installed pack, and activate it for the current session.",
			inlineDesc: "reopen /expert-packs and activate for session",
		}}
	}
	sort.SliceStable(packs, func(i, j int) bool {
		if packs[i].Scope != packs[j].Scope {
			return packs[i].Scope < packs[j].Scope
		}
		return valuefmt.FirstNonEmpty(packs[i].Title, packs[i].ID) < valuefmt.FirstNonEmpty(packs[j].Title, packs[j].ID)
	})
	items := make([]catalogItem, 0, len(packs))
	for _, pack := range packs {
		status := valuefmt.FirstNonEmpty(pack.Scope, "pack")
		if !pack.Enabled || len(pack.ValidationErrors) > 0 {
			status = "invalid"
		}
		items = append(items, catalogItem{
			id:         pack.ID,
			title:      valuefmt.FirstNonEmpty(pack.Title, pack.ID),
			desc:       expertPackDescription(pack),
			inlineDesc: expertPackInlineSummary(pack),
			statusTag:  status,
		})
	}
	return items
}

func expertPackDescription(pack gact.ExpertPackDefinition) string {
	parts := make([]string, 0, 6)
	if pack.Description != "" && len(pack.ValidationErrors) == 0 {
		parts = append(parts, valuefmt.CompactCatalogText(pack.Description))
	}
	parts = append(parts, expertPackStatusText(pack))
	if pack.Scope != "" {
		parts = append(parts, pack.Scope)
	}
	if pack.Version != "" {
		parts = append(parts, "v"+pack.Version)
	}
	if len(pack.ValidationErrors) > 0 {
		parts = append(parts, "needs fix: "+displayValidationError(pack.ValidationErrors[0]))
	}
	return strings.Join(parts, " · ")
}

func expertPackInlineSummary(pack gact.ExpertPackDefinition) string {
	parts := make([]string, 0, 6)
	if len(pack.ValidationErrors) == 0 {
		parts = append(parts, expertPackStatusText(pack))
	}
	if pack.Scope != "" {
		parts = append(parts, pack.Scope)
	}
	if pack.Version != "" {
		parts = append(parts, "v"+pack.Version)
	}
	if len(pack.ValidationErrors) > 0 {
		parts = append(parts, "needs fix: "+displayValidationError(pack.ValidationErrors[0]))
	}
	return strings.Join(parts, " · ")
}

func expertPackDetailItems(detail gact.ExpertPackDetail) []catalogItem {
	pack := detail.ExpertPack
	activation := catalogItem{
		id:        "activate",
		title:     "Activate for current session",
		desc:      sessionActivationDescription("expert pack"),
		statusTag: "session",
	}
	if reason := expertPackActivationBlockReason(pack); reason != "" {
		activation.title = "Activation blocked"
		activation.desc = reason + " · " + sessionActivationDescription("expert pack")
		activation.statusTag = "blocked"
		activation.disabled = true
	}
	items := []catalogItem{activation, {
		id:         "pack/" + pack.ID,
		title:      "Workflow pack · " + valuefmt.FirstNonEmpty(pack.Title, pack.ID),
		desc:       formatExpertPackSummary(pack, detail.Agents),
		inlineDesc: expertPackInlineSummary(pack),
	}}
	items = append(items, catalogItem{
		id:        "expert-pack-action/update",
		title:     "Update pack",
		desc:      "refresh this installed workflow pack from its recorded source",
		statusTag: "write",
	}, catalogItem{
		id:        "expert-pack-action/delete",
		title:     "Delete pack",
		desc:      "remove this installed workflow pack from the workspace registry",
		statusTag: "delete",
	})
	if len(pack.ValidationErrors) > 0 {
		items = append(items, catalogItem{
			id: "validation", title: "Validation errors", desc: strings.Join(pack.ValidationErrors, "; "), statusTag: "error",
		})
	}
	for _, agentItem := range hierarchicalAgentCatalogItems(detail.Agents, detail.Agents) {
		agentID := strings.TrimPrefix(agentItem.id, "agent/")
		agentItem.id = "agent/" + agentID
		items = append(items, agentItem)
	}
	return items
}

func expertPackActivationBlockReason(pack gact.ExpertPackDefinition) string {
	if len(pack.ValidationErrors) > 0 {
		return "cannot activate until validation errors are resolved"
	}
	if !pack.Enabled {
		return "cannot activate because this pack is disabled"
	}
	return ""
}

func formatExpertPackSummary(pack gact.ExpertPackDefinition, agents []gact.AgentDef) string {
	activation := "select Activate to use this pack for the current session"
	if reason := expertPackActivationBlockReason(pack); reason != "" {
		activation = reason
	}
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"workflow", valuefmt.FirstNonEmpty(pack.Description, valuefmt.FirstNonEmpty(pack.Title, pack.ID))},
		detailField{"status", expertPackStatusText(pack)},
		detailField{"activation", activation},
		detailField{"session scope", sessionDefaultDescription()},
		detailField{"experts", fmt.Sprintf("%d", len(agents))},
		detailField{"tools", expertPackToolsSummary(agents)},
	)
	rows = appendDetailSection(rows, "Workflow pack identity",
		detailField{"id", pack.ID},
		detailField{"title", pack.Title},
		detailField{"version", pack.Version},
		detailField{"scope", pack.Scope},
		detailField{"enabled", fmt.Sprintf("%t", pack.Enabled)},
	)
	sourceFields := []detailField{
		{"root", pack.Root},
		{"definition", pack.DefinitionPath},
	}
	if install := valuefmt.MapValue(pack.Metadata["install"]); len(install) > 0 {
		sourceFields = append(sourceFields,
			detailField{"source", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source"]), valuefmt.StringValue(install["url"]), valuefmt.StringValue(install["path"]))},
			detailField{"source kind", valuefmt.StringValue(install["source_kind"])},
			detailField{"ref", valuefmt.StringValue(install["ref"])},
			detailField{"commit", valuefmt.StringValue(install["commit"])},
			detailField{"last synced", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["last_synced_at"]), valuefmt.StringValue(install["synced_at"]))},
			detailField{"trust", valuefmt.StringValue(install["trust"])},
		)
	}
	rows = appendDetailSection(rows, "Source evidence", sourceFields...)
	if len(pack.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(displayValidationErrors(pack.ValidationErrors), "\n")})
	}
	if len(pack.Defaults) > 0 {
		if payload, err := json.MarshalIndent(pack.Defaults, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Defaults", detailField{"", string(payload)})
		}
	}
	if len(pack.Metadata) > 0 {
		if payload, err := json.MarshalIndent(pack.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	if pack.Description != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", pack.Description})
	}
	return strings.Join(rows, "\n")
}

func expertPackToolsSummary(agents []gact.AgentDef) string {
	seen := map[string]bool{}
	tools := []string{}
	for _, agent := range agents {
		for _, tool := range agent.Tools {
			if tool == "" || seen[tool] {
				continue
			}
			seen[tool] = true
			tools = append(tools, tool)
		}
	}
	sort.Strings(tools)
	if len(tools) == 0 {
		return "none declared"
	}
	if len(tools) > 4 {
		return strings.Join(tools[:4], ", ") + fmt.Sprintf(", +%d more", len(tools)-4)
	}
	return strings.Join(tools, ", ")
}

func expertPackStatusText(pack gact.ExpertPackDefinition) string {
	if len(pack.ValidationErrors) > 0 {
		return "invalid"
	}
	if !pack.Enabled {
		return "disabled"
	}
	return "ready"
}

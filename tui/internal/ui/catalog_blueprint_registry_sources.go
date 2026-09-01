package ui

// catalog_blueprint_registry_sources.go builds catalog items for blueprint marketplace/registry sources and their summaries.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentBlueprintSourceRegistryItems(sources []gact.AgentBlueprintSource) []catalogItem {
	sort.SliceStable(sources, func(i, j int) bool {
		if sources[i].Status != sources[j].Status {
			return sources[i].Status < sources[j].Status
		}
		return valuefmt.FirstNonEmpty(sources[i].Name, sources[i].ID) < valuefmt.FirstNonEmpty(sources[j].Name, sources[j].ID)
	})
	items := make([]catalogItem, 0, len(sources)*2)
	if len(sources) == 0 {
		return []catalogItem{{
			id:        "source/none",
			title:     "No marketplace sources configured",
			desc:      "Use Add marketplace source to register a source URL, then install a provided blueprint from this source tree. Manual install remains available for one-off files.",
			statusTag: "empty",
			disabled:  true,
		}}
	}
	for _, source := range sources {
		status := valuefmt.FirstNonEmpty(source.Status, "source")
		if source.Error != "" {
			status = "error"
		}
		sourceID := source.ID
		items = append(items, catalogItem{
			id:         "source/" + sourceID,
			title:      "▾ " + valuefmt.FirstNonEmpty(source.Name, source.Source, source.ID),
			desc:       formatAgentBlueprintRegistrySource(source),
			inlineDesc: agentBlueprintRegistrySourceInlineSummary(source),
			statusTag:  status,
		})
		blueprints := append([]gact.AgentBlueprintDefinition(nil), source.AvailableBlueprints...)
		sort.SliceStable(blueprints, func(i, j int) bool {
			return valuefmt.FirstNonEmpty(blueprints[i].Title, blueprints[i].ID) < valuefmt.FirstNonEmpty(blueprints[j].Title, blueprints[j].ID)
		})
		for idx, blueprint := range blueprints {
			items = append(items, catalogItem{
				id:         "source-blueprint/" + sourceID + "/" + blueprint.ID,
				title:      treePrefix(idx, len(blueprints)) + valuefmt.FirstNonEmpty(blueprint.Title, blueprint.ID),
				desc:       agentBlueprintDescription(blueprint),
				inlineDesc: agentBlueprintRegistryBlueprintInlineSummary(blueprint),
				statusTag:  valuefmt.FirstNonEmpty(blueprint.Version, "install"),
			})
		}
	}
	return items
}

func agentBlueprintRegistrySourceInlineSummary(source gact.AgentBlueprintSource) string {
	parts := make([]string, 0, 8)
	if source.SourceKind != "" {
		parts = append(parts, marketplaceSourceKindLabel(source.SourceKind))
	}
	if source.Ref != "" {
		parts = append(parts, "branch "+source.Ref)
	}
	if source.Status != "" {
		parts = append(parts, source.Status)
	}
	if source.Commit != "" {
		parts = append(parts, "revision "+shortHash(source.Commit))
	} else if source.PinnedCommit != "" {
		parts = append(parts, "pinned "+shortHash(source.PinnedCommit))
	}
	if len(source.AvailableBlueprints) > 0 {
		parts = append(parts, availableBlueprintCountLabel(len(source.AvailableBlueprints)))
	}
	if source.Error != "" {
		parts = append(parts, "needs attention: "+valuefmt.CompactCatalogText(source.Error))
	}
	if len(parts) == 0 {
		return "source registry entry"
	}
	return strings.Join(parts, " · ")
}

func marketplaceSourceKindLabel(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "git":
		return "Git marketplace"
	case "path", "local":
		return "local folder"
	case "url", "http", "https":
		return "remote registry"
	case "":
		return ""
	default:
		return strings.ReplaceAll(strings.TrimSpace(kind), "_", " ")
	}
}

func availableBlueprintCountLabel(count int) string {
	if count == 1 {
		return "1 available"
	}
	return fmt.Sprintf("%d available", count)
}

func agentBlueprintRegistryBlueprintInlineSummary(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 5)
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, marketplaceBlueprintStateLabel(state))
	} else if blueprint.Scope != "" {
		parts = append(parts, marketplaceBlueprintStateLabel(blueprint.Scope))
	} else {
		parts = append(parts, "available to install")
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if ref := valuefmt.StringValue(install["ref"]); ref != "" {
		parts = append(parts, "branch "+ref)
	}
	if commit := valuefmt.StringValue(install["commit"]); commit != "" {
		parts = append(parts, shortHash(commit))
	}
	return strings.Join(parts, " · ")
}

func parseSourceBlueprintItemID(id string) (sourceID, blueprintID string, ok bool) {
	rest := strings.TrimPrefix(id, "source-blueprint/")
	if rest == id {
		return "", "", false
	}
	sourceID, blueprintID, ok = strings.Cut(rest, "/")
	return sourceID, blueprintID, ok && sourceID != "" && blueprintID != ""
}

func formatAgentBlueprintRegistrySource(source gact.AgentBlueprintSource) string {
	rows := appendDetailSection(nil, "Marketplace connection",
		detailField{"name", valuefmt.FirstNonEmpty(source.Name, source.ID)},
		detailField{"status", valuefmt.FirstNonEmpty(source.Status, "unknown")},
		detailField{"available", valuefmt.PluralizeCount(len(source.AvailableBlueprints), "blueprint")},
	)
	rows = appendDetailSection(rows, "Repository",
		detailField{"url", source.Source},
		detailField{"type", source.SourceKind},
		detailField{"branch", source.Ref},
		detailField{"current revision", source.Commit},
		detailField{"pinned revision", source.PinnedCommit},
	)
	rows = appendDetailSection(rows, "Registry",
		detailField{"registry id", source.ID},
		detailField{"last synced", source.UpdatedAt},
		detailField{"registered", source.AddedAt},
	)
	if source.Error != "" {
		rows = appendDetailSection(rows, "Error", detailField{"", source.Error})
	}
	rows = appendDetailSection(rows, "Operator paths",
		detailField{"refresh source", "sync this source through the source controls"},
		detailField{"install blueprint", "choose a blueprint below, then install it into the workspace"},
		detailField{"remove source", "remove the registry source; installed blueprints stay installed"},
	)
	if len(source.AvailableBlueprints) > 0 {
		lines := make([]string, 0, len(source.AvailableBlueprints))
		for _, blueprint := range source.AvailableBlueprints {
			line := valuefmt.FirstNonEmpty(blueprint.Title, blueprint.ID)
			if blueprint.Version != "" {
				line += " · " + blueprint.Version
			}
			lines = append(lines, "- "+line)
		}
		rows = appendDetailSection(rows, "Available blueprints", detailField{"", strings.Join(lines, "\n")})
	}
	return strings.Join(rows, "\n")
}

package ui

// catalog_blueprints.go builds the top-level blueprint catalog items and validation-error display strings.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentBlueprintCatalogItems(blueprints []gact.AgentBlueprintDefinition) []catalogItem {
	sort.SliceStable(blueprints, func(i, j int) bool {
		if blueprints[i].Scope != blueprints[j].Scope {
			return blueprints[i].Scope < blueprints[j].Scope
		}
		return valuefmt.FirstNonEmpty(blueprints[i].Title, blueprints[i].ID) < valuefmt.FirstNonEmpty(blueprints[j].Title, blueprints[j].ID)
	})
	items := make([]catalogItem, 0, len(blueprints))
	providerGroups := map[string][]gact.AgentBlueprintDefinition{}
	sourceSummaries, sourceGroups := agentBlueprintSourceSummaries(blueprints)
	for i, summary := range sourceSummaries {
		status := marketplaceSourceStatusTag(summary)
		if agentBlueprintSourceNeedsAttention(summary) {
			status = "attention"
		}
		items = append(items, catalogItem{
			id:         fmt.Sprintf("source/%d", i),
			title:      "Source · " + sourceTitle(summary),
			desc:       formatAgentBlueprintSourceSummary(summary),
			inlineDesc: agentBlueprintSourceInlineSummary(summary),
			statusTag:  status,
		})
		group := append([]gact.AgentBlueprintDefinition(nil), sourceGroups[summary.key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return valuefmt.FirstNonEmpty(group[i].Title, group[i].ID) < valuefmt.FirstNonEmpty(group[j].Title, group[j].ID)
		})
		for idx, blueprint := range group {
			items = append(items, agentBlueprintCatalogItem(blueprint, treePrefix(idx, len(group))))
		}
	}
	for _, blueprint := range blueprints {
		if agentBlueprintSourceKey(blueprint) != "" {
			continue
		}
		providerGroups[agentBlueprintProviderGroupKey(blueprint)] = append(providerGroups[agentBlueprintProviderGroupKey(blueprint)], blueprint)
	}
	providerKeys := make([]string, 0, len(providerGroups))
	for key := range providerGroups {
		providerKeys = append(providerKeys, key)
	}
	sort.SliceStable(providerKeys, func(i, j int) bool {
		left := agentBlueprintProviderGroupRank(providerKeys[i])
		right := agentBlueprintProviderGroupRank(providerKeys[j])
		if left != right {
			return left < right
		}
		return providerKeys[i] < providerKeys[j]
	})
	for _, key := range providerKeys {
		group := append([]gact.AgentBlueprintDefinition(nil), providerGroups[key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return valuefmt.FirstNonEmpty(group[i].Title, group[i].ID) < valuefmt.FirstNonEmpty(group[j].Title, group[j].ID)
		})
		items = append(items, agentBlueprintProviderCatalogItem(key, group))
		for idx, blueprint := range group {
			items = append(items, agentBlueprintCatalogItem(blueprint, treePrefix(idx, len(group))))
		}
	}
	return items
}

func displayValidationErrors(errors []string) []string {
	out := make([]string, 0, len(errors))
	for _, errText := range errors {
		if text := displayValidationError(errText); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func displayValidationError(errText string) string {
	text := valuefmt.CompactCatalogText(errText)
	text = strings.ReplaceAll(text, "_", " ")
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "parent id") && strings.Contains(lower, "missing expert"):
		return "missing parent expert"
	case strings.Contains(lower, "root expert") && strings.Contains(lower, "not found"):
		return "missing root expert"
	}
	return text
}

func agentBlueprintDescription(blueprint gact.AgentBlueprintDefinition) string {
	parts := make([]string, 0, 10)
	if blueprint.Version != "" {
		parts = append(parts, "version: "+blueprint.Version)
	}
	if blueprint.RootExpert != "" {
		parts = append(parts, "root expert: "+blueprint.RootExpert)
	}
	if state := agentBlueprintMarketplaceState(blueprint); state != "" {
		parts = append(parts, "marketplace state: "+state)
	}
	if provenance := agentBlueprintProvenanceLine(blueprint); provenance != "" {
		parts = append(parts, provenance)
	}
	if blueprint.DefinitionPath != "" {
		parts = append(parts, "definition file: "+blueprint.DefinitionPath)
	}
	if len(blueprint.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(blueprint.ValidationErrors, "; "))
	}
	if len(blueprint.ValidationWarnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(blueprint.ValidationWarnings, "; "))
	}
	if desc := nonRepeatingCatalogDescription(blueprint.Description, blueprint.Title, blueprint.ID); desc != "" {
		parts = append(parts, desc)
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintMarketplaceState(blueprint gact.AgentBlueprintDefinition) string {
	if agentBlueprintSourceKey(blueprint) == "" {
		return ""
	}
	install := agentBlueprintInstallMetadata(blueprint)
	if valuefmt.FirstNonEmpty(valuefmt.StringValue(install["installed_at"]), valuefmt.StringValue(install["status"]), valuefmt.StringValue(install["last_sync"]), valuefmt.StringValue(install["last_synced_at"]), valuefmt.StringValue(install["synced_at"])) != "" {
		return "installed"
	}
	switch strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(valuefmt.StringValue(install["scope"]), blueprint.Scope))) {
	case "workspace", "global", "session", "user":
		return "installed"
	default:
		return "available"
	}
}

func agentBlueprintExpertTitle(title string) string {
	title = strings.TrimRight(title, " ")
	prefixLen := len(title) - len(strings.TrimLeft(title, " "))
	prefix := title[:prefixLen]
	trimmed := strings.TrimLeft(title, " ")
	tierPrefix, tierIndent, withoutTier := splitAgentHierarchyComputedPrefix(trimmed)
	if withoutTier != "" {
		trimmed = withoutTier
		prefix = tierIndent
	}
	if strings.HasPrefix(trimmed, "Root expert · ") {
		return tierPrefix + stripAgentHierarchyRolePrefix(strings.TrimSpace(trimmed))
	}
	if strings.HasPrefix(trimmed, "└─ ") {
		label := strings.TrimSpace(strings.TrimPrefix(trimmed, "└─ "))
		label = stripAgentHierarchyRolePrefix(label)
		return tierPrefix + prefix + "└─ " + label
	}
	return tierPrefix + stripAgentHierarchyRolePrefix(strings.TrimSpace(trimmed))
}

func stripAgentHierarchyRolePrefix(title string) string {
	_, _, title = splitAgentHierarchyComputedPrefix(strings.TrimSpace(title))
	for _, prefix := range []string{"Root expert · ", "Expert · "} {
		title = strings.TrimPrefix(title, prefix)
	}
	title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(title), "└─"))
	return strings.TrimSpace(title)
}

func splitAgentHierarchyComputedPrefix(title string) (string, string, string) {
	original := title
	title = strings.TrimLeft(title, " ")
	if !strings.HasPrefix(title, "T") {
		return "", "", original
	}
	firstSpace := strings.IndexByte(title, ' ')
	if firstSpace <= 1 {
		return "", "", title
	}
	tier := title[:firstSpace]
	for _, r := range tier[1:] {
		if r < '0' || r > '9' {
			return "", "", title
		}
	}
	rest := strings.TrimLeft(title[firstSpace+1:], " ")
	secondSpace := strings.IndexByte(rest, ' ')
	if secondSpace <= 0 {
		return "", "", title
	}
	index := rest[:secondSpace]
	for _, r := range index {
		if (r < '0' || r > '9') && r != '.' && r != 'u' {
			return "", "", title
		}
	}
	remainder := rest[secondSpace+1:]
	indentLen := len(remainder) - len(strings.TrimLeft(remainder, " "))
	return tier + " " + index + " ", remainder[:indentLen], strings.TrimLeft(remainder, " ")
}

package ui

// catalog_prompts.go builds prompt catalog items grouped by provider/scope with summaries.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func promptCatalogItems(prompts []gact.PromptDefinition, scope client.RuntimeScope) []catalogItem {
	if len(prompts) == 0 {
		desc := "No prompt definitions are visible for this workspace/session. Open /agent-blueprints, activate the intended workflow, then reopen /prompts."
		items := []catalogItem{{
			id:         "none",
			title:      "No prompts available",
			desc:       desc,
			inlineDesc: "workflow prompt library is empty",
			statusTag:  "empty",
		}}
		if strings.TrimSpace(scope.SessionID) == "" {
			desc = "No session is selected, so session and workflow prompts cannot be resolved yet. Start or select a session, activate the intended workflow from /agent-blueprints, then reopen /prompts."
			items[0].desc = desc
			items[0].inlineDesc = "start/select a session first"
			items = append(items, catalogItem{
				id:         "none",
				title:      "Then activate workflow",
				desc:       "Open /agent-blueprints and activate the intended workflow blueprint for the selected session.",
				inlineDesc: "open /agent-blueprints after selecting a session",
			})
		} else {
			items = append(items, catalogItem{
				id:         "none",
				title:      "Activate workflow",
				desc:       "Open /agent-blueprints and activate the intended workflow blueprint for this session.",
				inlineDesc: "open /agent-blueprints and activate workflow",
			})
		}
		items = append(items, catalogItem{
			id:         "none",
			title:      "Reload prompt library",
			desc:       "Reopen /prompts after activation so packaged workflow prompts are visible.",
			inlineDesc: "reopen /prompts after activation",
		})
		return items
	}
	sort.SliceStable(prompts, func(i, j int) bool { return prompts[i].ID < prompts[j].ID })
	groups := map[string][]gact.PromptDefinition{}
	for _, p := range prompts {
		key := promptProviderGroupKey(p)
		groups[key] = append(groups[key], p)
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.SliceStable(keys, func(i, j int) bool {
		left := agentBlueprintProviderGroupRank(keys[i])
		right := agentBlueprintProviderGroupRank(keys[j])
		if left != right {
			return left < right
		}
		return keys[i] < keys[j]
	})
	items := make([]catalogItem, 0, len(prompts)+len(keys))
	for _, key := range keys {
		group := append([]gact.PromptDefinition(nil), groups[key]...)
		sort.SliceStable(group, func(i, j int) bool {
			return firstNonEmpty(group[i].Title, group[i].ID) < firstNonEmpty(group[j].Title, group[j].ID)
		})
		items = append(items, promptProviderCatalogItem(key, group))
		for idx, p := range group {
			items = append(items, promptCatalogItem(p, treePrefix(idx, len(group))))
		}
	}
	return items
}

func promptCatalogItem(p gact.PromptDefinition, prefix string) catalogItem {
	status := ""
	if len(p.ValidationErrors) > 0 {
		status = "attention"
	}
	return catalogItem{
		id:         p.ID,
		title:      prefix + stripPromptRowPrefix(firstNonEmpty(p.Title, p.ID)),
		desc:       promptDefinitionDescription(p),
		inlineDesc: promptDefinitionInlineSummary(p),
		statusTag:  status,
	}
}

func promptProviderCatalogItem(key string, prompts []gact.PromptDefinition) catalogItem {
	label := promptProviderGroupLabel(key)
	return catalogItem{
		id:         "provider/" + key,
		title:      "Provider · " + label,
		desc:       fmt.Sprintf("%s prompt source with %s available in this session.", label, pluralizeCount(len(prompts), "prompt")),
		inlineDesc: pluralizeCount(len(prompts), "prompt"),
	}
}

func promptProviderGroupKey(p gact.PromptDefinition) string {
	scope := compactStatusTag(firstNonEmpty(p.Scope, "workspace"))
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

func promptProviderGroupLabel(key string) string {
	return agentBlueprintProviderGroupLabel(key)
}

func promptProviderScopeLabel(scope string) string {
	return strings.ToLower(promptProviderGroupLabel(promptProviderGroupKey(gact.PromptDefinition{Scope: scope})))
}

func promptDefinitionDescription(p gact.PromptDefinition) string {
	parts := make([]string, 0, 5)
	if p.Scope != "" {
		parts = append(parts, promptProviderScopeLabel(p.Scope)+" prompt")
	}
	profiles := sortedPromptProfiles(p.Profiles)
	if len(profiles) > 0 {
		parts = append(parts, fmt.Sprintf("profiles: %s", strings.Join(profiles, ", ")))
	}
	if p.DefaultProfile != "" {
		parts = append(parts, "default profile: "+p.DefaultProfile)
	}
	if len(p.ValidationErrors) > 0 {
		parts = append(parts, "validation: "+pluralizeCount(len(p.ValidationErrors), "validation error")+" - "+strings.Join(p.ValidationErrors, "; "))
	}
	if desc := compactCatalogText(p.Description); desc != "" {
		parts = append(parts, "description: "+desc)
	}
	return strings.Join(parts, " · ")
}

func promptDefinitionInlineSummary(p gact.PromptDefinition) string {
	parts := make([]string, 0, 5)
	if p.Scope != "" {
		parts = append(parts, promptProviderScopeLabel(p.Scope))
	}
	profiles := sortedPromptProfiles(p.Profiles)
	if len(profiles) > 0 {
		parts = append(parts, pluralizeCount(len(profiles), "profile"))
	}
	if p.DefaultProfile != "" {
		if strings.EqualFold(strings.TrimSpace(p.DefaultProfile), "default") {
			parts = append(parts, "default profile")
		} else {
			parts = append(parts, "default profile "+p.DefaultProfile)
		}
	}
	if len(p.ValidationErrors) > 0 {
		parts = append(parts, pluralizeCount(len(p.ValidationErrors), "validation issue"))
	}
	if len(parts) == 0 {
		return "runtime prompt"
	}
	return textutil.Truncate(strings.Join(parts, " · "), 96)
}

func stripPromptRowPrefix(title string) string {
	title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(title), "Prompt · "))
	for {
		trimmed := strings.TrimSpace(title)
		next := trimmed
		for _, prefix := range []string{"└─", "├─", "─"} {
			if strings.HasPrefix(trimmed, prefix) {
				next = strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
				break
			}
		}
		if next == trimmed {
			return trimmed
		}
		title = next
	}
}

func sortedPromptProfiles(profiles map[string]gact.PromptProfile) []string {
	names := make([]string, 0, len(profiles))
	for name := range profiles {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func promptProfileDescription(name string, p gact.PromptProfile, isDefault bool) string {
	parts := make([]string, 0, 5)
	if isDefault {
		parts = append(parts, "current default")
	}
	if scope := firstNonEmpty(p.Scope, ""); scope != "" {
		parts = append(parts, scope+" profile")
	}
	if p.Provider != "" {
		parts = append(parts, "provider: "+p.Provider)
	}
	if p.Model != "" {
		parts = append(parts, "model: "+p.Model)
	}
	if p.SourcePath != "" {
		parts = append(parts, "source: "+shortPathLabel(p.SourcePath))
	}
	if len(parts) == 0 {
		parts = append(parts, firstNonEmpty(compactCatalogText(p.Text), name+" profile"))
	}
	return strings.Join(parts, " · ")
}

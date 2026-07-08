package ui

// catalog_agents_hierarchy.go builds the hierarchical (tree-prefixed) agent catalog item listing.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentCatalogItems(agents []gact.AgentDef, kind catalogBrowserKind) []catalogItem {
	filtered := make([]gact.AgentDef, 0, len(agents))
	for _, agent := range agents {
		if kind == catalogKindSkills && agent.Source != "skill" {
			continue
		}
		if kind == catalogKindAgents && agent.Source == "skill" {
			continue
		}
		filtered = append(filtered, agent)
	}
	if kind != catalogKindAgents {
		items := make([]catalogItem, 0, len(filtered))
		for _, agent := range filtered {
			items = append(items, agentCatalogItem(agent, agents, 0))
		}
		return items
	}

	return hierarchicalAgentCatalogItems(filtered, agents)
}

func hierarchicalAgentCatalogItems(filtered []gact.AgentDef, allAgents []gact.AgentDef) []catalogItem {
	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range filtered {
		parent := agentParentID(agent)
		if parent == "" {
			topLevel = append(topLevel, agent)
			continue
		}
		byParent[parent] = append(byParent[parent], agent)
	}
	sortAgentsForCatalog(topLevel)
	for parent := range byParent {
		sortAgentsForCatalog(byParent[parent])
	}

	items := make([]catalogItem, 0, len(filtered))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int, string)
	appendAgent = func(agent gact.AgentDef, depth int, path string) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		items = append(items, agentCatalogHierarchyItem(agent, allAgents, depth, path))
		children := byParent[agent.ID]
		for idx, child := range children {
			childPath := itoa2(idx + 1)
			if path != "" {
				childPath = path + "." + childPath
			}
			appendAgent(child, depth+1, childPath)
		}
	}
	for idx, agent := range topLevel {
		appendAgent(agent, 0, itoa2(idx+1))
	}
	for idx, agent := range filtered {
		appendAgent(agent, 0, "u"+itoa2(idx+1))
	}
	return items
}

func agentCatalogHierarchyItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int, path string) catalogItem {
	item := agentCatalogItem(agent, allAgents, depth)
	item.title = agentHierarchyTitle(item.title, depth, path)
	item.desc = prependCatalogDetailSummary(agentHierarchyInlineSummary(depth, path), stripLeadingAgentTierSummary(item.desc))
	item.inlineDesc = prependCatalogInlineSummary(agentHierarchyInlineSummary(depth, path), item.inlineDesc)
	return item
}

func agentHierarchyTitle(title string, depth int, path string) string {
	prefixLen := len(title) - len(strings.TrimLeft(title, " "))
	prefix := title[:prefixLen]
	trimmed := strings.TrimLeft(title, " ")
	if strings.HasPrefix(trimmed, "└─ ") {
		return prefix + "└─ " + strings.TrimSpace(strings.TrimPrefix(trimmed, "└─ "))
	}
	if depth <= 0 {
		return strings.TrimSpace(title)
	}
	return prefix + strings.TrimSpace(trimmed)
}

func agentHierarchyInlineSummary(depth int, path string) string {
	return "tier " + itoa2(depth+1)
}

func agentTreePrefix(depth int) string {
	if depth <= 0 {
		return ""
	}
	if depth == 1 {
		return "└─ "
	}
	return strings.Repeat("│   ", depth-1) + "└─ "
}

func prependCatalogInlineSummary(prefix, text string) string {
	prefix = strings.TrimSpace(prefix)
	text = strings.TrimSpace(text)
	if prefix == "" {
		return text
	}
	if text == "" {
		return prefix
	}
	if strings.Contains(text, prefix) {
		return text
	}
	return textutil.Truncate(prefix+" · "+text, 96)
}

func prependCatalogDetailSummary(prefix, text string) string {
	prefix = strings.TrimSpace(prefix)
	text = strings.TrimSpace(text)
	if prefix == "" {
		return text
	}
	if text == "" {
		return prefix
	}
	if strings.Contains(text, prefix) {
		return text
	}
	return prefix + " · " + text
}

func stripLeadingAgentTierSummary(text string) string {
	parts := strings.Split(valuefmt.CompactCatalogText(text), " · ")
	if len(parts) == 0 {
		return ""
	}
	if strings.HasPrefix(parts[0], "tier ") {
		parts = parts[1:]
	}
	return strings.Join(parts, " · ")
}

package ui

// agent_hierarchy_rows.go builds the visible agent-hierarchy rows and their per-row labels/metadata.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type agentHierarchyRow struct {
	agent gact.AgentDef
	depth int
	path  string
}

func (c *agentComponent) visibleAgentHierarchyRows() []agentHierarchyRow {
	agents := make([]gact.AgentDef, 0, len(c.hierarchyAgents))
	hasWorkflowAgents := false
	for _, agent := range c.hierarchyAgents {
		if agent.Source == "skill" {
			continue
		}
		if isWorkflowAgent(agent) {
			hasWorkflowAgents = true
		}
		agents = append(agents, agent)
	}
	if hasWorkflowAgents {
		filtered := agents[:0]
		for _, agent := range agents {
			if isWorkflowAgent(agent) {
				filtered = append(filtered, agent)
			}
		}
		agents = filtered
	}
	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range agents {
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
	rows := make([]agentHierarchyRow, 0, len(agents))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int, string)
	appendAgent = func(agent gact.AgentDef, depth int, path string) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		rows = append(rows, agentHierarchyRow{agent: agent, depth: depth, path: path})
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
	for idx, agent := range agents {
		appendAgent(agent, 0, "u"+itoa2(idx+1))
	}
	return rows
}

func isWorkflowAgent(agent gact.AgentDef) bool {
	return strings.TrimSpace(agent.Source) == "agent_blueprint" ||
		strings.EqualFold(strings.TrimSpace(agent.Specialization), "workflow")
}

func agentHierarchyRowMeta(row agentHierarchyRow, runtimeState agentHierarchyRuntimeState) string {
	agent := row.agent
	parts := make([]string, 0, 4)
	state := valuefmt.FirstNonEmpty(string(runtimeState), valuefmt.HumanizeAgentLabel(agent.Specialization), agentHierarchySourceLabel(agent.Source))
	if runtimeState == agentHierarchyStateNone && state != "" {
		parts = append(parts, state)
	}
	if strings.TrimSpace(row.path) == "" && agent.Tier > 0 {
		parts = append(parts, fmt.Sprintf("T%d", agent.Tier))
	}
	if runtimeState != agentHierarchyStateNone && state != "" {
		parts = append(parts, state)
	}
	if len(agent.Skills) > 0 {
		parts = append(parts, "skills: "+strings.Join(limitStrings(agent.Skills, 2), ", "))
	}
	if len(agent.ValidationWarnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(agent.ValidationWarnings, "; "))
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(agent.ValidationErrors, "; "))
	}
	return strings.Join(parts, " · ")
}

func agentHierarchyIndexLabel(row agentHierarchyRow) string {
	path := strings.TrimSpace(row.path)
	if path == "" {
		return ""
	}
	return fmt.Sprintf("%s %s", agentHierarchyTierLabel(row), path)
}

func agentHierarchyTierLabel(row agentHierarchyRow) string {
	tier := row.depth + 1
	if row.agent.Tier > tier {
		tier = row.agent.Tier
	}
	return fmt.Sprintf("T%d", tier)
}

func agentHierarchySourceLabel(source string) string {
	source = strings.TrimSpace(source)
	switch source {
	case "agent_blueprint":
		return "workflow"
	case "builtin":
		return "built-in"
	case "":
		return ""
	default:
		return valuefmt.HumanizeAgentLabel(source)
	}
}

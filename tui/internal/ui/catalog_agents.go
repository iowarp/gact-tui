package ui

// catalog_agents.go builds agent catalog items with summaries, descriptions, sorting, and child/tool resolution.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentCatalogItem(agent gact.AgentDef, allAgents []gact.AgentDef, depth int) catalogItem {
	title := operatorAgentTitle(agent)
	if depth > 0 {
		title = agentTreePrefix(depth) + title
	}
	status := valuefmt.FirstNonEmpty(agent.Source, "agent")
	if !agent.Enabled || len(agent.ValidationErrors) > 0 {
		status = "invalid"
	} else if len(agent.ValidationWarnings) > 0 {
		status = "warning"
	} else if agent.Source == "skill" && len(agent.Tools) > 0 {
		status = valuefmt.PluralizeCount(len(agent.Tools), "tool")
	} else {
		status = operatorSourceValueLabel(status)
	}
	return catalogItem{
		id:         agent.ID,
		title:      title,
		desc:       agentCatalogDescription(agent, allAgents),
		inlineDesc: agentCatalogInlineSummary(agent, allAgents),
		statusTag:  status,
	}
}

func agentCatalogInlineSummary(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 5)
	if agent.Source == "skill" {
		if desc := valuefmt.CompactCatalogText(agent.Description); desc != "" {
			parts = append(parts, desc)
		}
	}
	if agent.Specialization != "" {
		parts = append(parts, valuefmt.HumanizeAgentLabel(agent.Specialization))
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "reports to "+agentTitleByID(allAgents, parent))
	}
	if len(agent.Tools) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(agent.Tools), "tool"))
	}
	if len(agent.Skills) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(agent.Skills), "skill"))
	}
	if len(agent.Commands) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(agent.Commands), "command"))
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(agent.ValidationErrors), "error"))
	} else if len(agent.ValidationWarnings) > 0 {
		parts = append(parts, valuefmt.PluralizeCount(len(agent.ValidationWarnings), "warning"))
	}
	if len(parts) == 0 {
		if desc := valuefmt.CompactCatalogText(agent.Description); desc != "" {
			parts = append(parts, desc)
		}
	}
	return textutil.Truncate(strings.Join(parts, " · "), 96)
}

func agentCatalogDescription(agent gact.AgentDef, allAgents []gact.AgentDef) string {
	parts := make([]string, 0, 6)
	if agent.Tier > 0 {
		parts = append(parts, "tier "+itoa2(agent.Tier))
	}
	if agent.Specialization != "" {
		parts = append(parts, "role "+valuefmt.HumanizeAgentLabel(agent.Specialization))
	}
	if parent := agentParentID(agent); parent != "" {
		parts = append(parts, "reports to "+agentTitleByID(allAgents, parent))
	}
	if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
		parts = append(parts, "routes: "+strings.Join(routes, ", "))
	}
	if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
		parts = append(parts, "delegates: "+strings.Join(delegates, ", "))
	}
	if len(agent.Tools) > 0 {
		toolSummary := strings.Join(agent.Tools, ", ")
		if len(agent.Tools) > 3 {
			toolSummary = strings.Join(agent.Tools[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Tools)-3)
		}
		parts = append(parts, "tools: "+toolSummary)
	}
	if len(agent.Skills) > 0 {
		skillSummary := strings.Join(agent.Skills, ", ")
		if len(agent.Skills) > 3 {
			skillSummary = strings.Join(agent.Skills[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Skills)-3)
		}
		parts = append(parts, "skills: "+skillSummary)
	}
	if len(agent.Commands) > 0 {
		commandSummary := strings.Join(agent.Commands, ", ")
		if len(agent.Commands) > 3 {
			commandSummary = strings.Join(agent.Commands[:3], ", ") + fmt.Sprintf(", +%d", len(agent.Commands)-3)
		}
		parts = append(parts, "commands exposed: "+commandSummary)
	}
	if len(agent.ValidationErrors) > 0 {
		parts = append(parts, "errors: "+strings.Join(agent.ValidationErrors, "; "))
	}
	if len(agent.ValidationWarnings) > 0 {
		parts = append(parts, "warnings: "+strings.Join(agent.ValidationWarnings, "; "))
	}
	if agent.DefaultModel != nil && agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	} else if valuefmt.FirstNonEmpty(agent.DefaultModelName, agent.DefaultProvider) != "" {
		parts = append(parts, "model: "+valuefmt.FirstNonEmpty(agent.DefaultModelName, agent.DefaultProvider))
	}
	if desc := valuefmt.CompactCatalogText(agent.Description); desc != "" {
		parts = append(parts, desc)
	}
	return strings.Join(parts, " · ")
}

func sortAgentsForCatalog(agents []gact.AgentDef) {
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].Tier != agents[j].Tier {
			if agents[i].Tier == 0 {
				return false
			}
			if agents[j].Tier == 0 {
				return true
			}
			return agents[i].Tier < agents[j].Tier
		}
		return valuefmt.FirstNonEmpty(agents[i].Title, agents[i].ID) < valuefmt.FirstNonEmpty(agents[j].Title, agents[j].ID)
	})
}

func childAgentsOf(agents []gact.AgentDef, parentID string) []gact.AgentDef {
	out := make([]gact.AgentDef, 0)
	for _, agent := range agents {
		if agent.ID == parentID {
			continue
		}
		if agentParentID(agent) == parentID {
			out = append(out, agent)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return valuefmt.FirstNonEmpty(out[i].Title, out[i].ID) < valuefmt.FirstNonEmpty(out[j].Title, out[j].ID)
	})
	return out
}

func toolsForAgent(agent gact.AgentDef, tools []gact.Tool) []gact.Tool {
	declared := map[string]bool{}
	for _, toolID := range agent.Tools {
		declared[toolID] = true
	}
	out := make([]gact.Tool, 0)
	seen := map[string]bool{}
	for _, tool := range tools {
		toolID := valuefmt.FirstNonEmpty(tool.ID, tool.Name)
		if toolID == "" || seen[toolID] {
			continue
		}
		if declared[toolID] || stringInSlice(tool.VisibleTo, agent.ID) {
			out = append(out, tool)
			seen[toolID] = true
		}
	}
	if len(out) == 0 && len(declared) > 0 {
		for _, toolID := range agent.Tools {
			if toolID != "" && !seen[toolID] {
				out = append(out, gact.Tool{ID: toolID, Name: toolID})
				seen[toolID] = true
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return valuefmt.FirstNonEmpty(out[i].Name, out[i].ID) < valuefmt.FirstNonEmpty(out[j].Name, out[j].ID)
	})
	return out
}

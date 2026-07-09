package ui

// catalog_browser_agent_detail_load.go issues the command that loads a single agent's detail for the catalog browser.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func loadAgentDetailCmd(c *client.Client, agentID string, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.GetAgentScoped(ctx, agentID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{
				kind: catalogKindAgentDetail, errText: err.Error(), mcpServerID: agentID,
			}
		}
		allAgents, _ := c.ListAgentsScoped(ctx, scope)
		allTools, _ := c.ListTools(ctx)
		plannerCommands, _ := c.ListCommandsScoped(ctx, client.CommandFilter{
			RuntimeScope: scope,
			AgentID:      agent.ID,
			Planner:      true,
		})
		visibleTools := toolsForAgent(agent, allTools)
		items := []catalogItem{{
			id:        "agent/" + agent.ID,
			title:     "Expert · " + operatorAgentTitle(agent),
			desc:      agent.Description,
			statusTag: agent.Source,
		}}
		if parent := agentParentID(agent); parent != "" {
			items = append(items, catalogItem{
				id: "agent/" + parent, title: "Reports to · " + agentTitleByID(allAgents, parent),
			})
		}
		for _, child := range childAgentsOf(allAgents, agent.ID) {
			items = append(items, catalogItem{
				id: "agent/" + child.ID, title: "Delegates to · " + operatorAgentTitle(child), desc: child.Description, statusTag: child.Source,
			})
		}
		if agent.Specialization != "" {
			items = append(items, catalogItem{
				id: "specialization", title: "Specialization · " + agent.Specialization,
			})
		}
		items = append(items, catalogItem{
			id: "model", title: "Model · default", desc: agentModelText(agent),
		})
		if text := compactJSONDescription(agent.Module); text != "" {
			items = append(items, catalogItem{
				id: "dspy-module", title: "DSPy module", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.Signature); text != "" {
			items = append(items, catalogItem{
				id: "dspy-signature", title: "DSPy signature", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.StructuredOutputs); text != "" {
			items = append(items, catalogItem{
				id: "structured-outputs", title: "Structured outputs", desc: text, statusTag: "dspy",
			})
		}
		if text := compactJSONDescription(agent.Fanout); text != "" {
			items = append(items, catalogItem{
				id: "fanout", title: "Fanout", desc: text, statusTag: "dspy",
			})
		}
		for _, ref := range agent.CapabilityRefs {
			title := valuefmt.FirstNonEmpty(ref.Title, ref.ID)
			items = append(items, catalogItem{
				id:        "capability/" + ref.Kind + "/" + ref.ID,
				title:     "Capability · " + title,
				desc:      agentCapabilityRefDescription(ref),
				statusTag: valuefmt.FirstNonEmpty(ref.Status, ref.Kind),
			})
		}
		if routes := stringListFromMetadata(agent.Metadata, "routes_to"); len(routes) > 0 {
			items = append(items, catalogItem{
				id: "routes", title: "Routes to", desc: strings.Join(routes, ", "),
			})
		}
		if delegates := stringListFromMetadata(agent.Metadata, "delegates_to"); len(delegates) > 0 {
			items = append(items, catalogItem{
				id: "delegates", title: "Delegates to", desc: strings.Join(delegates, ", "),
			})
		}
		if len(agent.Skills) > 0 {
			items = append(items, catalogItem{
				id:        "skills",
				title:     "Declared skills",
				desc:      strings.Join(agent.Skills, ", "),
				statusTag: "skills",
			})
		}
		if len(agent.ValidationWarnings) > 0 {
			items = append(items, catalogItem{
				id:        "validation-warnings",
				title:     "Validation warnings",
				desc:      strings.Join(agent.ValidationWarnings, "; "),
				statusTag: "warning",
			})
		}
		if len(agent.Keywords) > 0 {
			items = append(items, catalogItem{
				id: "keywords", title: "Routing keywords", desc: strings.Join(agent.Keywords, ", "),
			})
		}
		if len(agent.ValidationErrors) > 0 {
			items = append(items, catalogItem{
				id:        "validation",
				title:     "Validation errors",
				desc:      strings.Join(agent.ValidationErrors, "; "),
				statusTag: "error",
			})
		}
		if desc := agentPromptResolutionDescription(agent); desc != "" {
			items = append(items, catalogItem{
				id: "prompt-resolution", title: "Prompt provenance", desc: desc,
			})
		}
		if len(plannerCommands) > 0 {
			for _, command := range plannerCommands {
				items = append(items, catalogItem{
					id:        "command/" + command.ID,
					title:     "Planner command · " + valuefmt.FirstNonEmpty(command.Title, command.ID),
					desc:      paletteCommandSubtitle(command),
					statusTag: valuefmt.FirstNonEmpty(command.CommandSource, command.Source, "command"),
				})
			}
		}
		if len(visibleTools) == 0 {
			items = append(items, catalogItem{id: "tools/none", title: "Can use · none declared"})
		} else {
			for _, tool := range visibleTools {
				toolID := valuefmt.FirstNonEmpty(tool.ID, tool.Name)
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Can use · " + valuefmt.FirstNonEmpty(tool.Name, toolID),
					desc:      toolSummary(tool),
					statusTag: tool.Owner,
				})
			}
			for _, server := range mcpServersForTools(visibleTools) {
				items = append(items, catalogItem{
					id:    "mcpserver/" + server,
					title: "MCP connection · " + server,
					desc:  "connection that provides visible tools",
				})
			}
		}
		if agent.SystemPrompt != "" {
			items = append(items, catalogItem{id: "prompt", title: "Prompt", desc: agent.SystemPrompt})
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindAgentDetail, items: items, mcpServerID: agentID,
		}
	}
}

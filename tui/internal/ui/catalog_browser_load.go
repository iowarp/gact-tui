package ui

// catalog_browser_load.go issues the command that loads catalog-browser contents for a given kind.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// loadCatalogBrowserCmd dispatches the right fetch based on kind.
func loadCatalogBrowserCmd(c *client.Client, kind catalogBrowserKind, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		switch kind {
		case catalogKindMcp:
			servers, err := c.ListMcpServers(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			handshake, _ := c.McpHandshake(ctx, scope)
			servers = annotateMcpServersWithHandshake(servers, handshake)
			items := make([]catalogItem, 0, len(servers))
			for _, s := range servers {
				items = append(items, catalogItem{
					id:         s.ID,
					title:      firstNonEmpty(s.Name, s.ID),
					desc:       mcpServerCatalogDescription(s),
					inlineDesc: mcpSourceInlineSummary(s, 0),
					statusTag:  mcpConnectionStatusTag(s),
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindTools:
			tools, err := c.ListTools(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			servers, _ := c.ListMcpServers(ctx)
			handshake, _ := c.McpHandshake(ctx, scope)
			servers = annotateMcpServersWithHandshake(servers, handshake)
			items := toolCatalogItems(tools, servers)
			if len(items) == 0 {
				items = append(items, catalogItem{
					id:         "none",
					title:      "No callable actions available",
					desc:       "Add an MCP connection, enable a workflow blueprint, or check integration health if actions were expected.",
					inlineDesc: "add connection or blueprint",
					statusTag:  "empty",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindAgents, catalogKindSkills:
			// Skills are represented by skill-backed agents in the backend,
			// but the catalog copy below keeps that implementation detail out
			// of the operator-facing empty state.
			agents, err := c.ListAgentsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := agentCatalogItems(agents, kind)
			if len(items) == 0 && kind == catalogKindAgents {
				items = append(items, catalogItem{
					id:        "none",
					title:     "(no agents on this server)",
					desc:      "press c to create one when agent_write is available",
					statusTag: "empty",
					disabled:  true,
				})
			}
			if len(items) == 0 && kind == catalogKindSkills {
				items = append(items, catalogItem{
					id:        "none",
					title:     "No skills available",
					desc:      "Install or activate an agent blueprint that includes skills, then reopen this view.",
					statusTag: "empty",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindPrompts:
			prompts, err := c.ListPromptsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := promptCatalogItems(prompts, scope)
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindExpertPacks:
			packs, err := c.ListExpertPacks(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: expertPackCatalogItems(packs)}
		case catalogKindAgentBlueprints:
			blueprints, err := c.ListAgentBlueprints(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: agentBlueprintCatalogItems(blueprints)}
		case catalogKindAgentBlueprintSources:
			sources, err := c.ListAgentBlueprintSources(ctx)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			return catalogBrowserLoadedMsg{kind: kind, items: agentBlueprintSourceRegistryItems(sources)}
		}
		return catalogBrowserLoadedMsg{kind: kind, errText: "unknown catalog kind"}
	}
}

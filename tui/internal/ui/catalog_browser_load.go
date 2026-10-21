package ui

// catalog_browser_load.go issues the command that loads catalog-browser contents for a given kind.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
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
					title:      valuefmt.FirstNonEmpty(s.Name, s.ID),
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
					desc:       "Add an MCP connection, add a plugin to the conversation agent, or check integration health if actions were expected.",
					inlineDesc: "add connection or plugin",
					statusTag:  "empty",
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindAgents:
			agents, err := c.ListAgentsScoped(ctx, scope)
			if err != nil {
				return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
			}
			items := agentCatalogItems(agents, kind)
			if len(items) == 0 {
				items = append(items, catalogItem{
					id:        "none",
					title:     "(no agents on this server)",
					desc:      "install a marketplace with agents, or save one from the web app's agent view",
					statusTag: "empty",
					disabled:  true,
				})
			}
			return catalogBrowserLoadedMsg{kind: kind, items: items}
		case catalogKindSkills:
			// Skills come from the plugins of the selected session's agent.
			var skills []gact.PluginSkill
			if scope.SessionID != "" {
				var err error
				skills, err = c.SessionAgentSkills(ctx, scope.SessionID)
				if err != nil {
					return catalogBrowserLoadedMsg{kind: kind, errText: err.Error()}
				}
			}
			items := pluginSkillCatalogItems(skills)
			if len(items) == 0 {
				desc := "Add a plugin that brings skills to the agent, then reopen this view."
				if scope.SessionID == "" {
					desc = "Select a session: skills come from its agent. Add a plugin that brings skills to the agent, then reopen this view."
				}
				items = append(items, catalogItem{
					id:        "none",
					title:     "No skills available",
					desc:      desc,
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
		}
		return catalogBrowserLoadedMsg{kind: kind, errText: "unknown catalog kind"}
	}
}

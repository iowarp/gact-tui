package ui

// catalog_browser_mcp.go opens the MCP server detail view and loads MCP server/resource detail.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func loadMcpResourceDetailCmd(c *client.Client, serverID, uri, title string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		contents, err := c.McpResourceRead(ctx, serverID, uri)
		if err != nil {
			return catalogDetailLoadedMsg{title: firstNonEmpty(title, uri), err: err}
		}
		return catalogDetailLoadedMsg{
			title: firstNonEmpty(title, uri),
			text:  formatMcpResourceContents(contents),
		}
	}
}

// openMcpDetail pushes a new browser state showing one server's
// tools+resources+prompts. Called on Enter from the MCP server list
// (LLL2). Preserves the parent so backspace/esc can pop back.
func (c *catalogComponent) openMcpDetail(serverID, serverName string) tea.Cmd {
	parent := c.current
	serverName = mcpDetailDisplayName(serverID, serverName)
	c.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · " + serverName,
		loading:     true,
		mcpServerID: serverID,
		parent:      parent,
	}
	return loadMcpDetailCmd(c.app.c, c.app.session.runtimeScope(), serverID)
}

func mcpDetailDisplayName(serverID, serverName string) string {
	name := strings.TrimSpace(serverName)
	for _, prefix := range []string{"Source · MCP · ", "MCP tools · ", "MCP connection · ", "MCP source · ", "MCP server · ", "MCP · "} {
		name = strings.TrimPrefix(name, prefix)
	}
	return firstNonEmpty(name, serverID)
}

func selectedCatalogMcpServerID(cb *catalogBrowserState) string {
	if cb == nil || cb.sel < 0 || cb.sel >= len(cb.items) {
		return ""
	}
	id := strings.TrimSpace(cb.items[cb.sel].id)
	if !strings.HasPrefix(id, "mcpserver/") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(id, "mcpserver/"))
}

// loadMcpDetailCmd fetches tools, resources, and prompts for one MCP
// server and merges them into one operator-facing capability list.
// Failures per slice are surfaced inline rather than aborting — partial
// data is still useful.
func loadMcpDetailCmd(c *client.Client, scope client.RuntimeScope, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var items []catalogItem
		var errs []string
		agents, _ := c.ListAgentsScoped(ctx, scope)
		servers, _ := c.ListMcpServers(ctx)
		handshake, _ := c.McpHandshake(ctx, scope)
		servers = annotateMcpServersWithHandshake(servers, handshake)
		for _, server := range servers {
			if server.ID == serverID {
				items = append(items, catalogItem{
					id:         "server/" + serverID,
					title:      "Connection overview",
					desc:       formatMcpServerSummary(server),
					inlineDesc: mcpServerDetailInlineSummary(server),
					statusTag:  firstNonEmpty(server.Status, "server"),
				})
				break
			}
		}

		if tools, err := c.McpServerTools(ctx, serverID); err != nil {
			errs = append(errs, "tools: "+err.Error())
		} else {
			for _, t := range tools {
				toolID := firstNonEmpty(t.ID, t.Name)
				desc := mcpDetailToolSummary(t)
				if owners := owningAgentsForTool(t, agents); len(owners) > 0 {
					if desc != "" {
						desc += " · "
					}
					desc += "agents: " + strings.Join(owners, ", ")
				}
				items = append(items, catalogItem{
					id:        "tool/" + toolID,
					title:     "Tool · " + firstNonEmpty(t.Name, toolID),
					desc:      desc,
					statusTag: "tool",
				})
			}
		}
		if rs, err := c.McpServerResources(ctx, serverID); err != nil {
			errs = append(errs, "resources: "+err.Error())
		} else {
			for _, r := range rs {
				name := r.Name
				if name == "" {
					name = r.URI
				}
				desc := r.Description
				if desc == "" {
					desc = r.URI
				} else if r.URI != "" && r.URI != desc {
					desc += " · uri: " + r.URI
				}
				items = append(items, catalogItem{
					id:        "res/" + r.URI,
					title:     "Resource · " + name,
					desc:      desc,
					statusTag: "resource",
				})
			}
		}
		if ps, err := c.McpServerPrompts(ctx, serverID); err != nil {
			errs = append(errs, "prompts: "+err.Error())
		} else {
			for _, p := range ps {
				desc := p.Description
				if desc == "" {
					desc = "prompt template exposed by this MCP connection"
				}
				items = append(items, catalogItem{
					id:        "prompt/" + p.Name,
					title:     "Prompt · " + p.Name,
					desc:      desc,
					statusTag: "prompt",
				})
			}
		}
		errText := ""
		if len(errs) > 0 {
			errText = strings.Join(errs, "; ")
		}
		return catalogBrowserLoadedMsg{
			kind: catalogKindMcpDetail, items: items,
			errText: errText, mcpServerID: serverID,
		}
	}
}

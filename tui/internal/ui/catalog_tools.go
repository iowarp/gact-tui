package ui

// catalog_tools.go builds tool catalog items grouped by source with row titles and summaries.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func toolCatalogItems(tools []gact.Tool, servers []gact.McpServer) []catalogItem {
	sort.SliceStable(tools, func(i, j int) bool {
		if normalizedToolSource(tools[i]) != normalizedToolSource(tools[j]) {
			return normalizedToolSource(tools[i]) < normalizedToolSource(tools[j])
		}
		if tools[i].ServerID != tools[j].ServerID {
			return tools[i].ServerID < tools[j].ServerID
		}
		return firstNonEmpty(tools[i].Name, tools[i].ID) < firstNonEmpty(tools[j].Name, tools[j].ID)
	})
	serverByID := make(map[string]gact.McpServer, len(servers))
	for _, server := range servers {
		if server.ID != "" {
			serverByID[server.ID] = server
		}
	}
	mcpCounts := map[string]int{}
	for _, tool := range tools {
		if normalizedToolSource(tool) == "mcp" && tool.ServerID != "" {
			mcpCounts[tool.ServerID]++
		}
	}
	mcpSeen := map[string]int{}
	sourceCounts := map[string]int{}
	for _, tool := range tools {
		src := normalizedToolSource(tool)
		if src == "mcp" && tool.ServerID != "" {
			continue
		}
		sourceCounts[src]++
	}
	sourceSeen := map[string]int{}
	items := make([]catalogItem, 0, len(tools)+len(mcpCounts)+len(sourceCounts))
	for _, tool := range tools {
		src := normalizedToolSource(tool)
		if src == "mcp" && tool.ServerID != "" {
			if mcpSeen[tool.ServerID] == 0 {
				server, ok := serverByID[tool.ServerID]
				title := toolCatalogSourceRowTitle(tool.ServerID, "MCP connection")
				status := "mcp"
				desc := fmt.Sprintf("%d callable tool%s from this connection", mcpCounts[tool.ServerID], plural(mcpCounts[tool.ServerID]))
				inlineDesc := desc
				if ok {
					title = toolCatalogSourceRowTitle(firstNonEmpty(server.Name, server.ID), "MCP connection")
					status = mcpConnectionStatusTag(server)
					desc = mcpServerCatalogDescription(server)
					inlineDesc = mcpSourceInlineSummary(server, mcpCounts[tool.ServerID])
				}
				items = append(items, catalogItem{
					id:         "mcpserver/" + tool.ServerID,
					title:      title,
					desc:       desc,
					inlineDesc: inlineDesc,
					statusTag:  status,
				})
			}
			mcpSeen[tool.ServerID]++
		} else if sourceSeen[src] == 0 {
			items = append(items, catalogItem{
				id:         "toolsource/" + catalogToolSourceID(src),
				title:      toolCatalogSourceRowTitleForSource(src),
				desc:       toolCatalogSourceDescription(src, sourceCounts[src]),
				inlineDesc: pluralizeCount(sourceCounts[src], "tool"),
			})
		}
		sourceSeen[src]++
		status := src
		if tool.ServerID != "" {
			status = tool.ServerID
		}
		title := toolCatalogRowTitle(tool)
		if src == "mcp" && tool.ServerID != "" {
			title = treePrefix(mcpSeen[tool.ServerID]-1, mcpCounts[tool.ServerID]) + title
			status = "mcp"
		} else {
			title = treePrefix(sourceSeen[src]-1, sourceCounts[src]) + title
		}
		items = append(items, catalogItem{
			id:         firstNonEmpty(tool.ID, tool.Name),
			title:      title,
			desc:       toolCatalogDescription(tool),
			inlineDesc: toolCatalogInlineSummary(tool),
			statusTag:  status,
		})
	}
	for _, server := range servers {
		if server.ID == "" || mcpSeen[server.ID] > 0 {
			continue
		}
		items = append(items, catalogItem{
			id:         "mcpserver/" + server.ID,
			title:      toolCatalogSourceRowTitle(firstNonEmpty(server.Name, server.ID), "MCP connection"),
			desc:       mcpServerCatalogDescription(server),
			inlineDesc: mcpSourceInlineSummary(server, 0),
			statusTag:  mcpConnectionStatusTag(server),
		})
	}
	return items
}

func catalogToolSourceID(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))
	if source == "" {
		return "unknown"
	}
	source = strings.NewReplacer("/", "-", "\\", "-", " ", "-", "_", "-").Replace(source)
	return source
}

func toolCatalogSourceLabel(source string) string {
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "builtin":
		return "Built-in"
	case "recipe":
		return "Recipes"
	case "extension":
		return "Extensions"
	case "mcp":
		return "MCP"
	case "":
		return "Unknown"
	default:
		return humanizeAgentLabel(source)
	}
}

func toolCatalogSourceDescription(source string, count int) string {
	label := toolCatalogSourceLabel(source)
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "recipe", "extension":
		return fmt.Sprintf("%s provide %s.", label, pluralizeCount(count, "tool"))
	default:
		return fmt.Sprintf("%s provides %s.", label, pluralizeCount(count, "tool"))
	}
}

func toolCatalogRowTitle(tool gact.Tool) string {
	name := firstNonEmpty(tool.Name, tool.ID)
	switch normalizedToolSource(tool) {
	case "builtin":
		return toolCatalogToolRowTitle(name, "built-in")
	case "recipe":
		return toolCatalogToolRowTitle(name, "recipe")
	case "extension":
		return toolCatalogToolRowTitle(name, "extension")
	case "mcp":
		return toolCatalogToolRowTitle(name, firstNonEmpty(tool.ServerID, "MCP"))
	default:
		source := strings.TrimSpace(normalizedToolSource(tool))
		if source == "" {
			return toolCatalogToolRowTitle(name, "unknown")
		}
		return toolCatalogToolRowTitle(name, source)
	}
}

func toolCatalogSourceRowTitle(name, kind string) string {
	label := firstNonEmpty(kind, "source")
	return label + " · " + firstNonEmpty(name, "unknown")
}

func toolCatalogSourceRowTitleForSource(source string) string {
	switch normalizedToolSource(gact.Tool{Source: source}) {
	case "builtin":
		return "Built-in tools"
	case "recipe":
		return "Recipe tools"
	case "extension":
		return "Extension tools"
	case "":
		return "Unknown tools"
	default:
		return humanizeAgentLabel(source) + " tools"
	}
}

func toolCatalogToolRowTitle(name, origin string) string {
	return firstNonEmpty(name, "unknown")
}

func normalizedToolSource(tool gact.Tool) string {
	return firstNonEmpty(tool.Source, "builtin")
}

func toolCatalogInlineSummary(tool gact.Tool) string {
	parts := toolCatalogMetadata(tool)
	return textutil.Truncate(strings.Join(parts, " · "), 88)
}

func toolCatalogDescription(tool gact.Tool) string {
	parts := toolCatalogMetadata(tool)
	return textutil.Truncate(strings.Join(parts, " · "), 88)
}

func stringInSlice(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

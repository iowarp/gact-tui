package ui

// catalog_browser_mcp_summary.go formats MCP server summaries, health, and capability labels for the catalog.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func formatMcpServerSummary(server gact.McpServer) string {
	capabilities := detailedMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(capabilities) == 0 {
		capabilities = append(capabilities, "none advertised")
	}
	displayName := firstNonEmpty(server.Name, server.ID)
	status := strings.TrimSpace(server.Status)
	if status == "" {
		status = "unknown"
	}
	rows := appendDetailSection(nil, "Operator summary",
		detailField{"connection", displayName},
		detailField{"status", status},
		detailField{"live health", mcpLiveHealthSummary(server)},
		detailField{"provides", strings.Join(capabilities, ", ")},
		detailField{"manage", "open /mcp to add, reconnect, or remove this connection"},
		detailField{"tool access", "open /tools to see callable actions from eligible connections and workflows"},
		detailField{"resources and prompts", "listed below when this connection exposes them"},
	)
	if server.Instructions != "" {
		rows = appendDetailSection(rows, "How to use it", detailField{"", server.Instructions})
	}
	if server.LastError != "" {
		rows = appendDetailSection(rows, "Connection error", detailField{"", server.LastError})
	}
	rows = appendDetailSection(rows, "Technical details",
		detailField{"id", server.ID},
		detailField{"status", server.Status},
		detailField{"transport", server.Transport},
		detailField{"MCP protocol", server.ProtocolVersion},
		detailField{"version", server.Version},
		detailField{"live tools", stringValue(server.ServerInfo["live_tools_count"])},
		detailField{"live latency", stringValue(server.ServerInfo["live_latency_ms"])},
	)
	if len(server.ServerInfo) > 0 {
		if summary := contextMapSummary(server.ServerInfo, "name", "version", "title"); summary != "" {
			rows = append(rows, detailFieldRows("server", summary)...)
		}
	}
	return strings.Join(rows, "\n")
}

func mcpLiveHealthSummary(server gact.McpServer) string {
	live, ok := server.ServerInfo["live_reachable"].(bool)
	if !ok {
		return ""
	}
	if live {
		return "reachable"
	}
	if server.LastError != "" {
		return "unreachable: " + compactCatalogText(server.LastError)
	}
	return "unreachable"
}

func mcpServerDetailInlineSummary(server gact.McpServer) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		parts = append(parts, server.Status)
	}
	if server.Transport != "" {
		parts = append(parts, server.Transport)
	}
	caps := compactMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(caps) > 0 {
		parts = append(parts, strings.Join(caps, ", "))
	}
	if server.LastError != "" {
		parts = append(parts, "error "+compactCatalogText(server.LastError))
	}
	if len(parts) == 0 {
		return "MCP connection overview"
	}
	return strings.Join(parts, " · ")
}

func detailedMcpCapabilityLabels(cap gact.McpCapabilities) []string {
	labels := make([]string, 0, 4)
	if cap.Tools {
		labels = append(labels, "callable tools")
	}
	if cap.Resources != nil {
		resource := "resources"
		flags := []string{}
		if cap.Resources.Subscribe {
			flags = append(flags, "subscribe")
		}
		if cap.Resources.ListChanged {
			flags = append(flags, "list changes")
		}
		if len(flags) > 0 {
			resource += " (" + strings.Join(flags, ", ") + ")"
		}
		labels = append(labels, resource)
	}
	if cap.Prompts != nil {
		prompt := "prompts"
		if cap.Prompts.ListChanged {
			prompt += " (list changes)"
		}
		labels = append(labels, prompt)
	}
	if cap.Logging && len(labels) == 0 {
		labels = append(labels, "logging")
	}
	return labels
}

func mcpServerCatalogDescription(server gact.McpServer) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		parts = append(parts, server.Status)
	}
	if server.ProtocolVersion != "" {
		parts = append(parts, "MCP "+server.ProtocolVersion)
	}
	if live, ok := server.ServerInfo["live_reachable"].(bool); ok {
		if live {
			parts = append(parts, "live reachable")
		} else {
			parts = append(parts, "live unreachable")
		}
	}
	caps := compactMcpCapabilityLabels(server.DeclaredCapabilities)
	if len(caps) > 0 {
		parts = append(parts, "offers "+strings.Join(caps, ", "))
	}
	if server.LastError != "" {
		parts = append(parts, "needs attention: "+compactCatalogText(server.LastError))
	}
	if len(parts) == 0 {
		return "no connection metadata"
	}
	return textutil.Truncate(strings.Join(parts, " · "), 96)
}

func compactMcpCapabilityLabels(cap gact.McpCapabilities) []string {
	labels := make([]string, 0, 4)
	if cap.Tools {
		labels = append(labels, "tools")
	}
	if cap.Resources != nil {
		labels = append(labels, "resources")
	}
	if cap.Prompts != nil {
		labels = append(labels, "prompts")
	}
	if cap.Logging && len(labels) == 0 {
		labels = append(labels, "logging")
	}
	return labels
}

package ui

// catalog_mcp_support.go provides MCP connection-status and capability helpers shared by the catalog views.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func mcpConnectionStatusTag(server gact.McpServer) string {
	if server.Status == "ready" || server.Status == "connected" {
		return "connected"
	}
	if server.Status != "" {
		return "disconnected"
	}
	return "mcp"
}

func annotateMcpServersWithHandshake(servers []gact.McpServer, handshake client.McpHandshakeResponse) []gact.McpServer {
	if len(servers) == 0 || len(handshake.Servers) == 0 {
		return servers
	}
	byName := map[string]client.McpHandshakeServer{}
	for _, live := range handshake.Servers {
		for _, key := range []string{live.Name, strings.ToLower(live.Name)} {
			key = strings.TrimSpace(key)
			if key != "" {
				byName[key] = live
			}
		}
	}
	out := append([]gact.McpServer(nil), servers...)
	for i := range out {
		live, ok := byName[out[i].ID]
		if !ok {
			live, ok = byName[out[i].Name]
		}
		if !ok {
			live, ok = byName[strings.ToLower(out[i].ID)]
		}
		if !ok {
			live, ok = byName[strings.ToLower(out[i].Name)]
		}
		if !ok {
			continue
		}
		if live.State != "" {
			out[i].Status = live.State
		} else if live.Reachable {
			out[i].Status = "ready"
		} else {
			out[i].Status = "error"
		}
		if !live.Reachable && strings.TrimSpace(live.Error) != "" {
			out[i].LastError = strings.TrimSpace(live.Error)
		}
		if out[i].ServerInfo == nil {
			out[i].ServerInfo = map[string]any{}
		}
		out[i].ServerInfo["live_reachable"] = live.Reachable
		out[i].ServerInfo["live_tools_count"] = live.ToolsCount
		if live.LatencyMS > 0 {
			out[i].ServerInfo["live_latency_ms"] = live.LatencyMS
		}
	}
	return out
}

func mcpSourceInlineSummary(server gact.McpServer, toolCount int) string {
	parts := make([]string, 0, 5)
	if server.Status != "" {
		status := server.Status
		if status == "error" {
			status = "disconnected"
		}
		parts = append(parts, status)
	}
	if live, ok := server.ServerInfo["live_reachable"].(bool); ok {
		if live {
			parts = append(parts, "live")
		} else {
			parts = append(parts, "unreachable")
		}
	}
	parts = append(parts, mcpCapabilityCountLabels(server.DeclaredCapabilities, toolCount)...)
	if server.LastError != "" {
		parts = append(parts, "repair needed")
	}
	if len(parts) == 0 {
		return "MCP connection"
	}
	return strings.Join(parts, " · ")
}

func mcpCapabilityCountLabels(cap gact.McpCapabilities, toolCount int) []string {
	labels := make([]string, 0, 4)
	if toolCount > 0 {
		labels = append(labels, fmt.Sprintf("%d tool%s", toolCount, plural(toolCount)))
	} else if cap.Tools {
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

func mcpServersForTools(tools []gact.Tool) []string {
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, tool := range tools {
		serverID := strings.TrimSpace(tool.ServerID)
		if serverID == "" || seen[serverID] {
			continue
		}
		seen[serverID] = true
		out = append(out, serverID)
	}
	sort.Strings(out)
	return out
}

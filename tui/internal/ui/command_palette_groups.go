package ui

// command_palette_groups.go classifies palette commands into groups and builds group tabs/headers.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *commandPaletteComponent) groupTabs() []menuTab {
	groups := append([]string{""}, c.availableGroups()...)
	tabs := make([]menuTab, 0, len(groups))
	for _, group := range groups {
		group := group
		label := "All"
		if group != "" {
			label = paletteCommandGroupTabLabel(group)
		}
		tabs = append(tabs, menuTab{
			id:     "palette-group-" + paletteGroupID(group),
			label:  label,
			active: group == c.paletteGroup,
			action: func(app *App) tea.Cmd {
				app.cmdPalette.paletteGroup = group
				app.cmdPalette.paletteSel = 0
				return nil
			},
		})
	}
	return tabs
}

func paletteCommandGroupTabLabel(group string) string {
	switch group {
	case "Runtime":
		return "Runtime"
	case "Prompt Templates":
		return "Prompts"
	case "Workflow Commands":
		return "Workflows"
	case "Extension Commands":
		return "Extensions"
	default:
		return group
	}
}

func (c *commandPaletteComponent) showingGroupOverview() bool {
	return strings.TrimSpace(c.paletteFilter) == "" && c.paletteGroup == "" && len(c.availableGroups()) > 1
}

func (c *commandPaletteComponent) useCommandGrid() bool {
	return strings.TrimSpace(c.paletteFilter) == "" && c.paletteGroup != ""
}

func paletteGroupID(group string) string {
	group = strings.ToLower(strings.TrimSpace(group))
	if group == "" {
		return "all"
	}
	group = strings.NewReplacer(" ", "-", "/", "", "_", "-").Replace(group)
	return group
}

func paletteCommandGroupHeader(group string, count int) string {
	meta := paletteCommandGroupDescription(group)
	if count > 0 {
		group = fmt.Sprintf("%s (%d)", group, count)
	}
	if meta == "" {
		return group
	}
	return group + " - " + meta
}

func paletteCommandGroupDescription(group string) string {
	switch group {
	case "Session":
		return "conversation and input"
	case "Workspace":
		return "files and diffs"
	case "Runtime":
		return "tools, MCP, prompts"
	case "Experts":
		return "expert workflows"
	case "Settings":
		return "runtime preferences"
	case "Diagnostics":
		return "health and telemetry"
	case "Management":
		return "install and remove"
	case "Workflow Commands":
		return "commands from the active workflow"
	case "Extension Commands":
		return "custom backend commands"
	case "Prompt Templates":
		return "MCP-provided commands"
	case "Plugins":
		return "installed plugin commands"
	case "Shortcuts":
		return "typed shortcuts"
	default:
		return ""
	}
}

func paletteCommandGroup(c gact.Command) string {
	id := strings.ToLower(strings.TrimSpace(c.ID))
	if c.Source == "plugin" {
		return "Plugins"
	}
	if c.CommandSource == "agent_blueprint" || c.AgentBlueprintID != "" {
		return "Workflow Commands"
	}
	if paletteCommandAliasTarget(id) != "" {
		return "Shortcuts"
	}
	switch id {
	case "/new", "/duplicate", "/sessions", "/rename", "/clear", "/compact", "/cancel", "/copy", "/mode", "/undo":
		return "Session"
	case "/add", "/drop", "/diff":
		return "Workspace"
	case "/mcp", "/tools", "/prompts":
		return "Runtime"
	case "/skills", "/experts", "/agents-list", "/expert-packs", "/agent-blueprints", "/scenarios":
		return "Experts"
	case "/agent", "/agents", "/model", "/theme", "/theme-export", "/theme-next", "/theme-prev", "/mouse":
		return "Settings"
	case "/memory", "/metrics", "/doctor", "/permissions", "/help":
		return "Diagnostics"
	default:
		if c.CommandSource == "mcp_prompt" || c.Source == "mcp_prompt" || c.Invocation == "mcp_prompt" {
			return "Runtime"
		}
		if strings.Contains(id, "install") || strings.Contains(id, "remove") {
			return "Management"
		}
		return "Extension Commands"
	}
}

func paletteCommandGroupRank(group string) int {
	switch group {
	case "Session":
		return 10
	case "Workspace":
		return 20
	case "Runtime":
		return 30
	case "Experts":
		return 35
	case "Settings":
		return 40
	case "Diagnostics":
		return 50
	case "Management":
		return 60
	case "Workflow Commands":
		return 70
	case "Extension Commands":
		return 75
	case "Prompt Templates":
		return 80
	case "Plugins":
		return 90
	case "Shortcuts":
		return 100
	default:
		return 110
	}
}

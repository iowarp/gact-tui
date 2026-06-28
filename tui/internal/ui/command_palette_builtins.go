package ui

// command_palette_builtins.go defines the built-in palette commands and normalizes backend command copy.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *commandPaletteComponent) builtinCommands() []gact.Command {
	localCmd := func(id, titleKey, descKey string) gact.Command {
		return gact.Command{
			ID:          id,
			Title:       c.app.localizer.t(messageID(titleKey), nil),
			Description: c.app.localizer.t(messageID(descKey), nil),
			Source:      "builtin",
		}
	}
	return []gact.Command{
		localCmd("/metrics", "command.metrics.title", "command.metrics.desc"),
		localCmd("/memory", "command.memory.title", "command.memory.desc"),
		localCmd("/mouse", "command.mouse.title", "command.mouse.desc"),
		{ID: "/permissions", Title: "Permissions", Description: "Review permission requests", Source: "builtin"},
		localCmd("/theme", "command.theme.title", "command.theme.desc"),
		localCmd("/mcp", "command.mcp.title", "command.mcp.desc"),
		localCmd("/tools", "command.tools.title", "command.tools.desc"),
		localCmd("/skills", "command.skills.title", "command.skills.desc"),
		localCmd("/experts", "command.agents.title", "command.agents.desc"),
		localCmd("/mode", "command.mode.title", "command.mode.desc"),
		localCmd("/clear", "command.clear.title", "command.clear.desc"),
		localCmd("/copy", "command.copy.title", "command.copy.desc"),
		localCmd("/diff", "command.diff.title", "command.diff.desc"),
		localCmd("/compact", "command.compact.title", "command.compact.desc"),
		{ID: "/prompts", Title: "Prompts", Description: "Browse prompt profiles", Source: "builtin"},
		{ID: "/expert-packs", Title: "Expert Packs", Description: "Browse expert packs", Source: "builtin"},
		{ID: "/agent-blueprints", Title: "Agent Blueprints", Description: "Manage agent blueprints", Source: "builtin"},
		localCmd("/doctor", "command.doctor.title", "command.doctor.desc"),
	}
}

func (c *commandPaletteComponent) normalizeBuiltinCommandCopy(commands []gact.Command) []gact.Command {
	out := append([]gact.Command(nil), commands...)
	local := func(key string) string {
		return c.app.localizer.t(messageID(key), nil)
	}
	for i := range out {
		switch strings.ToLower(strings.TrimSpace(out[i].ID)) {
		case "/metrics":
			out[i].Title = local("command.metrics.title")
			out[i].Description = local("command.metrics.desc")
		case "/memory":
			out[i].Title = local("command.memory.title")
			out[i].Description = local("command.memory.desc")
		case "/mouse":
			out[i].Title = local("command.mouse.title")
			out[i].Description = local("command.mouse.desc")
		case "/theme":
			out[i].Title = local("command.theme.title")
			out[i].Description = local("command.theme.desc")
		case "/theme-export":
			out[i].Title = local("command.theme_export.title")
			out[i].Description = local("command.theme_export.desc")
		case "/mcp":
			out[i].Title = local("command.mcp.title")
			out[i].Description = local("command.mcp.desc")
		case "/tools":
			out[i].Title = local("command.tools.title")
			out[i].Description = local("command.tools.desc")
		case "/skills":
			out[i].Title = local("command.skills.title")
			out[i].Description = local("command.skills.desc")
		case "/experts":
			out[i].Title = local("command.agents.title")
			out[i].Description = local("command.agents.desc")
		case "/agent", "/agents":
			out[i].Title = local("command.agent.title")
			out[i].Description = local("command.agent.desc")
		case "/agents-list":
			out[i].Title = "Agents list"
			out[i].Description = "Alias for /experts"
		case "/mode":
			out[i].Title = local("command.mode.title")
			out[i].Description = local("command.mode.desc")
		case "/clear":
			out[i].Title = local("command.clear.title")
			out[i].Description = local("command.clear.desc")
		case "/copy":
			out[i].Title = local("command.copy.title")
			out[i].Description = local("command.copy.desc")
		case "/diff":
			out[i].Title = local("command.diff.title")
			out[i].Description = local("command.diff.desc")
		case "/duplicate":
			out[i].Title = "Duplicate session"
			out[i].Description = "Copy title and expert"
		case "/doctor":
			out[i].Title = local("command.doctor.title")
			out[i].Description = local("command.doctor.desc")
		case "/permissions":
			out[i].Title = "Permissions"
			out[i].Description = "Review permission requests"
		case "/prompts":
			out[i].Title = "Prompts"
			out[i].Description = "Browse prompt profiles"
		case "/expert-packs":
			out[i].Title = "Expert Packs"
			out[i].Description = "Browse expert packs"
		case "/agent-blueprints":
			out[i].Title = "Agent Blueprints"
			out[i].Description = "Manage agent blueprints"
		}
	}
	return out
}

package ui

// command_palette_labels.go formats palette command subtitles, source/scope labels, and alias targets.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func paletteCommandSubtitle(c gact.Command) string {
	id := strings.TrimSpace(c.ID)
	title := strings.TrimSpace(c.Title)
	desc := strings.TrimSpace(c.Description)
	if target := paletteCommandAliasTarget(id); target != "" {
		return "alias for " + target
	}
	if c.CommandSource == "mcp_prompt" || c.Source == "mcp_prompt" || c.Invocation == "mcp_prompt" {
		parts := []string{"MCP prompt action"}
		if c.ArgumentHint != "" {
			parts = append(parts, "input "+c.ArgumentHint)
		}
		if c.AgentID != "" {
			parts = append(parts, "expert "+c.AgentID)
		}
		return strings.Join(parts, " · ")
	}
	if c.Status != "" && c.Status != "available" {
		reason := strings.TrimSpace(firstNonEmpty(c.DisabledReason, c.Error))
		if reason != "" {
			return c.Status + " · " + reason
		}
		return c.Status
	}
	policy := make([]string, 0, 8)
	if c.CommandSource == "agent_blueprint" {
		label := "from workflow"
		if c.AgentBlueprintID != "" {
			label += " " + c.AgentBlueprintID
		}
		policy = append(policy, label)
	} else if c.CommandSource != "" && c.CommandSource != c.Source {
		policy = append(policy, operatorCommandSourceLabel(c.CommandSource))
	}
	if c.CommandScope != "" && c.CommandScope != c.CommandSource {
		policy = append(policy, operatorCommandScopeLabel(c.CommandScope))
	}
	if c.UserInvocable != nil {
		if *c.UserInvocable {
			policy = append(policy, "operator command")
		} else {
			policy = append(policy, "not shown to operators")
		}
	}
	if c.AgentID != "" {
		policy = append(policy, "expert "+c.AgentID)
	}
	if c.ArgumentHint != "" {
		policy = append(policy, "input "+c.ArgumentHint)
	}
	if c.CommandSource != "agent_blueprint" {
		if c.AgentInvocable != nil && *c.AgentInvocable {
			policy = append(policy, "agent callable")
		}
		if c.PlannerVisible != nil && *c.PlannerVisible {
			policy = append(policy, "planner visible")
		}
	}
	if len(policy) > 0 {
		return strings.Join(policy, " · ")
	}
	if desc != "" && !samePaletteCommandText(desc, id) && !samePaletteCommandText(desc, title) {
		return desc
	}
	if c.AgentID != "" {
		return "agent: " + c.AgentID
	}
	if title != "" && !samePaletteCommandText(title, id) {
		return title
	}
	if c.Source != "" {
		return c.Source
	}
	return ""
}

func operatorCommandSourceLabel(source string) string {
	source = strings.TrimSpace(source)
	switch source {
	case "agent_blueprint":
		return "from workflow"
	case "mcp_prompt":
		return "from MCP prompt template"
	case "":
		return ""
	default:
		return "from " + strings.ReplaceAll(source, "_", " ")
	}
}

func operatorCommandScopeLabel(scope string) string {
	scope = strings.TrimSpace(scope)
	switch scope {
	case "agent_blueprint":
		return "workflow scoped"
	case "mcp_prompt":
		return "prompt-template scoped"
	case "":
		return ""
	default:
		return strings.ReplaceAll(scope, "_", " ") + " scoped"
	}
}

func samePaletteCommandText(a, b string) bool {
	a = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(a)), "/")
	b = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(b)), "/")
	return a != "" && a == b
}

func paletteCommandAliasTarget(id string) string {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "/blueprints":
		return "/agent-blueprints"
	case "/expertpacks":
		return "/expert-packs"
	case "/agents-list":
		return "/experts"
	default:
		return ""
	}
}

func paletteCommandSecondaryTarget(id string) string {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "/catalog":
		return "/tools"
	case "/theme-export":
		return "/theme"
	default:
		return paletteCommandAliasTarget(id)
	}
}

func shortPathLabel(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	path = strings.ReplaceAll(path, "\\", "/")
	const marker = "/commands/"
	if idx := strings.LastIndex(path, marker); idx >= 0 {
		return "commands/" + strings.TrimPrefix(path[idx+len(marker):], "/")
	}
	if idx := strings.LastIndex(path, "/"); idx >= 0 && idx < len(path)-1 {
		return path[idx+1:]
	}
	return path
}

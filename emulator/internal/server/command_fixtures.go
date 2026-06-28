package server

import (
	"fmt"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func staticLongPaletteCommands() []gact.Command {
	out := make([]gact.Command, 0, 24)
	for i := 1; i <= 24; i++ {
		out = append(out, gact.Command{
			ID:          fmt.Sprintf("/runtime-demo-%02d", i),
			Title:       fmt.Sprintf("Runtime demo action %02d", i),
			Description: "Synthetic runtime command used to exercise palette overflow and scrolling.",
			Source:      "builtin",
		})
	}
	return out
}

func staticAgentBlueprintPackagedCommands(blueprintID string) []gact.Command {
	trueValue := true
	return []gact.Command{{
		ID:                 "/validate-dataset",
		Title:              "Validate Dataset",
		Description:        "Validate a dataset before analysis",
		Source:             "agent_blueprint",
		AgentID:            "data",
		AgentSource:        "agent_blueprint",
		CommandSource:      "agent_blueprint",
		CommandScope:       "agent_blueprint",
		CommandPath:        "/workspace/.clio/agent-blueprints/" + blueprintID + "/commands/validate-dataset.md",
		AgentBlueprintID:   blueprintID,
		AgentBlueprintRoot: "/workspace/.clio/agent-blueprints/" + blueprintID,
		Invocation:         "agent",
		UserInvocable:      &trueValue,
		AgentInvocable:     &trueValue,
		PlannerVisible:     &trueValue,
		ArgumentHint:       "<path>",
		Arguments:          []gact.AgentParameter{{Name: "path", Type: "string", Required: true}},
	}}
}

func staticCommands() []gact.Command {
	trueValue := true
	falseValue := false
	return []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin", Shortcut: "ctrl+l", UserInvocable: &trueValue, AgentInvocable: &falseValue, PlannerVisible: &falseValue},
		{ID: "/cancel", Title: "Cancel current run", Source: "builtin", Shortcut: "ctrl+c"},
		{ID: "/model", Title: "Switch model", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "model_id", Type: "string", Required: true}}},
		{ID: "/agent", Title: "Expert settings", Description: "Pick the session expert", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "agent_id", Type: "string", Required: true}}},
		{ID: "/add", Title: "Add file to context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/drop", Title: "Drop file from context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/undo", Title: "Undo last assistant change", Source: "builtin"},
		{ID: "/help", Title: "Show help", Source: "builtin", Shortcut: "?"},
		{ID: "/mcp", Title: "MCP connections", Description: "Inspect MCP source health, resources, prompts, and management actions", Source: "builtin"},
		{ID: "/tools", Title: "Capabilities", Description: "Unified catalog of built-in, recipe, extension, and MCP-provided tools", Source: "builtin"},
		{ID: "/skills", Title: "List available skills", Source: "builtin"},
		{ID: "/agents", Title: "Expert settings", Description: "Pick the session expert", Source: "builtin"},
		{ID: "/scenarios", Title: "Show scenario trigger keywords", Source: "builtin"},
		{ID: "/new", Title: "Create a new session", Source: "builtin"},
		{ID: "/rename", Title: "Rename the current session", Source: "builtin"},
		{ID: "/sessions", Title: "Focus sidebar + filter sessions by title", Source: "builtin"},
		{ID: "/theme", Title: "Pick a colour theme (live preview)", Source: "builtin"},
		{ID: "/theme-export", Title: "Export current palette to ~/.config/gact/theme.json", Source: "builtin"},
		{ID: "/metrics", Title: "Open backend metrics modal", Source: "builtin"},
		{ID: "/doctor", Title: "Open backend health + integrations modal", Source: "builtin"},
		{ID: "/theme-next", Title: "Cycle to the next colour theme", Source: "builtin"},
		{ID: "/theme-prev", Title: "Cycle to the previous colour theme", Source: "builtin"},
		{ID: "/duplicate", Title: "Duplicate session", Description: "Copy title and expert", Source: "builtin"},
		{ID: "/summarize", Title: "Summarize fake-mcp text",
			Source: "mcp_prompt", ServerID: "mcp_fake",
			AgentID: "clio.expert.data", AgentSource: "builtin", CommandSource: "mcp_prompt", Invocation: "mcp_prompt",
			UserInvocable: &trueValue, AgentInvocable: &trueValue, PlannerVisible: &trueValue,
			ArgumentHint: "text required",
			Arguments:    []gact.AgentParameter{{Name: "text", Type: "multiline", Required: true}}},
	}
}

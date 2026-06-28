package ui

// active_blueprint_label.go derives and formats the active agent-blueprint indicator label for the session.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *agentComponent) activeAgentBlueprintID() string {
	if c.app.session.selected < 0 || c.app.session.selected >= len(c.app.session.sessions) {
		return ""
	}
	meta := mapValue(c.app.session.sessions[c.app.session.selected].Metadata)
	return firstNonEmpty(
		stringValue(meta["active_agent_blueprint_id"]),
		stringValue(meta["agent_blueprint_id"]),
	)
}

func (c *agentComponent) activeAgentBlueprintScope() string {
	if c.activeAgentBlueprintID() == "" || c.app.session.selected < 0 || c.app.session.selected >= len(c.app.session.sessions) {
		return ""
	}
	meta := mapValue(c.app.session.sessions[c.app.session.selected].Metadata)
	return firstNonEmpty(
		stringValue(meta["active_agent_blueprint_scope"]),
		stringValue(meta["agent_blueprint_scope"]),
		"session",
	)
}

func (c *sessionComponent) applyAgentBlueprintState(state gact.SessionAgentBlueprintState) {
	sessionID := strings.TrimSpace(state.SessionID)
	if sessionID == "" && c.selected >= 0 && c.selected < len(c.sessions) {
		sessionID = c.sessions[c.selected].ID
	}
	idx := c.indexByID(sessionID)
	if idx < 0 {
		return
	}
	if c.sessions[idx].Metadata == nil {
		c.sessions[idx].Metadata = map[string]any{}
	}
	if state.ActiveAgentBlueprintID != "" {
		c.sessions[idx].Metadata["active_agent_blueprint_id"] = state.ActiveAgentBlueprintID
	}
	if state.ActiveAgentBlueprintPath != "" {
		c.sessions[idx].Metadata["active_agent_blueprint_path"] = state.ActiveAgentBlueprintPath
	}
	if state.WorkspaceID != "" {
		c.sessions[idx].Metadata["active_agent_blueprint_workspace_id"] = state.WorkspaceID
	}
	c.sessions[idx].Metadata["active_agent_blueprint_scope"] = "session"
}

func activeAgentBlueprintIndicator(id, scope string, budget int) string {
	id = strings.TrimSpace(id)
	if id == "" || budget < 3 {
		return ""
	}
	scope = strings.TrimSpace(scope)
	raw := "◆ " + id
	if scope != "" {
		withScope := raw + " · " + scope
		if lipgloss.Width(withScope) <= budget {
			return withScope
		}
	}
	if lipgloss.Width(raw) <= budget {
		return raw
	}
	labelBudget := budget - lipgloss.Width("◆ ")
	if labelBudget < 1 {
		return textutil.Truncate("◆ "+id, budget)
	}
	return "◆ " + compactAgentBlueprintID(id, labelBudget)
}

func compactAgentBlueprintID(id string, budget int) string {
	id = strings.TrimSpace(strings.Join(strings.Fields(id), " "))
	if id == "" || budget < 1 {
		return ""
	}
	if lipgloss.Width(id) <= budget {
		return id
	}
	tokens := agentBlueprintIDTokens(id)
	if len(tokens) > 1 {
		for len(tokens) > 1 && agentBlueprintIDSuffixIsGeneric(tokens[len(tokens)-1]) {
			tokens = tokens[:len(tokens)-1]
		}
		best := ""
		for i := 1; i <= len(tokens); i++ {
			candidate := strings.Join(tokens[:i], "-")
			if lipgloss.Width(candidate) > budget {
				break
			}
			best = candidate
		}
		if best != "" {
			return best
		}
	}
	return textutil.Truncate(id, budget)
}

func agentBlueprintIDTokens(id string) []string {
	fields := strings.FieldsFunc(id, func(r rune) bool {
		switch r {
		case '-', '_', '/', '.', ':':
			return true
		default:
			return false
		}
	})
	tokens := make([]string, 0, len(fields))
	for _, field := range fields {
		if token := strings.TrimSpace(field); token != "" {
			tokens = append(tokens, token)
		}
	}
	return tokens
}

func agentBlueprintIDSuffixIsGeneric(token string) bool {
	switch strings.ToLower(strings.TrimSpace(token)) {
	case "agent", "agents", "benchmark", "blueprint", "blueprints", "demo", "live", "review", "reviews", "workflow", "workflows":
		return true
	default:
		return false
	}
}

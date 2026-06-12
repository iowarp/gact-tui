package ui

import (
	"strings"

	"charm.land/lipgloss/v2"
)

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
		return truncate("◆ "+id, budget)
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
	return truncate(id, budget)
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

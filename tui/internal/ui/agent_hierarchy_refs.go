package ui

// agent_hierarchy_refs.go walks nested metadata maps to detect references to a given agent ID.

import "strings"

func mapReferencesAgent(m map[string]any, agentID string) bool {
	return mapReferencesAgentDepth(m, agentID, 0)
}

func mapReferencesAgentDepth(m map[string]any, agentID string, depth int) bool {
	if len(m) == 0 || agentID == "" {
		return false
	}
	for _, key := range []string{
		"agent_id",
		"active_agent_id",
		"active_expert_id",
		"selected_agent_id",
		"child_id",
		"parent_id",
		"resumed_from",
		"dispatch_target",
		"agent",
		"id",
	} {
		if valueReferencesAgent(m[key], agentID, depth+1) {
			return true
		}
	}
	return false
}

func valueReferencesAgent(value any, agentID string, depth int) bool {
	if agentID == "" || depth > 6 {
		return false
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v) == agentID
	case map[string]any:
		if mapReferencesAgentDepth(v, agentID, depth+1) {
			return true
		}
		for _, nested := range v {
			if valueReferencesAgent(nested, agentID, depth+1) {
				return true
			}
		}
	case []any:
		for _, nested := range v {
			if valueReferencesAgent(nested, agentID, depth+1) {
				return true
			}
		}
	}
	return false
}

package ui

// execution_projection_state.go queries projected execution turns/nodes for the current session.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *executionComponent) turnSelected(userMsgIdx int) bool {
	if c.app.focus != FocusBody || c.app.conversation.bodySelMsgIdx < 0 || userMsgIdx < 0 {
		return false
	}
	nextUser := len(c.app.conversation.messages)
	for i := userMsgIdx + 1; i < len(c.app.conversation.messages); i++ {
		if c.app.conversation.messages[i].Role == gact.RoleUser {
			nextUser = i
			break
		}
	}
	return c.app.conversation.bodySelMsgIdx >= userMsgIdx && c.app.conversation.bodySelMsgIdx < nextUser
}

func (c *executionComponent) turnsForCurrentSession() []executionProjectedTurn {
	sid := c.app.session.currentID()
	if sid == "" || len(c.executionEventsBySession) == 0 {
		return nil
	}
	events := c.executionEventsBySession[sid]
	if !executionEventsHaveTrajectory(events) {
		return nil
	}
	// Memoize on (sessionID, len(events)): the ledger is append-only, so an
	// unchanged length means an identical projection. This skips the O(events)
	// graph rebuild on every steady frame and reuses it across the multiple
	// callers in a single frame (conversation render + execution detail).
	if c.projCacheOK && c.projCacheSID == sid && c.projCacheLen == len(events) {
		return c.projCacheTurns
	}
	turns := projectExecutionTimelineTurns(events)
	out := make([]executionProjectedTurn, 0, len(turns))
	for _, turn := range turns {
		filtered := turn.Nodes[:0]
		for _, node := range turn.Nodes {
			if executionNodeIsEmpty(node) {
				continue
			}
			filtered = append(filtered, node)
		}
		if len(filtered) == 0 {
			continue
		}
		turn.Nodes = filtered
		out = append(out, turn)
	}
	c.projCacheSID = sid
	c.projCacheLen = len(events)
	c.projCacheTurns = out
	c.projCacheOK = true
	return out
}

func (c *executionComponent) currentSessionHasProjected() bool {
	sid := c.app.session.currentID()
	if sid == "" || len(c.executionEventsBySession) == 0 {
		return false
	}
	return executionEventsHaveTrajectory(c.executionEventsBySession[sid])
}

func executionEventsHaveTrajectory(events []executionTimelineEvent) bool {
	for _, event := range events {
		switch event.Type {
		case "react.step.completed", "expert.extract.completed", "blueprint.delegation.started":
			return true
		}
	}
	return false
}

func executionNodeIsEmpty(node executionTimelineNode) bool {
	switch node.Kind {
	case executionNodeAssistantText:
		return strings.TrimSpace(node.Text) == ""
	case executionNodeHandoff:
		return strings.TrimSpace(node.Agent) == "" && strings.TrimSpace(node.Question) == ""
	case executionNodeReactStep:
		return strings.TrimSpace(node.Thinking) == "" &&
			strings.TrimSpace(node.ToolName) == "" &&
			node.Observation == nil
	case executionNodeExpertReport:
		return strings.TrimSpace(node.Text) == "" && node.Structured == nil
	case executionNodeToolRun:
		return strings.TrimSpace(node.ToolName) == "" && node.Observation == nil
	default:
		return true
	}
}

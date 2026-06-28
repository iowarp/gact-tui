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

// conversationTurnsForRender projects the canonical transcript from the ordered
// message.part.* atoms — the single persisted source that the live stream AND a
// /messages reload both deliver — so the render is identical live and reloaded
// (and matches the web, which renders from the same parts). This is the render
// hot path; it is memoized on (sessionID, total part count).
func (c *executionComponent) conversationTurnsForRender() []executionProjectedTurn {
	sid := c.app.session.currentID()
	if sid == "" {
		return nil
	}
	messages := c.app.conversation.messages
	if !messagesHaveExecutionTrajectory(messages) {
		return nil
	}
	partCount := 0
	for i := range messages {
		partCount += len(messages[i].Parts)
	}
	if c.projCacheOK && c.projCacheSID == sid && c.projCacheLen == partCount {
		return c.projCacheTurns
	}
	out := filterProjectedTurns(projectExecutionTimelineFromMessages(messages))
	c.projCacheSID = sid
	c.projCacheLen = partCount
	c.projCacheTurns = out
	c.projCacheOK = true
	return out
}

// turnsForCurrentSession projects from the SSE semantic.event ledger. It backs
// the Ctrl+E execution-detail drill-down, whose structured telemetry (tool
// observations, reasoning traces, artifact descriptors) lives on those events
// rather than the transcript parts.
func (c *executionComponent) turnsForCurrentSession() []executionProjectedTurn {
	sid := c.app.session.currentID()
	if sid == "" || len(c.executionEventsBySession) == 0 {
		return nil
	}
	events := c.executionEventsBySession[sid]
	if !executionEventsHaveTrajectory(events) {
		return nil
	}
	return filterProjectedTurns(projectExecutionTimelineTurns(events))
}

func filterProjectedTurns(turns []executionProjectedTurn) []executionProjectedTurn {
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
	return out
}

func (c *executionComponent) currentSessionHasProjected() bool {
	if c.app.session.currentID() == "" {
		return false
	}
	return messagesHaveExecutionTrajectory(c.app.conversation.messages)
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

package ui

// execution_render.go renders the projected execution timeline (agents, handoffs, react steps, tool runs).

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *executionComponent) renderConversation(t Theme, width int) (string, bool) {
	turns := c.turnsForCurrentSession()
	if len(turns) == 0 {
		return "", false
	}
	var rows []string
	var prev *gact.Message
	turnByID := map[string][]executionTimelineNode{}
	var unscoped [][]executionTimelineNode
	supplementsByTurn := c.assistantSupplementNodesByTurn()
	for _, turn := range turns {
		if turn.TurnID == "" {
			unscoped = append(unscoped, turn.Nodes)
			continue
		}
		turnByID[turn.TurnID] = turn.Nodes
	}
	unscopedIdx := 0
	for msgIdx, m := range c.app.conversation.messages {
		if m.Role != gact.RoleUser {
			continue
		}
		turnID := messageTurnID(m)
		rendered := t.renderMessageInContextWithResults(m, prev, width, nil)
		if strings.TrimSpace(rendered) != "" {
			rows = append(rows, rendered)
		}
		nodes := turnByID[turnID]
		if len(nodes) == 0 && unscopedIdx < len(unscoped) {
			nodes = unscoped[unscopedIdx]
			unscopedIdx++
		}
		if supplements := supplementsByTurn[turnID]; len(supplements) > 0 {
			nodes = append(nodes, executionDedupSupplementNodes(nodes, supplements)...)
		}
		if len(nodes) > 0 {
			msg := gact.Message{Role: gact.RoleAssistant}
			header := t.renderMessageHeader(msg)
			if c.turnSelected(msgIdx) {
				header = t.renderProjectedExecutionSelectionMarker() + header
			}
			rows = append(rows, lipgloss.JoinVertical(lipgloss.Left,
				header,
				t.renderExecutionTimeline(nodes, width),
				"",
			))
		}
		prev = &m
	}
	for ; unscopedIdx < len(unscoped); unscopedIdx++ {
		msg := gact.Message{Role: gact.RoleAssistant}
		rows = append(rows, lipgloss.JoinVertical(lipgloss.Left,
			t.renderMessageHeader(msg),
			t.renderExecutionTimeline(unscoped[unscopedIdx], width),
			"",
		))
	}
	return strings.Join(rows, "\n"), true
}

func (t Theme) renderProjectedExecutionSelectionMarker() string {
	return lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ")
}

func (t Theme) renderExecutionTimeline(nodes []executionTimelineNode, width int) string {
	var rows []string
	for i, node := range nodes {
		if i > 0 && executionNodeNeedsGap(nodes[i-1], node) {
			rows = append(rows, "")
		}
		if rendered := t.renderExecutionNode(node, width); rendered != "" {
			rows = append(rows, rendered)
		}
	}
	return strings.Join(rows, "\n")
}

func executionNodeNeedsGap(prev, cur executionTimelineNode) bool {
	if prev.Kind == executionNodeAssistantText || cur.Kind == executionNodeAssistantText {
		return true
	}
	if prev.Kind == executionNodeExpertReport || cur.Kind == executionNodeExpertReport {
		return true
	}
	return prev.Agent != cur.Agent
}

func (t Theme) renderExecutionNode(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	bodyW := width - lipgloss.Width(indent)
	if bodyW < 24 {
		bodyW = 24
	}
	switch node.Kind {
	case executionNodeAssistantText:
		return t.renderExecutionAgentBlock(node.Agent, node.Text, node.Depth, bodyW)
	case executionNodeHandoff:
		return t.renderExecutionHandoff(node, bodyW)
	case executionNodeReactStep:
		return t.renderExecutionReactStep(node, bodyW)
	case executionNodeToolRun:
		return t.renderExecutionToolRun(node, bodyW)
	case executionNodeExpertReport:
		return t.renderExecutionExpertReport(node, bodyW)
	default:
		return ""
	}
}

func (t Theme) renderExecutionAgentBlock(agent, text string, depth int, width int) string {
	agent = firstNonEmpty(strings.TrimSpace(agent), "main")
	indent := executionIndent(depth)
	label := indent + renderAgentName(t, agent)
	body := executionDisplayProse(text)
	if executionPlaceholderAssistantText(body) {
		return ""
	}
	if preview := executionAgentTextStructuredPreview(agent, body); preview != "" {
		body = preview
	}
	if body == "" {
		return label
	}
	body = executionWrapForPrefix(body, width, indent+"  ")
	return lipgloss.JoinVertical(lipgloss.Left, label, body)
}

func (t Theme) renderExecutionHandoff(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	parent := firstNonEmpty(node.ParentAgent, "main")
	child := firstNonEmpty(node.Agent, "expert")
	head := indent + lipgloss.NewStyle().Foreground(agentColor(t, child)).Bold(true).Render("↳ ") +
		renderAgentName(t, parent) + lipgloss.NewStyle().Foreground(t.FgMuted).Render(" → ") + renderAgentName(t, child)
	question := strings.TrimSpace(node.Question)
	if semanticPreviewIsRedacted(question) {
		question = ""
	}
	if question == "" {
		return head
	}
	body := executionWrapForPrefix(executionDisplayProse(question), width, indent+"  ")
	return lipgloss.JoinVertical(lipgloss.Left, head, body)
}

func (t Theme) renderExecutionReactStep(node executionTimelineNode, width int) string {
	contentIndent := executionContentIndent(node.Depth)
	var rows []string
	if thinking := strings.TrimSpace(node.Thinking); thinking != "" && !semanticPreviewIsRedacted(thinking) {
		thinking = strings.TrimSpace(stripExecutionControlSections(thinking))
		if thinking != "" {
			if node.Reasoning != "" {
				thinking = strings.TrimSpace(thinking) + lipgloss.NewStyle().Foreground(t.FgFaint).Render(" · Ctrl+E reasoning trace")
			}
			rows = append(rows, indentText(textutil.Wrap(thinking, width-lipgloss.Width(contentIndent)), contentIndent))
		}
	}
	if strings.TrimSpace(node.ToolName) != "" && !node.IsFinish {
		rows = append(rows, contentIndent+t.executionToolCallLine(node.ToolName, node.ToolArgs, width-lipgloss.Width(contentIndent)))
		if observation := t.executionObservationPreview(node.ToolName, node.Observation); observation != "" {
			rows = append(rows, indentText(t.executionObservationBlock(observation), contentIndent+"  "))
		}
	}
	if node.IsFinish {
		if observation := executionFinishPreview(node); observation != "" {
			rows = append(rows, indentText(observation, contentIndent))
		}
	}
	return strings.Join(rows, "\n")
}

func (t Theme) renderExecutionToolRun(node executionTimelineNode, width int) string {
	if node.Status == "running" {
		return ""
	}
	contentIndent := executionContentIndent(node.Depth)
	var rows []string
	rows = append(rows, contentIndent+t.executionToolCallLine(node.ToolName, node.ToolArgs, width-lipgloss.Width(contentIndent)))
	if observation := t.executionObservationPreview(node.ToolName, node.Observation); observation != "" {
		rows = append(rows, indentText(t.executionObservationBlock(observation), contentIndent+"  "))
	}
	return strings.Join(rows, "\n")
}

func (t Theme) renderExecutionExpertReport(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	agent := firstNonEmpty(node.Agent, "expert")
	head := indent + renderAgentName(t, agent) + lipgloss.NewStyle().Foreground(t.FgMuted).Render(" returned evidence")
	report := executionExpertReportPreview(node)
	if report == "" {
		report = executionDisplayProse(firstNonEmpty(node.Text, node.Summary))
	}
	if report == "" {
		return head
	}
	body := executionWrapForPrefix(report, width, indent+"  ")
	return lipgloss.JoinVertical(lipgloss.Left, head, body)
}

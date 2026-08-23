package ui

// execution_timeline_text.go accumulates and flushes assistant text into execution timeline nodes.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func executionMessageTextAgent(payload map[string]any, fallback string) string {
	if agent := executionActorAgentID(payload); agent != "" {
		return agent
	}
	return fallback
}

func executionFullMessageTextAgent(payload map[string]any) string {
	if agent := executionActorAgentID(payload); agent != "" {
		return agent
	}
	// Full text parts without an actor are canonical assistant message
	// snapshots. Child expert internals arrive on semantic trajectory events.
	return "main"
}

func (p *executionTimelineProjector) switchTextAgent(agent string) {
	agent = strings.TrimSpace(agent)
	if agent == "" {
		agent = "main"
	}
	if p.currentTextAgent == "" {
		p.currentTextAgent = agent
		return
	}
	if p.currentTextAgent == agent {
		return
	}
	p.flushText()
	p.currentTextAgent = agent
}

func (p *executionTimelineProjector) appendText(next string) {
	next = strings.TrimLeft(next, "\x00")
	if next == "" {
		return
	}
	current := p.text.String()
	if current == "" {
		p.text.WriteString(next)
		return
	}
	if overlap := suffixPrefixOverlap(current, next); overlap >= 3 {
		p.text.WriteString(next[overlap:])
		return
	}
	p.text.WriteString(next)
}

func (p *executionTimelineProjector) flushText() {
	text := strings.TrimSpace(p.text.String())
	p.text.Reset()
	if text == "" {
		return
	}
	if executionPlaceholderAssistantText(text) {
		return
	}
	agent := strings.TrimSpace(p.currentTextAgent)
	if agent == "" {
		agent = "main"
	}
	if p.replaceDuplicateAssistantText(agent, text) {
		return
	}
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:  executionNodeAssistantText,
		Agent: agent,
		Depth: timelineAgentDepth(agent),
		Text:  text,
	})
}

func (p *executionTimelineProjector) replaceDuplicateAssistantText(agent string, text string) bool {
	comparable := normalizeExecutionLooseComparable(text)
	if comparable == "" {
		return false
	}
	for i := range p.nodes {
		node := &p.nodes[i]
		if node.Kind != executionNodeAssistantText || strings.TrimSpace(node.Agent) != strings.TrimSpace(agent) {
			continue
		}
		if normalizeExecutionLooseComparable(node.Text) != comparable {
			continue
		}
		if executionTextQualityScore(text) > executionTextQualityScore(node.Text) {
			node.Text = text
		}
		return true
	}
	return false
}

func (p *executionTimelineProjector) applyPartAdded(event executionTimelineEvent) {
	part := event.Part
	if part == nil {
		return
	}
	if part.Type == gact.PartTypeText {
		text := strings.TrimSpace(part.Text)
		if text != "" {
			p.switchTextAgent(executionFullMessageTextAgent(event.Payload))
			p.appendText(text)
		}
		return
	}
	if part.Type != gact.PartTypeExpertHandoff {
		return
	}
	parent := valuefmt.FirstNonEmpty(valuefmt.StringValue(part.Metadata["parent_id"]), valuefmt.StringValue(part.Metadata["parent"]))
	agent := valuefmt.FirstNonEmpty(valuefmt.StringValue(part.Metadata["agent_id"]), valuefmt.StringValue(part.Metadata["delegate_to"]))
	question := strings.TrimSpace(valuefmt.StringValue(part.Metadata["question"]))
	if parent != "" && agent != "" && question != "" {
		key := handoffKey(parent, agent)
		p.handoffQuestions[key] = question
		for i := range p.nodes {
			if p.nodes[i].Kind == executionNodeHandoff &&
				handoffKey(p.nodes[i].ParentAgent, p.nodes[i].Agent) == key &&
				strings.TrimSpace(p.nodes[i].Question) == "" {
				p.nodes[i].Question = question
			}
		}
	}
}

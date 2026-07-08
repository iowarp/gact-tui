package ui

// execution_timeline_reports.go applies expert-extract and delegation-completed events to the timeline projector.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func (p *executionTimelineProjector) applyExpertExtract(payload map[string]any) {
	nested := executionPayloadBody(payload)
	node := executionExpertExtractNodeFromPayload(payload)
	agent := node.Agent
	key := "extract:" + agent + ":" + valuefmt.StringValue(nested["expert_span_id"])
	if p.seenReports[key] {
		return
	}
	p.seenReports[key] = true
	p.reportedAgents[agent] = true
	p.removePriorReportForAgent(agent)
	p.nodes = append(p.nodes, node)
}

func (p *executionTimelineProjector) applyDelegationCompleted(payload map[string]any) {
	node := executionDelegationReportNodeFromPayload(payload)
	agent := node.Agent
	parent := node.ParentAgent
	key := "delegation:" + parent + ":" + agent
	if p.seenReports[key] {
		return
	}
	if p.reportedAgents[agent] {
		if parent != "" {
			p.currentTextAgent = parent
		}
		return
	}
	p.seenReports[key] = true
	p.nodes = append(p.nodes, node)
	if parent != "" {
		p.currentTextAgent = parent
	}
}

// applyExpertResponse projects an `expert.response.completed` atom — the
// per-expert LM output capture that closes the nested-expert gap (a child
// whose answer never streamed as transcript text). It is a LOWER-precedence
// report than expert.extract.completed: an agent the extract already reported
// adds nothing, and an answer that merely duplicates already-projected prose
// (the streamed main answer) adds nothing either.
func (p *executionTimelineProjector) applyExpertResponse(payload map[string]any) {
	nested := executionPayloadBody(payload)
	agent := executionExpertID(payload)
	answer := strings.TrimSpace(valuefmt.StringValue(nested["answer"]))
	if agent == "" || answer == "" || semanticPreviewIsRedacted(answer) {
		return
	}
	if p.reportedAgents[agent] {
		return
	}
	comparable := normalizeExecutionComparable(answer)
	key := "response:" + agent + ":" + comparable
	if p.seenReports[key] {
		return
	}
	for _, node := range p.nodes {
		if existing := normalizeExecutionComparable(executionNodeComparableText(node)); existing != "" &&
			strings.Contains(existing, comparable) {
			return
		}
	}
	p.seenReports[key] = true
	node := executionTimelineNode{
		Kind:    executionNodeExpertReport,
		Agent:   agent,
		Depth:   timelineAgentDepth(agent),
		Text:    answer,
		Summary: valuefmt.StringValue(payload["summary"]),
	}
	if reasoning := strings.TrimSpace(valuefmt.StringValue(nested["reasoning"])); reasoning != "" && !semanticPreviewIsRedacted(reasoning) {
		node.Reasoning = reasoning
	}
	p.nodes = append(p.nodes, node)
}

func (p *executionTimelineProjector) removePriorReportForAgent(agent string) {
	agent = strings.TrimSpace(agent)
	if agent == "" {
		return
	}
	filtered := p.nodes[:0]
	for _, node := range p.nodes {
		if node.Kind == executionNodeExpertReport && strings.TrimSpace(node.Agent) == agent {
			continue
		}
		filtered = append(filtered, node)
	}
	p.nodes = filtered
}

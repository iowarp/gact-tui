package ui

// execution_timeline_reports.go applies expert-extract and delegation-completed events to the timeline projector.

import "strings"

func (p *executionTimelineProjector) applyExpertExtract(payload map[string]any) {
	nested := executionPayloadBody(payload)
	node := executionExpertExtractNodeFromPayload(payload)
	agent := node.Agent
	key := "extract:" + agent + ":" + stringValue(nested["expert_span_id"])
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

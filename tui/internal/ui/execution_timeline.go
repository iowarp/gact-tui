package ui

// execution_timeline.go projects execution-timeline events into ordered timeline nodes.

import (
	"sort"
	"strings"
)

type executionTimelineProjector struct {
	nodes            []executionTimelineNode
	text             strings.Builder
	currentTextAgent string
	handoffQuestions map[string]string
	seenHandoffs     map[string]bool
	seenReports      map[string]bool
	reportedAgents   map[string]bool
	reactStepSpans   map[string]bool
}

func projectExecutionTimeline(events []executionTimelineEvent) []executionTimelineNode {
	if len(events) == 0 {
		return nil
	}
	ordered := append([]executionTimelineEvent(nil), events...)
	sort.SliceStable(ordered, func(i, j int) bool {
		return ordered[i].Sequence < ordered[j].Sequence
	})
	p := executionTimelineProjector{
		currentTextAgent: "main",
		handoffQuestions: map[string]string{},
		seenHandoffs:     map[string]bool{},
		seenReports:      map[string]bool{},
		reportedAgents:   map[string]bool{},
		reactStepSpans:   executionReactStepSpanIDs(ordered),
	}
	for _, event := range ordered {
		p.apply(event)
	}
	p.flushText()
	return p.nodes
}

func (p *executionTimelineProjector) apply(event executionTimelineEvent) {
	switch event.Type {
	case "message.part.delta":
		p.switchTextAgent(executionMessageTextAgent(event.Payload, p.currentTextAgent))
		delta := mapValue(event.Payload["delta"])
		p.appendText(stringValue(delta["text_append"]))
	case "message.part.added":
		p.applyPartAdded(event)
	case "expert.lifecycle.started":
		p.flushText()
		p.applyExpertLifecycleStarted(event.Payload)
	case "blueprint.delegation.started":
		p.flushText()
		p.applyDelegationStarted(event.Payload)
	case "blueprint.delegation.completed":
		p.flushText()
		p.applyDelegationCompleted(event.Payload)
	case "expert.extract.completed":
		p.flushText()
		p.applyExpertExtract(event.Payload)
	case "react.step.completed":
		p.flushText()
		p.applyReactStep(event.Payload)
	case "tool.call.started":
		p.flushText()
		p.applyToolStarted(event.Payload)
	case "tool.call.completed":
		p.flushText()
		p.applyToolCompleted(event.Payload)
	}
}

func (p *executionTimelineProjector) applyExpertLifecycleStarted(payload map[string]any) {
	agent := executionExpertID(payload)
	if agent != "" {
		p.currentTextAgent = agent
	}
}

func (p *executionTimelineProjector) applyDelegationStarted(payload map[string]any) {
	node := executionHandoffNodeFromPayload(payload, p.handoffQuestions)
	parent := node.ParentAgent
	agent := node.Agent
	dedupKey := "handoff:" + handoffKey(parent, agent) + ":" + normalizeExecutionComparable(node.Question)
	if p.seenHandoffs[dedupKey] {
		if agent != "" {
			p.currentTextAgent = agent
		}
		return
	}
	p.seenHandoffs[dedupKey] = true
	p.nodes = append(p.nodes, node)
	if agent != "" {
		p.currentTextAgent = agent
	}
}

func (p *executionTimelineProjector) applyReactStep(payload map[string]any) {
	p.nodes = append(p.nodes, executionReactStepNodeFromPayload(payload))
}

func (p *executionTimelineProjector) applyToolStarted(payload map[string]any) {
	if executionToolEventSuppressedByReactSteps(p.reactStepSpans, payload) {
		return
	}
	p.nodes = append(p.nodes, executionToolStartedNodeFromPayload(payload))
}

func (p *executionTimelineProjector) applyToolCompleted(payload map[string]any) {
	if executionToolEventSuppressedByReactSteps(p.reactStepSpans, payload) {
		return
	}
	p.nodes = append(p.nodes, executionToolCompletedNodeFromPayload(payload))
}

package ui

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type executionNodeKind string

const (
	executionNodeAssistantText executionNodeKind = "assistant_text"
	executionNodeHandoff       executionNodeKind = "agent_handoff"
	executionNodeReactStep     executionNodeKind = "react_step"
	executionNodeToolRun       executionNodeKind = "tool_run"
	executionNodeExpertReport  executionNodeKind = "expert_report"
)

type executionTimelineNode struct {
	Kind        executionNodeKind
	Agent       string
	ParentAgent string
	Depth       int
	Text        string
	Question    string
	ToolName    string
	ToolArgs    any
	Observation any
	StepIndex   int
	IsFinish    bool
	Thinking    string
	Reasoning   string
	CallID      string
	Status      string
	Summary     string
	Structured  any
}

type executionTimelineEvent struct {
	Sequence  int
	Type      string
	TurnID    string
	SessionID string
	Payload   map[string]any
	Part      *gact.Part
}

type executionProjectedTurn struct {
	TurnID string
	Nodes  []executionTimelineNode
}

func projectExecutionTimelineTurns(events []executionTimelineEvent) []executionProjectedTurn {
	if len(events) == 0 {
		return nil
	}
	type bucket struct {
		turnID string
		events []executionTimelineEvent
		first  int
	}
	buckets := map[string]*bucket{}
	var order []string
	for _, event := range events {
		if event.Type == "turn.user_message" {
			continue
		}
		key := strings.TrimSpace(event.TurnID)
		if key == "" {
			key = "__unscoped__"
		}
		if buckets[key] == nil {
			buckets[key] = &bucket{turnID: key, first: event.Sequence}
			order = append(order, key)
		}
		buckets[key].events = append(buckets[key].events, event)
		if event.Sequence < buckets[key].first {
			buckets[key].first = event.Sequence
		}
	}
	sort.SliceStable(order, func(i, j int) bool {
		return buckets[order[i]].first < buckets[order[j]].first
	})
	turns := make([]executionProjectedTurn, 0, len(order))
	for _, key := range order {
		nodes := projectExecutionTimeline(buckets[key].events)
		if len(nodes) == 0 {
			continue
		}
		turnID := buckets[key].turnID
		if turnID == "__unscoped__" {
			turnID = ""
		}
		turns = append(turns, executionProjectedTurn{TurnID: turnID, Nodes: nodes})
	}
	return turns
}

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
		delta := mapValue(event.Payload["delta"])
		p.appendText(stringValue(delta["text_append"]))
	case "message.part.added":
		p.applyPartAdded(event.Part)
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
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:  executionNodeAssistantText,
		Agent: agent,
		Depth: timelineAgentDepth(agent),
		Text:  text,
	})
}

func (p *executionTimelineProjector) applyPartAdded(part *gact.Part) {
	if part == nil {
		return
	}
	if part.Type == gact.PartTypeText {
		text := strings.TrimSpace(part.Text)
		if text != "" {
			p.text.WriteString(text)
		}
		return
	}
	if part.Type != gact.PartTypeExpertHandoff {
		return
	}
	parent := firstNonEmpty(stringValue(part.Metadata["parent_id"]), stringValue(part.Metadata["parent"]))
	agent := firstNonEmpty(stringValue(part.Metadata["agent_id"]), stringValue(part.Metadata["delegate_to"]))
	question := strings.TrimSpace(stringValue(part.Metadata["question"]))
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

func (p *executionTimelineProjector) applyExpertLifecycleStarted(payload map[string]any) {
	nested := mapValue(payload["payload"])
	agent := firstNonEmpty(
		stringValue(nested["expert_id"]),
		stringValue(mapValue(payload["actor"])["agent_id"]),
	)
	if agent != "" {
		p.currentTextAgent = agent
	}
}

func (p *executionTimelineProjector) applyDelegationStarted(payload map[string]any) {
	nested := mapValue(payload["payload"])
	parent := firstNonEmpty(
		stringValue(nested["parent_id"]),
		stringValue(mapValue(payload["actor"])["agent_id"]),
	)
	agent := firstNonEmpty(
		stringValue(nested["delegate_to"]),
		stringValue(nested["agent_id"]),
		stringValue(mapValue(payload["subject"])["agent_id"]),
	)
	question := stringValue(nested["question"])
	if semanticPreviewIsRedacted(question) {
		question = p.handoffQuestions[handoffKey(parent, agent)]
	}
	dedupKey := "handoff:" + handoffKey(parent, agent) + ":" + normalizeExecutionComparable(question)
	if p.seenHandoffs[dedupKey] {
		if agent != "" {
			p.currentTextAgent = agent
		}
		return
	}
	p.seenHandoffs[dedupKey] = true
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:        executionNodeHandoff,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Question:    question,
		Status:      firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"])),
		Summary:     firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["ui_summary"])),
	})
	if agent != "" {
		p.currentTextAgent = agent
	}
}

func (p *executionTimelineProjector) applyReactStep(payload map[string]any) {
	nested := mapValue(payload["payload"])
	agent := firstNonEmpty(
		stringValue(nested["expert_id"]),
		stringValue(mapValue(payload["actor"])["agent_id"]),
	)
	stepIndex := timelineIntValue(nested["step_index"], -1)
	toolName := firstNonEmpty(stringValue(nested["tool_name"]), "step")
	thinking := strings.TrimSpace(stringValue(nested["thought"]))
	reasoning := strings.TrimSpace(stringValue(nested["reasoning"]))
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:        executionNodeReactStep,
		Agent:       agent,
		Depth:       timelineAgentDepth(agent),
		StepIndex:   stepIndex,
		ToolName:    toolName,
		ToolArgs:    nested["tool_args"],
		Observation: nested["observation"],
		IsFinish:    boolValue(nested["is_finish"]),
		Thinking:    thinking,
		Reasoning:   reasoning,
		Summary:     firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["ui_summary"])),
	})
}

func (p *executionTimelineProjector) applyExpertExtract(payload map[string]any) {
	nested := mapValue(payload["payload"])
	agent := firstNonEmpty(
		stringValue(nested["expert_id"]),
		stringValue(mapValue(payload["actor"])["agent_id"]),
	)
	key := "extract:" + agent + ":" + stringValue(nested["expert_span_id"])
	if p.seenReports[key] {
		return
	}
	p.seenReports[key] = true
	p.reportedAgents[agent] = true
	p.removePriorReportForAgent(agent)
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:       executionNodeExpertReport,
		Agent:      agent,
		Depth:      timelineAgentDepth(agent),
		Text:       firstNonEmpty(stringValue(nested["output"]), stringValue(nested["result_summary"])),
		Reasoning:  strings.TrimSpace(stringValue(nested["reasoning"])),
		Summary:    firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["result_summary"])),
		Structured: nested["structured"],
	})
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

func (p *executionTimelineProjector) applyDelegationCompleted(payload map[string]any) {
	nested := mapValue(payload["payload"])
	agent := firstNonEmpty(
		stringValue(nested["delegate_to"]),
		stringValue(nested["agent_id"]),
		stringValue(mapValue(payload["actor"])["agent_id"]),
	)
	parent := firstNonEmpty(
		stringValue(nested["return_to"]),
		stringValue(nested["parent_id"]),
		stringValue(mapValue(payload["subject"])["agent_id"]),
	)
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
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:        executionNodeExpertReport,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineDepth(parent, agent),
		Text: firstNonEmpty(
			stringValue(nested["output_summary"]),
			stringValue(nested["return_output_summary"]),
			stringValue(nested["local_output_summary"]),
			stringValue(payload["summary"]),
		),
		Status:  firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"])),
		Summary: firstNonEmpty(stringValue(payload["summary"]), stringValue(nested["result_summary"])),
	})
	if parent != "" {
		p.currentTextAgent = parent
	}
}

func (p *executionTimelineProjector) applyToolStarted(payload map[string]any) {
	if len(p.reactStepSpans) > 0 {
		return
	}
	if p.reactStepSpans[stringValue(payload["parent_span_id"])] {
		return
	}
	nested := semanticToolPayload(payload)
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:     executionNodeToolRun,
		Agent:    firstNonEmpty(stringValue(mapValue(payload["actor"])["agent_id"]), stringValue(nested["agent_id"])),
		Depth:    timelineAgentDepth(stringValue(mapValue(payload["actor"])["agent_id"])),
		ToolName: firstNonEmpty(stringValue(nested["tool_name"]), stringValue(nested["tool"]), stringValue(payload["tool_name"])),
		ToolArgs: firstNonNil(nested["args"], payload["args"]),
		CallID:   firstNonEmpty(stringValue(nested["call_id"]), stringValue(payload["call_id"])),
		Status:   "running",
	})
}

func (p *executionTimelineProjector) applyToolCompleted(payload map[string]any) {
	if len(p.reactStepSpans) > 0 {
		return
	}
	if p.reactStepSpans[stringValue(payload["parent_span_id"])] {
		return
	}
	nested := semanticToolPayload(payload)
	p.nodes = append(p.nodes, executionTimelineNode{
		Kind:        executionNodeToolRun,
		Agent:       firstNonEmpty(stringValue(mapValue(payload["actor"])["agent_id"]), stringValue(nested["agent_id"])),
		Depth:       timelineAgentDepth(stringValue(mapValue(payload["actor"])["agent_id"])),
		ToolName:    firstNonEmpty(stringValue(nested["tool_name"]), stringValue(nested["tool"]), stringValue(payload["tool_name"])),
		Observation: firstNonNil(nested["result"], nested["output"], payload["result"], payload["output"]),
		CallID:      firstNonEmpty(stringValue(nested["call_id"]), stringValue(payload["call_id"])),
		Status:      firstNonEmpty(stringValue(nested["status"]), stringValue(payload["status"]), "completed"),
		Summary:     stringValue(payload["summary"]),
	})
}

func executionReactStepSpanIDs(events []executionTimelineEvent) map[string]bool {
	out := map[string]bool{}
	for _, event := range events {
		if event.Type != "react.step.completed" {
			continue
		}
		nested := mapValue(event.Payload["payload"])
		if span := strings.TrimSpace(stringValue(nested["step_span_id"])); span != "" {
			out[span] = true
		}
		if span := strings.TrimSpace(stringValue(event.Payload["parent_span_id"])); span != "" {
			out[span] = true
		}
	}
	return out
}

func handoffKey(parent, agent string) string {
	return strings.TrimSpace(parent) + "->" + strings.TrimSpace(agent)
}

func suffixPrefixOverlap(left, right string) int {
	maxLen := min(len(left), len(right))
	for n := maxLen; n > 0; n-- {
		if strings.HasSuffix(left, right[:n]) {
			return n
		}
	}
	return 0
}

func timelineDepth(parent, agent string) int {
	parent = strings.TrimSpace(parent)
	agent = strings.TrimSpace(agent)
	if parent == "" || parent == "main" {
		if agent == "main" || agent == "" {
			return 0
		}
		return 1
	}
	return timelineAgentDepth(parent) + 1
}

func timelineAgentDepth(agent string) int {
	switch strings.TrimSpace(agent) {
	case "", "main":
		return 0
	case "data", "geospatial", "analysis", "visualization", "synthesis":
		return 1
	default:
		return 2
	}
}

func timelineIntValue(value any, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case jsonNumber:
		if i, err := strconv.Atoi(string(v)); err == nil {
			return i
		}
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return i
		}
	}
	return fallback
}

type jsonNumber string

func boolValue(value any) bool {
	v, _ := optionalBoolValue(value)
	return v
}

func formatExecutionNodeForTest(n executionTimelineNode) string {
	switch n.Kind {
	case executionNodeAssistantText:
		return "text:" + n.Agent + ":" + compactTimelineText(n.Text)
	case executionNodeHandoff:
		return "handoff:" + n.ParentAgent + "->" + n.Agent + ":" + compactTimelineText(n.Question)
	case executionNodeReactStep:
		return fmt.Sprintf("step:%s:%d:%s", n.Agent, n.StepIndex, n.ToolName)
	case executionNodeExpertReport:
		return "report:" + n.Agent + "->" + n.ParentAgent + ":" + compactTimelineText(firstNonEmpty(n.Summary, n.Text))
	case executionNodeToolRun:
		return "tool:" + n.Agent + ":" + n.ToolName + ":" + n.Status
	default:
		return string(n.Kind)
	}
}

func compactTimelineText(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	return truncateString(text, 120)
}

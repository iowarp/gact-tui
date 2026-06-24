package ui

// execution_types.go defines the execution timeline node/event/turn types and node kinds.

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

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

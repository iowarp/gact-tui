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
	// executionNodePassthrough carries a transcript part the timeline grammar
	// has no dedicated row for (file_diff, image, document, …). It renders via
	// the part's own view at the owning agent's depth — web parity: the unified
	// turn model keeps such parts as passthrough rows instead of dropping them
	// (apps/web transcriptDelegationModel "passthrough" rows).
	executionNodePassthrough executionNodeKind = "part_passthrough"
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
	// ProviderThinking marks a react-step node whose Thinking is provider-native
	// reasoning (metadata.thinking_source == "provider", e.g. the Claude Code
	// SDK) rather than a ReAct next_thought. The renderer collapses it to a
	// single muted `thinking · N chars · Ctrl+E` disclosure row (web parity:
	// ProviderThinkingDisclosure) instead of spilling the full prose inline; the
	// full text stays on Thinking for the Ctrl+E detail view.
	ProviderThinking bool
	// HasRawDetail marks a tool node whose result carries a raw payload
	// (metadata.raw_result) beyond the inline preview; the renderer paints the
	// `detail: raw · Ctrl+E expand` affordance line (flat-render parity).
	HasRawDetail bool

	// Source addressing back into the conversation transcript, for part-level
	// hit testing and the body part cursor (#233 phase 1). Only nodes projected
	// from message parts carry it: MsgIdx indexes conversation.messages,
	// AddrIdx indexes addressablePartsOf(messages[MsgIdx]). Nodes projected
	// from the SSE semantic ledger (the Ctrl+E drill-down) leave AddrIdx at -1
	// via the zero-value guard in the hit-block builder (PartAddr.Valid).
	Src executionNodeSource

	// Part is the raw transcript part for passthrough nodes; nil otherwise.
	Part *gact.Part
}

// executionNodeSource addresses a timeline node's originating transcript part.
// The zero value (Valid=false) means "not part-addressed" — nodes projected
// from SSE semantic events rather than message parts.
type executionNodeSource struct {
	Valid   bool
	MsgIdx  int
	AddrIdx int
	PartID  string
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

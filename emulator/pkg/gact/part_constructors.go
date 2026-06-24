package gact

// NewTextPart constructs a text part.
func NewTextPart(text string) Part {
	return Part{Type: PartTypeText, Text: text}
}

// NewThinkingPart constructs a thinking part.
func NewThinkingPart(thinking string) Part {
	return Part{Type: PartTypeThinking, Thinking: thinking}
}

// NewRoutingDecisionPart constructs a routing_decision part (v0.2 —
// SPEC §4.5). Emitted as the first part of an assistant message when
// the backend's tier-1 orchestrator picked a tier-2 agent. heuristic
// = true for keyword-match routing; false for LM-driven routing.
func NewRoutingDecisionPart(selectedAgent, rationale string, confidence float64, heuristic bool) Part {
	return Part{
		Type:          PartTypeRoutingDecision,
		SelectedAgent: selectedAgent,
		Rationale:     rationale,
		Confidence:    confidence,
		Heuristic:     heuristic,
	}
}

// NewToolCallPart constructs a tool_call part. Input may be nil.
func NewToolCallPart(callID, toolName string, input map[string]any) Part {
	return Part{
		Type:     PartTypeToolCall,
		CallID:   callID,
		ToolName: toolName,
		Input:    input,
	}
}

// NewToolResultPart constructs a tool_result part wrapping arbitrary content.
func NewToolResultPart(callID string, content []Part, isError bool) Part {
	return Part{
		Type:    PartTypeToolResult,
		CallID:  callID,
		Content: content,
		IsError: isError,
	}
}

// NewFileDiffPart constructs a file_diff part. Use nil for before to mean
// "new file"; nil for after to mean "deleted".
func NewFileDiffPart(path string, before, after *string, language string) Part {
	return Part{
		Type:     PartTypeFileDiff,
		Path:     path,
		Before:   before,
		After:    after,
		Language: language,
	}
}

// NewErrorPart constructs an error part.
func NewErrorPart(code, message string, recoverable bool) Part {
	return Part{
		Type:        PartTypeError,
		Code:        code,
		Message:     message,
		Recoverable: recoverable,
	}
}

// NewCompactionPart constructs a compaction part recording that the given
// messages were summarized away.
func NewCompactionPart(summary string, compactedIDs []string, auto bool) Part {
	return Part{
		Type:                PartTypeCompaction,
		Summary:             summary,
		CompactedMessageIDs: compactedIDs,
		Auto:                auto,
	}
}

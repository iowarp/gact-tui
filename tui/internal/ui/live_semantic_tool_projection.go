package ui

// live_semantic_tool_projection.go applies tool-call started/completed semantic events to the conversation.

import (
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *conversationComponent) applyToolCallStarted(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := c.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = c.app.session.currentID()
	}
	if c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	toolPayload := semanticToolPayload(pl)
	callID := firstNonEmpty(stringValue(toolPayload["call_id"]), stringValue(pl["call_id"]), stringValue(pl["id"]))
	toolName := firstNonEmpty(stringValue(toolPayload["tool"]), stringValue(toolPayload["tool_name"]), stringValue(pl["tool"]), stringValue(pl["tool_name"]), "tool")
	if callID == "" {
		callID = "semantic_" + stableIDFragment(toolName+"_"+stringValue(pl["turn_id"])+"_"+e.ID)
	}
	if c.hasToolPart(callID, gact.PartTypeToolCall) {
		return
	}
	msg := c.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil {
		return
	}
	argsRaw := firstNonNil(toolPayload["args"], pl["args"])
	argsPreview := semanticArgsPreview(toolPayload, pl)
	md := semanticWorkflowMetadata(pl, "tool.call.started")
	md["semantic_event"] = true
	md["stream_source"] = "semantic_event"
	md["telemetry_source"] = firstNonEmpty(stringValue(toolPayload["telemetry_source"]), stringValue(pl["telemetry_source"]), "semantic_event")
	md["status"] = "running"
	md["args_preview"] = argsPreview
	md["raw_event"] = pl
	msg.Parts = append(msg.Parts, gact.Part{
		ID:       "semantic_" + callID + "_call",
		Type:     gact.PartTypeToolCall,
		CallID:   callID,
		ToolName: toolName,
		Input:    mapValue(argsRaw),
		Metadata: md,
	})
	c.cacheSemanticLiveMessagesForSession(sid)
}

func (c *conversationComponent) applyToolCallCompleted(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := c.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = c.app.session.currentID()
	}
	if c.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	toolPayload := semanticToolPayload(pl)
	callID := firstNonEmpty(stringValue(toolPayload["call_id"]), stringValue(pl["call_id"]), stringValue(pl["id"]))
	toolName := firstNonEmpty(stringValue(toolPayload["tool"]), stringValue(toolPayload["tool_name"]), stringValue(pl["tool"]), stringValue(pl["tool_name"]), "tool")
	if callID == "" {
		callID = "semantic_" + stableIDFragment(toolName+"_"+stringValue(pl["turn_id"])+"_"+e.ID)
	}
	if c.hasToolPart(callID, gact.PartTypeToolResult) {
		return
	}
	errText := firstNonEmpty(stringValue(toolPayload["error"]), stringValue(pl["error"]), stringValue(pl["message"]))
	okResult, okKnown := optionalBoolValue(firstNonNil(toolPayload["ok"], pl["ok"]))
	summaryText := stringValue(pl["summary"])
	if e.Type == "tool.call.completed" && errText == "" && summaryText == "" && c.hasToolPart(callID, gact.PartTypeToolCall) {
		return
	}
	msg := c.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil {
		return
	}
	duration, hasDuration := floatValue(firstNonNil(toolPayload["duration_ms"], pl["duration_ms"]))
	cached, hasCached := firstNonNil(toolPayload["cached"], pl["cached"]).(bool)
	resultText := firstNonEmpty(errText, semanticToolCompletionSummary(toolName, summaryText, toolPayload, pl, duration, hasDuration, cached, hasCached))
	md := semanticWorkflowMetadata(pl, "tool.call.completed")
	md["semantic_event"] = true
	md["stream_source"] = "semantic_event"
	md["telemetry_source"] = firstNonEmpty(stringValue(toolPayload["telemetry_source"]), stringValue(pl["telemetry_source"]), "semantic_event")
	md["raw_event"] = pl
	result := gact.Part{
		ID:       "semantic_" + callID + "_result",
		Type:     gact.PartTypeToolResult,
		CallID:   callID,
		ToolName: toolName,
		IsError:  errText != "" || (okKnown && !okResult),
		Content: []gact.Part{{
			ID:   "semantic_" + callID + "_result_text",
			Type: gact.PartTypeText,
			Text: resultText,
		}},
		Metadata: md,
	}
	if hasDuration {
		result.DurationMS = duration
	}
	if hasCached {
		result.Cached = cached
	}
	msg.Parts = append(msg.Parts, result)
	c.cacheSemanticLiveMessagesForSession(sid)
}

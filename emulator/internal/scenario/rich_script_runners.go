package scenario

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runLongScript produces an assistant turn with a very long text
// reply — about 60 lines of prose split into several paragraphs.
// Used to drive the "long message should compact with expand-on-
// demand" rendering work (feedback L3).
//
// Triggered by "long" / "explain" / "writeup" substrings in the user
// prompt.
func runLongScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// PPPPP1: cycle through longReplyVariants per session so repeat
	// "long explain" turns produce visibly different writeups —
	// pairs with FFFFF1's cursor-aware Ctrl+E. Same NextCallIndex
	// pattern as GGGGG1's bigtool variants.
	idx := e.NextCallIndex(sessionID, "long")
	v := longReplyVariants[idx%len(longReplyVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	// Short thinking — this variant is about reply length, not
	// thinking length.
	thinking, _ := e.addPart(sessionID, asst.ID, gact.NewThinkingPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, thinking.ID,
		v.thinking, "thinking")
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	body, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, body.ID, v.body, "text")
	e.completePart(sessionID, asst.ID, body.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// runBigToolScript produces an assistant turn that invokes `tail`
// against a synthetic log file and gets back ~80 lines of output.
// Used to drive the "large tool output should compact with expand-
// on-demand" rendering work (feedback L3).
//
// Triggered by "log" / "dump" / "traceback" / "logs" in the user
// prompt.
func runBigToolScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// GGGGG1: pick a different log payload + framing per call so
	// repeated "dump the log" turns produce visibly different bulky
	// outputs. Cycles through bigLogVariants by per-session counter.
	idx := e.NextCallIndex(sessionID, "bigtool")
	v := bigLogVariants[idx%len(bigLogVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, intro.ID, v.intro, "text")
	e.completePart(sessionID, asst.ID, intro.ID)

	callID := "call_" + asst.ID[len(asst.ID)-8:]
	toolPart, _ := e.addPart(sessionID, asst.ID,
		gact.NewToolCallPart(callID, "shell", nil))
	toolInputRaw := v.commandJSON
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": asst.ID, "part_id": toolPart.ID,
			"delta": map[string]any{"input_json_append": toolInputRaw},
		},
	})
	_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
		var m map[string]any
		_ = json.Unmarshal([]byte(toolInputRaw), &m)
		p.Input = m
	})
	e.completePart(sessionID, asst.ID, toolPart.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload:   map[string]any{"call_id": callID, "tool_name": "shell"},
	})
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload:   map[string]any{"call_id": callID, "is_error": false},
	})

	toolMsg, _ := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			gact.NewToolResultPart(callID, []gact.Part{
				gact.NewTextPart(v.body),
			}, false),
		},
	})
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   toolMsg,
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, final.ID, finalP.ID, v.followup, "text")
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// runMultiToolScript produces an assistant turn that invokes three
// tools in sequence (read → grep → edit), interleaved with short
// narrations. Useful for testing the conversation's visual density
// when tool calls pile up (feedback L4's demarcation).
//
// Triggered by "many tools" / "multi tool" in the user prompt.
func runMultiToolScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// QQQQQ1: cycle multi-tool sequences per session, same pattern as
	// GGGGG1/PPPPP1. Three distinct 3-tool flows so repeated "many
	// tools" turns produce visibly different sequences.
	idx := e.NextCallIndex(sessionID, "multitool")
	v := multiToolVariants[idx%len(multiToolVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, intro.ID, v.intro, "text")
	e.completePart(sessionID, asst.ID, intro.ID)

	tools := v.tools
	for i, tc := range tools {
		callID := fmt.Sprintf("call_%s_%d", asst.ID[len(asst.ID)-6:], i)
		toolPart, _ := e.addPart(sessionID, asst.ID,
			gact.NewToolCallPart(callID, tc.name, nil))
		e.bus.Publish(events.Event{
			Type:      "message.part.delta",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": asst.ID, "part_id": toolPart.ID,
				"delta": map[string]any{"input_json_append": tc.input},
			},
		})
		_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
			var m map[string]any
			_ = json.Unmarshal([]byte(tc.input), &m)
			p.Input = m
		})
		e.completePart(sessionID, asst.ID, toolPart.ID)

		if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
			return
		}
		e.bus.Publish(events.Event{
			Type:      "tool.call.completed",
			SessionID: sessionID,
			Payload:   map[string]any{"call_id": callID, "is_error": false},
		})

		toolMsg, _ := e.store.AppendMessage(gact.Message{
			SessionID: sessionID,
			Role:      gact.RoleTool,
			Parts: []gact.Part{
				gact.NewToolResultPart(callID, []gact.Part{
					gact.NewTextPart(tc.result),
				}, false),
			},
		})
		e.bus.Publish(events.Event{
			Type: "message.created", SessionID: sessionID, Payload: toolMsg,
		})
		if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
			return
		}
	}
	// SSSSSSSSS1: if the variant carries a file_diff payload, emit it
	// as a sibling part on the same assistant message before the
	// stop. This lets "many tools" demonstrate the full read → grep →
	// edit flow, so the body cursor has a real file_diff to target
	// with `a`/`r` apply/reject.
	if v.diffPath != "" {
		before, after := v.diffBefore, v.diffAfter
		_, _ = e.addPart(sessionID, asst.ID,
			gact.NewFileDiffPart(v.diffPath, &before, &after, v.diffLang))
	}
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, final.ID, finalP.ID, v.followup, "text")
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

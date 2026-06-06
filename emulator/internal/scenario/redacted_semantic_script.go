package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runRedactedSemanticToolScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	e.publishStatus(sessionID, gact.StatusRunning)

	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, err := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, asst.ID, intro.ID,
		"Starting a live observer tool call whose structured arguments are redacted by the runtime.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	callID := "call_redacted_semantic"
	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":   callID,
			"tool_name": "sac_plot_traces",
			"args":      "[redacted]",
		},
	})
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":     callID,
			"tool_name":   "sac_plot_traces",
			"summary":     "completed",
			"ok":          true,
			"duration_ms": 37.0,
			"args":        "[redacted]",
		},
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	final, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	body, err := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, final.ID, body.ID,
		"The live observer emitted both tool start and completion before this final answer. The inline transcript should explain that the input was redacted by the runtime.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, body.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

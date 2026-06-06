package scenario

import (
	"context"
	"encoding/json"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runEarthScopeSACScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	e.publishStatus(sessionID, gact.StatusRunning)

	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	thinking, err := e.addPart(sessionID, asst.ID, gact.NewThinkingPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, asst.ID, thinking.ID,
		"Resolving the San Diego region and preparing an EarthScope waveform discovery call.\n",
		"thinking"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	intro, err := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, asst.ID, intro.ID,
		"I found the seismic workflow path. Next I am discovering recent EarthScope waveforms around San Diego and staging one SAC trace for inspection.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	callID := "call_" + asst.ID[len(asst.ID)-8:]
	input := map[string]any{
		"location":      "San Diego, CA",
		"days_back":     7,
		"duration":      120,
		"min_magnitude": 1,
		"output_dir":    "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging",
	}
	toolPart, err := e.addPart(sessionID, asst.ID, gact.NewToolCallPart(callID, "sac_discover_earthscope_region_waveform", nil))
	if err != nil {
		return
	}
	inputBytes, _ := json.Marshal(input)
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": asst.ID,
			"part_id":    toolPart.ID,
			"delta":      map[string]any{"input_json_append": string(inputBytes)},
		},
	})
	_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
		p.Input = input
	})
	e.completePart(sessionID, asst.ID, toolPart.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":   callID,
			"tool_name": "sac_discover_earthscope_region_waveform",
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
			"tool_name":   "sac_discover_earthscope_region_waveform",
			"is_error":    false,
			"duration_ms": 812.4,
		},
	})

	result := map[string]any{
		"_meta":        map[string]any{"status": "success"},
		"archive_path": "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
		"network":      "CI",
		"station":      "BAR",
		"location":     "--",
		"channel":      "BHZ",
		"event_count":  4,
		"trace_count":  1,
		"start_time":   "2026-05-29T02:12:01Z",
		"end_time":     "2026-05-29T02:14:01Z",
		"magnitude":    2.7,
	}
	resultBytes, _ := json.Marshal(result)
	toolMsg, err := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			func() gact.Part {
				part := gact.NewToolResultPart(callID, []gact.Part{
					gact.NewTextPart(string(resultBytes)),
				}, false)
				part.ToolName = "sac_discover_earthscope_region_waveform"
				return part
			}(),
		},
	})
	if err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   toolMsg,
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	final, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	finalPart, err := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, final.ID, finalPart.ID,
		"EarthScope waveform discovery returned CI.BAR.--.BHZ for the San Diego window. The SAC trace is staged and ready for statistics and visualization.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalPart.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

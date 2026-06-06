package scenario

import (
	"context"
	"encoding/json"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runNDPWarningsScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
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
		"Resolving the California NWS warning feature layer and preparing timestamp normalization.\n",
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
		"I found the NWS warning route. Next I am querying California alert features and normalizing epoch fields into ISO timestamps.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	callID := "call_" + asst.ID[len(asst.ID)-8:]
	input := map[string]any{
		"dataset_identifier": "california-nws-warnings",
		"where":              "state = 'CA'",
		"normalize_epochs":   true,
		"server":             "global",
	}
	toolPart, err := e.addPart(sessionID, asst.ID, gact.NewToolCallPart(callID, "ndp_query_arcgis_features", nil))
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
			"tool_name": "ndp_query_arcgis_features",
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
			"tool_name":   "ndp_query_arcgis_features",
			"is_error":    false,
			"duration_ms": 684.2,
		},
	})

	result := map[string]any{
		"status":      "success",
		"source":      "California NWS warnings",
		"count":       2,
		"output_path": "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/california_nws_warnings.json",
		"records": []any{
			map[string]any{
				"properties": map[string]any{
					"headline":  "Flood Warning issued June 5",
					"event":     "Flood Warning",
					"severity":  "Severe",
					"areaDesc":  "Los Angeles County",
					"effective": "2026-06-05T11:00:00Z",
					"expires":   "2026-06-05T20:00:00Z",
				},
			},
			map[string]any{
				"properties": map[string]any{
					"headline":  "Wind Advisory issued June 5",
					"event":     "Wind Advisory",
					"severity":  "Moderate",
					"areaDesc":  "San Diego County Coastal Areas",
					"effective": "2026-06-05T18:00:00Z",
					"expires":   "2026-06-06T03:00:00Z",
				},
			},
		},
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
				part.ToolName = "ndp_query_arcgis_features"
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
		"California NWS warning features were normalized and saved to california_nws_warnings.json with ISO effective and expiry timestamps ready for review.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalPart.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

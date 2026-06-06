package scenario

import (
	"context"
	"encoding/json"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runCIMISWeatherScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
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
		"Locating CIMIS Station 80 Fresno State hourly weather data and preparing the profile plan.\n",
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
		"I found the Fresno CIMIS weather route. First I am profiling temperature, humidity, and wind fields in the staged hourly CSV.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	profileCallID := "call_" + asst.ID[len(asst.ID)-8:] + "_profile"
	profileInput := map[string]any{
		"path":       "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/cimis_station_80_fresno_hourly.csv",
		"station":    "80 Fresno State",
		"fields":     []any{"air_temperature_f", "relative_humidity_pct", "wind_speed_mph"},
		"time_field": "observation_time",
	}
	profilePart, err := e.addPart(sessionID, asst.ID, gact.NewToolCallPart(profileCallID, "profile_csv_weather", nil))
	if err != nil {
		return
	}
	profileInputBytes, _ := json.Marshal(profileInput)
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": asst.ID,
			"part_id":    profilePart.ID,
			"delta":      map[string]any{"input_json_append": string(profileInputBytes)},
		},
	})
	_, _ = e.store.UpdateMessagePart(asst.ID, profilePart.ID, func(p *gact.Part) {
		p.Input = profileInput
	})
	e.completePart(sessionID, asst.ID, profilePart.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":   profileCallID,
			"tool_name": "profile_csv_weather",
		},
	})
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":     profileCallID,
			"tool_name":   "profile_csv_weather",
			"is_error":    false,
			"duration_ms": 911.6,
		},
	})

	profileResult := map[string]any{
		"status": "success",
		"path":   "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/cimis_station_80_fresno_hourly.csv",
		"table":  "CIMIS Station 80 Fresno State hourly weather",
		"rows":   168,
		"columns": []any{
			map[string]any{"name": "observation_time", "dtype": "datetime"},
			map[string]any{"name": "air_temperature_f", "dtype": "float64"},
			map[string]any{"name": "relative_humidity_pct", "dtype": "float64"},
			map[string]any{"name": "wind_speed_mph", "dtype": "float64"},
		},
		"mean": 72.4,
		"min":  47.8,
		"max":  96.1,
	}
	profileBytes, _ := json.Marshal(profileResult)
	profileMsg, err := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			func() gact.Part {
				part := gact.NewToolResultPart(profileCallID, []gact.Part{
					gact.NewTextPart(string(profileBytes)),
				}, false)
				part.ToolName = "profile_csv_weather"
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
		Payload:   profileMsg,
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	plot, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	plotText, err := e.addPart(sessionID, plot.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, plot.ID, plotText.ID,
		"The hourly weather profile is ready. Next I am rendering a time-series visualization for temperature, humidity, and wind.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, plot.ID, plotText.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	plotCallID := "call_" + plot.ID[len(plot.ID)-8:] + "_plot"
	plotInput := map[string]any{
		"path":        "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/cimis_station_80_fresno_hourly.csv",
		"x_column":    "observation_time",
		"y_columns":   []any{"air_temperature_f", "relative_humidity_pct", "wind_speed_mph"},
		"output_path": "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/cimis_fresno_weather.png",
	}
	plotPart, err := e.addPart(sessionID, plot.ID, gact.NewToolCallPart(plotCallID, "plot_weather_timeseries", nil))
	if err != nil {
		return
	}
	plotInputBytes, _ := json.Marshal(plotInput)
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": plot.ID,
			"part_id":    plotPart.ID,
			"delta":      map[string]any{"input_json_append": string(plotInputBytes)},
		},
	})
	_, _ = e.store.UpdateMessagePart(plot.ID, plotPart.ID, func(p *gact.Part) {
		p.Input = plotInput
	})
	e.completePart(sessionID, plot.ID, plotPart.ID)
	e.completeMessage(sessionID, plot.ID, gact.StopReasonToolUse)

	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":   plotCallID,
			"tool_name": "plot_weather_timeseries",
		},
	})
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":     plotCallID,
			"tool_name":   "plot_weather_timeseries",
			"is_error":    false,
			"duration_ms": 1048.3,
		},
	})

	plotResult := map[string]any{
		"status":      "success",
		"output_path": "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/cimis_fresno_weather.png",
		"chart_type":  "time series",
		"x_column":    "observation_time",
		"y_column":    "air temperature, relative humidity, wind speed",
		"summary":     "Fresno CIMIS Station 80 hourly temperature, humidity, and wind visualization.",
	}
	plotBytes, _ := json.Marshal(plotResult)
	plotMsg, err := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			func() gact.Part {
				part := gact.NewToolResultPart(plotCallID, []gact.Part{
					gact.NewTextPart(string(plotBytes)),
				}, false)
				part.ToolName = "plot_weather_timeseries"
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
		Payload:   plotMsg,
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
		"Fresno CIMIS Station 80 weather data was profiled across 168 hourly rows, and cimis_fresno_weather.png is ready for demo discussion.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalPart.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

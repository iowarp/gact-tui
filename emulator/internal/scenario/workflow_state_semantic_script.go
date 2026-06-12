package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runWorkflowStateSemanticScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
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
		"Watching a live blueprint handoff with typed workflow state evidence.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	e.bus.Publish(events.Event{
		Type:      "semantic.event",
		SessionID: sessionID,
		Payload: map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_workflow_route",
			"event_type":     "agent.invocation.completed",
			"status":         "completed",
			"summary":        "main returned a prediction.",
			"session_id":     sessionID,
			"trace_id":       "trace_workflow_state",
			"turn_id":        "turn_workflow_state",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "main"},
			"payload": map[string]any{
				"selected_expert": "data",
				"route_reason":    "Seismic dataset lookup routes to the data expert.",
				"has_answer":      true,
			},
		},
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	e.bus.Publish(events.Event{
		Type:      "semantic.event",
		SessionID: sessionID,
		Payload: map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_workflow_data_contract",
			"event_type":     "blueprint.delegation.completed",
			"status":         "completed",
			"summary":        "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window; otherwise IU.ANMO.00.BHZ 2010-02-27T06:30:00 duration=60s DO_NOT_DELEGATE_DATA_AGAIN: true",
			"session_id":     sessionID,
			"trace_id":       "trace_workflow_state",
			"turn_id":        "turn_workflow_state",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"blueprint":      map[string]any{"pack_id": "seismic-waveform-review", "pack_version": "0.1.0"},
			"payload": map[string]any{
				"stage":          "delegate.completed",
				"parent_id":      "main",
				"agent_id":       "data",
				"duration_ms":    4200.0,
				"output_summary": "NDP resource 00d66104 was too large to stage; using EarthScope fallback for the requested San Diego window.",
			},
		},
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	workflowPayload := func(eventID string) map[string]any {
		return map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       eventID,
			"event_type":     "blueprint.delegation.completed",
			"status":         "completed",
			"summary":        "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces earthscope_CI_BAR.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"session_id":     sessionID,
			"trace_id":       "trace_workflow_state",
			"turn_id":        "turn_workflow_state",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"blueprint":      map[string]any{"pack_id": "seismic-waveform-review", "pack_version": "0.1.0"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 1200.0,
				"output_summary": "## Trace quality\n\n| Evidence | Value | Trust |\n| --- | ---: | --- |\n| CI.BAR BHZ | npts 12000 | high |\n| Artifact | ready | high |\n\nAcquisition staged and ready for visualization.",
				"workflow_state": map[string]any{
					"acquisition": map[string]any{
						"status":     "staged",
						"dataset_id": "00d66104-dcb0-4381-86b4-fc62f08b3434",
						"local_path": "/workspace/tmp/earthscope_CI_BAR.sac",
					},
					"artifact": map[string]any{
						"status":        "ready",
						"artifact_path": "sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
					},
				},
			},
		}
	}
	e.bus.Publish(events.Event{
		Type:      "semantic.event",
		SessionID: sessionID,
		Payload:   workflowPayload("sem_workflow_state_1"),
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "semantic.event",
		SessionID: sessionID,
		Payload: map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_workflow_stats",
			"event_type":     "tool.call.completed",
			"status":         "completed",
			"summary":        "Tool sac_compute_trace_statistics completed.",
			"session_id":     sessionID,
			"trace_id":       "trace_workflow_state",
			"turn_id":        "turn_workflow_state",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "analysis", "tool": "sac_compute_trace_statistics"},
			"subject":        map[string]any{"call_id": "call_workflow_stats", "agent_id": "analysis"},
			"payload": map[string]any{
				"tool":        "sac_compute_trace_statistics",
				"call_id":     "call_workflow_stats",
				"ok":          true,
				"duration_ms": 18.0,
				"filepath":    "/workspace/tmp/earthscope_CI_BAR.sac",
				"npts":        12000,
				"min":         -0.14,
				"max":         0.19,
				"mean":        0.003,
			},
		},
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "semantic.event",
		SessionID: sessionID,
		Payload:   workflowPayload("sem_workflow_state_duplicate"),
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
		"The workflow state stayed available as structured detail while the transcript showed the staged acquisition and ready artifact.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, body.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runWorkflowBlockerSemanticScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
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
		"Watching a live blueprint handoff where NDP staging reports a blocker before fallback.",
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
			"event_id":       "sem_workflow_blocker_1",
			"event_type":     "blueprint.delegation.completed",
			"status":         "completed",
			"summary":        "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window Blocker: resource_too_large - dataset ID 00d66104-dcb0-4381-86b4-fc62f08b3434, resource size 1503238553 bytes",
			"session_id":     sessionID,
			"trace_id":       "trace_workflow_blocker",
			"turn_id":        "turn_workflow_blocker",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"blueprint":      map[string]any{"pack_id": "seismic-waveform-review", "pack_version": "0.1.0"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "data",
				"duration_ms": 900.0,
			},
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
		"The NDP resource blocker stayed visible as workflow evidence, while the raw continuation contract remains behind detail.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, body.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

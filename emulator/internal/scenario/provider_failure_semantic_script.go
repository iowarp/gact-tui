package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func runProviderFailureSemanticScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
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
		"Starting a provider request that will fail before visible model output.",
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
			"event_id":       "sem_llm_provider_failed",
			"event_type":     "llm.request.failed",
			"status":         "failed",
			"summary":        "LLM request failed for main.",
			"session_id":     sessionID,
			"trace_id":       "trace_provider_failure",
			"turn_id":        "turn_provider_failure",
			"detail_level":   "semantic",
			"live_observed":  true,
			"actor":          map[string]any{"agent_id": "main", "role": "orchestrator"},
			"subject":        map[string]any{"message_id": "msg_asst_failed"},
			"blueprint":      map[string]any{"pack_id": "seismic-waveform-review", "pack_version": "0.1.0"},
			"provider": map[string]any{
				"provider_id": "argonne_sophia",
				"model_id":    "openai/gpt-oss-120b",
				"api_base":    "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			},
			"payload": map[string]any{
				"error_info": map[string]any{
					"error":   "provider_error",
					"message": "live streaming failed before emitting output: unhandled errors in a TaskGroup (1 sub-exception)",
					"metadata": map[string]any{
						"live_streaming": false,
						"stream_fallback": map[string]any{
							"category":    "provider_streaming_error",
							"description": "The live provider stream failed before emitting user-visible output.",
						},
					},
				},
			},
		},
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	e.publishStatus(sessionID, "failed")
}

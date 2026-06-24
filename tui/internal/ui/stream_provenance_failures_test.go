package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSemanticProviderFailureEventIsOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_provider_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "turn.failed",
			"status":         "failed",
			"summary":        "CLIO turn failed: provider_error.",
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
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic provider failure = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeError {
		t.Fatalf("provider failure should render as error: %#v", part)
	}
	for _, want := range []string{
		"Provider error:",
		"before visible output",
		"argonne_sophia",
		"openai/gpt-oss-120b",
	} {
		if !strings.Contains(part.Message, want) {
			t.Fatalf("provider failure message missing %q:\n%s", want, part.Message)
		}
	}
	if strings.Contains(part.Message, "CLIO turn failed: provider_error") {
		t.Fatalf("provider failure message kept generic summary:\n%s", part.Message)
	}

	ref := partDetailRef(a.conversation.messages[0].ID, part)
	for _, want := range []string{
		"Operator view",
		"failure: Provider error:",
		"fallback: provider_streaming_error: The live provider stream failed before emitting user-visible output.",
		"provider: argonne_sophia · openai/gpt-oss-120b",
		"endpoint: https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		"Event summary",
		"what happened: Provider error:",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("provider failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{"error_info:", "stream_fallback:", "api_base:", "provider_id:", "model_id:"} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("provider failure detail leaked raw metadata label %q:\n%s", unwanted, ref.fullText)
		}
	}
}

func TestSemanticFailedLLMRequestIsOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_llm_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "llm.request.failed",
			"status":         "failed",
			"summary":        "LLM request failed for main.",
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
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic LLM failure = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "llm.request.failed" {
		t.Fatalf("LLM failure should render as error: %#v", part)
	}
	for _, want := range []string{
		"Provider error:",
		"before visible output",
		"argonne_sophia",
		"openai/gpt-oss-120b",
	} {
		if !strings.Contains(part.Message, want) {
			t.Fatalf("LLM failure message missing %q:\n%s", want, part.Message)
		}
	}

	ref := partDetailRef(a.conversation.messages[0].ID, part)
	for _, want := range []string{
		"event: llm.request.failed",
		"failure: Provider error:",
		"fallback: provider_streaming_error: The live provider stream failed before emitting user-visible output.",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("LLM failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestSemanticLLMRequestProgressStaysOutOfDefaultTimeline(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_llm_started",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "llm.request.started",
			"status":         "running",
			"summary":        "LLM request started for main.",
			"provider":       map[string]any{"provider_id": "argonne_sophia", "model_id": "openai/gpt-oss-120b"},
		}},
	})

	if len(a.conversation.messages) != 0 {
		t.Fatalf("non-failed LLM request should remain detail/debug noise, got %#v", a.conversation.messages)
	}
}

func TestSemanticHookProgressHiddenButFailuresSurface(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_started",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "hook.invocation.started",
			"status":         "running",
			"summary":        "pre_message hook dispatch started.",
			"actor":          map[string]any{"hook": "pre_message"},
		}},
	})
	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_completed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"event_type":     "hook.invocation.completed",
			"status":         "completed",
			"summary":        "pre_message hook dispatch completed.",
			"actor":          map[string]any{"hook": "pre_message"},
		}},
	})
	if len(a.conversation.messages) != 0 {
		t.Fatalf("successful hook lifecycle should remain debug noise, got %#v", a.conversation.messages)
	}

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_hook_failed",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "hook.invocation.failed",
			"status":         "failed",
			"summary":        "pre_message hook dispatch failed.",
			"actor":          map[string]any{"hook": "pre_message"},
			"error_info": map[string]any{
				"error":   "hook_error",
				"message": "pre_message hook timed out after 30s",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("failed hook event should surface as one timeline error, got %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeError || part.Code != "hook.invocation.failed" {
		t.Fatalf("failed hook should render as semantic error: %#v", part)
	}
	if !strings.Contains(part.Message, "pre_message hook timed out after 30s") {
		t.Fatalf("hook failure message should keep actionable error text:\n%s", part.Message)
	}
	if strings.Contains(part.Message, "hook dispatch started") || strings.Contains(part.Message, "hook dispatch completed") {
		t.Fatalf("hook failure should not include successful lifecycle noise:\n%s", part.Message)
	}

	ref := partDetailRef(a.conversation.messages[0].ID, part)
	for _, want := range []string{
		"Operator view",
		"failure: Hook error: pre_message hook timed out after 30s.",
		"Event summary",
		"event: hook.invocation.failed",
		"trace: trace_1",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("hook failure detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestSemanticEventDetailRedactedToolInputStaysOperatorReadable(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "tool.call.started",
		Payload: map[string]any{"payload": map[string]any{
			"schema_version": "clio.semantic_event.v1",
			"event_id":       "sem_redacted",
			"session_id":     "s1",
			"turn_id":        "turn_1",
			"trace_id":       "trace_1",
			"event_type":     "tool.call.started",
			"status":         "running",
			"summary":        "SAC waveform visualization started.",
			"detail_level":   "semantic",
			"live_observed":  true,
			"occurred_at":    "2026-06-03T06:00:00Z",
			"actor":          map[string]any{"agent_id": "visualization", "tool": "sac_plot_traces"},
			"subject":        map[string]any{"call_id": "call_redacted"},
			"payload": map[string]any{
				"tool":         "sac_plot_traces",
				"call_id":      "call_redacted",
				"args_preview": "[redacted]",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("redacted semantic tool event = %#v", a.conversation.messages)
	}
	ref := partDetailRef(a.conversation.messages[0].ID, a.conversation.messages[0].Parts[0])
	for _, want := range []string{
		"Operator view",
		"input: input redacted by runtime",
		"Tool evidence",
		"tool: sac_plot_traces",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("redacted semantic detail missing %q:\n%s", want, ref.fullText)
		}
	}
	for _, unwanted := range []string{"[redacted]", "args preview:", "Payload"} {
		if strings.Contains(ref.fullText, unwanted) {
			t.Fatalf("redacted semantic detail leaked backend/redaction copy %q:\n%s", unwanted, ref.fullText)
		}
	}

	plain := ansi.Strip(DefaultTheme().renderMessage(a.conversation.messages[0], 96))
	if strings.Contains(plain, "input redacted by runtime") || strings.Contains(plain, "[redacted]") {
		t.Fatalf("inline transcript should not advertise redacted tool input:\n%s", plain)
	}
	if !strings.Contains(plain, "SAC waveform visualization()") {
		t.Fatalf("inline transcript should keep the tool progress row without redacted args:\n%s", plain)
	}
}

package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func sampleRuntimeProvenance() map[string]any {
	return map[string]any{
		"schema_version": "clio.runtime_provenance.v1",
		"turn": map[string]any{
			"trace_id":             "trace_1",
			"turn_id":              "turn_1",
			"user_message_id":      "u1",
			"assistant_message_id": "a1",
		},
		"workspace": map[string]any{
			"workspace_id": "ws_demo",
			"root_path":    "/workspace/demo",
		},
		"agent": map[string]any{
			"selected_agent_id": "data",
			"active_expert_id":  "ndp_catalog",
			"parent_id":         "data",
			"route_source":      "lm",
		},
		"blueprint": map[string]any{
			"id":              "marketplace-seismic",
			"version":         "1.0.0",
			"scope":           "workspace",
			"definition_path": "/workspace/demo/AGENT.md",
		},
		"provider": map[string]any{
			"provider_id": "alcf",
			"model_id":    "sophia",
		},
		"prompt": map[string]any{
			"prompt_id": "clio.expert.ndp_catalog",
			"profile":   "default",
		},
		"tools": map[string]any{
			"declared": []any{"ndp_search_datasets"},
			"observed": []any{map[string]any{
				"name":          "ndp_search_datasets",
				"status":        "success",
				"duration_ms":   1200.0,
				"server_id":     "ndp",
				"descriptor_id": "catalog",
			}},
		},
		"skills": map[string]any{
			"declared": []any{"domain.review_rubric"},
			"resolved": []any{map[string]any{
				"id":          "domain.review_rubric",
				"status":      "resolved",
				"source_path": "/workspace/demo/skills/review.md",
			}},
		},
		"delegation": map[string]any{
			"events": []any{
				map[string]any{"stage": "delegate.started", "parent_id": "orchestrator", "agent_id": "data", "depth": 1.0},
				map[string]any{"stage": "delegate.completed", "parent_id": "data", "agent_id": "ndp_catalog", "duration_ms": 96754.0},
				map[string]any{"stage": "parent.resumed", "parent_id": "orchestrator", "agent_id": "data"},
			},
		},
	}
}

func TestRuntimeProvenanceMetadataPromotesToReadablePart(t *testing.T) {
	msg := gact.Message{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "text",
			Type: gact.PartTypeText,
			Text: "Found candidate datasets.",
		}},
		Metadata: map[string]any{"runtime_provenance": sampleRuntimeProvenance()},
	}

	normalizeMessagePresentation(&msg)

	if len(msg.Parts) != 2 || msg.Parts[1].Type != partTypeRuntimeProvenance {
		t.Fatalf("parts after normalization = %#v", msg.Parts)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 110, nil))
	for _, want := range []string{"runtime provenance", "trace trace_1", "data -> ndp_catalog", "tools: ndp_search_datasets", "Ctrl+E"} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered provenance missing %q:\n%s", want, out)
		}
	}
}

func TestRuntimeProvenanceDetailIsStructured(t *testing.T) {
	msg := gact.Message{
		ID:       "m1",
		Role:     gact.RoleAssistant,
		Metadata: map[string]any{"runtime_provenance": sampleRuntimeProvenance()},
	}
	normalizeMessagePresentation(&msg)

	ref := partDetailRef(msg.ID, msg.Parts[0])
	for _, want := range []string{
		"Runtime provenance",
		"schema: clio.runtime_provenance.v1",
		"Turn",
		"trace_id: trace_1",
		"Workspace",
		"root_path: /workspace/demo",
		"Agent",
		"active_expert_id: ndp_catalog",
		"Blueprint",
		"marketplace-seismic",
		"Tools",
		"observed: ndp_search_datasets",
		"Skills",
		"domain.review_rubric",
		"Delegation",
		"parent.resumed",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("runtime provenance detail missing %q:\n%s", want, ref.fullText)
		}
	}
	if strings.Contains(ref.fullText, `\"runtime_provenance\"`) {
		t.Fatalf("detail should not be a raw escaped JSON wall:\n%s", ref.fullText)
	}
}

func TestRuntimeProvenanceDetailRendersContextArtifactsAndErrors(t *testing.T) {
	rp := sampleRuntimeProvenance()
	rp["memory"] = map[string]any{
		"policy":              "workspace",
		"policy_summary":      "session plus workspace search",
		"search_count":        2.0,
		"context_frame_count": 1.0,
	}
	rp["context"] = map[string]any{
		"status":           "prepared",
		"count":            1.0,
		"max_inline_bytes": 32768.0,
		"files": []any{map[string]any{
			"path":          "/workspace/demo/docs/plan.md",
			"mode":          "read",
			"status":        "prepared",
			"inline_policy": "inline_or_inspect",
			"language":      "markdown",
		}},
	}
	rp["artifacts"] = []any{map[string]any{
		"path":       "/workspace/demo/result.png",
		"kind":       "png",
		"status":     "verified",
		"size_bytes": 2048.0,
	}}
	rp["errors"] = []any{map[string]any{
		"code":    "provider_timeout",
		"message": "retry succeeded",
		"stage":   "child_expert",
	}}

	detail := runtimeProvenanceDetailText(rp)
	for _, want := range []string{
		"Memory",
		"policy_summary: session plus workspace search",
		"Context",
		"status: prepared",
		"files:",
		"path=/workspace/demo/docs/plan.md",
		"inline_policy=inline_or_inspect",
		"Artifacts",
		"path=/workspace/demo/result.png",
		"size_bytes=2048",
		"Errors",
		"code=provider_timeout",
		"message=retry succeeded",
	} {
		if !strings.Contains(detail, want) {
			t.Fatalf("runtime provenance detail missing %q:\n%s", want, detail)
		}
	}
	if strings.Contains(detail, `\"path\"`) {
		t.Fatalf("detail should render rows, not escaped JSON blobs:\n%s", detail)
	}
}

func TestRuntimeProvenanceDetailRendersNamedArtifactAndErrorRows(t *testing.T) {
	rp := sampleRuntimeProvenance()
	rp["artifacts"] = map[string]any{
		"items": []any{map[string]any{
			"path":   "plots/waveform.png",
			"status": "proposed",
		}},
	}
	rp["errors"] = map[string]any{
		"rows": []any{map[string]any{
			"type":        "tool",
			"tool_name":   "ndp_search_datasets",
			"recoverable": true,
		}},
	}

	detail := runtimeProvenanceDetailText(rp)
	for _, want := range []string{
		"Artifacts",
		"path=plots/waveform.png",
		"Errors",
		"tool_name=ndp_search_datasets",
		"recoverable=true",
	} {
		if !strings.Contains(detail, want) {
			t.Fatalf("runtime provenance detail missing %q:\n%s", want, detail)
		}
	}
}

func TestRuntimeProvenanceMakesMetadataOnlyAssistantRenderable(t *testing.T) {
	msg := gact.Message{
		ID:       "m1",
		Role:     gact.RoleAssistant,
		Metadata: map[string]any{"runtime_provenance": sampleRuntimeProvenance()},
	}
	if !shouldRenderConversationMessage(msg) {
		t.Fatal("runtime provenance metadata should make assistant message renderable")
	}
}

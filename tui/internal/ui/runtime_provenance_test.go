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

package ui

import "testing"

func TestMapReferencesAgentFindsNestedAgentReferences(t *testing.T) {
	payload := map[string]any{
		"agent": map[string]any{
			"events": []any{
				map[string]any{"agent": map[string]any{"id": "geospatial"}},
				map[string]any{"dispatch_target": "data"},
			},
		},
	}
	for _, agent := range []string{"geospatial", "data"} {
		if !mapReferencesAgent(payload, agent) {
			t.Fatalf("expected payload to reference %q", agent)
		}
	}
}

func TestMapReferencesAgentRequiresExactAgentID(t *testing.T) {
	payload := map[string]any{
		"agent_id": "data_pipeline",
		"subject":  map[string]any{"agent_id": "metadata"},
	}
	if mapReferencesAgent(payload, "data") {
		t.Fatal("agent reference matching should require an exact identifier")
	}
}

func TestMapReferencesAgentStopsAtDepthLimit(t *testing.T) {
	payload := map[string]any{
		"agent": map[string]any{
			"nested": map[string]any{
				"nested": map[string]any{
					"nested": map[string]any{
						"nested": map[string]any{
							"nested": map[string]any{
								"nested": map[string]any{
									"agent_id": "too_deep",
								},
							},
						},
					},
				},
			},
		},
	}
	if mapReferencesAgent(payload, "too_deep") {
		t.Fatal("deeply nested payload should respect recursion guard")
	}
}

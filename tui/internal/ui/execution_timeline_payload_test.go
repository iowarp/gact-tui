package ui

import "testing"

func TestExecutionSemanticPayloadHelpers(t *testing.T) {
	payload := map[string]any{
		"actor":   map[string]any{"agent_id": " data "},
		"subject": map[string]any{"agent_id": " ndp_dataset_discovery "},
		"payload": map[string]any{"expert_id": " geospatial "},
	}

	if got := executionActorAgentID(payload); got != "data" {
		t.Fatalf("actor agent = %q, want data", got)
	}
	if got := executionSubjectAgentID(payload); got != "ndp_dataset_discovery" {
		t.Fatalf("subject agent = %q, want ndp_dataset_discovery", got)
	}
	if got := executionExpertID(payload); got != "geospatial" {
		t.Fatalf("expert id = %q, want geospatial", got)
	}
}

func TestExecutionExpertIDFallsBackToActor(t *testing.T) {
	payload := map[string]any{
		"actor": map[string]any{"agent_id": "main"},
	}
	if got := executionExpertID(payload); got != "main" {
		t.Fatalf("expert id fallback = %q, want main", got)
	}
}

func TestExecutionToolEventSuppressionByReactSteps(t *testing.T) {
	if executionToolEventSuppressedByReactSteps(nil, map[string]any{"parent_span_id": "step-1"}) {
		t.Fatal("legacy tool event should render when no react steps were captured")
	}
	spans := map[string]bool{"step-1": true}
	if !executionToolEventSuppressedByReactSteps(spans, map[string]any{"parent_span_id": "step-1"}) {
		t.Fatal("tool event under a rendered react step should be suppressed")
	}
	if !executionToolEventSuppressedByReactSteps(spans, map[string]any{}) {
		t.Fatal("uncorrelated tool event should be suppressed once react steps exist")
	}
	if !executionToolEventSuppressedByReactSteps(spans, map[string]any{"parent_span_id": "other"}) {
		t.Fatal("mixed streams should suppress all standalone tool events once react steps exist")
	}
}

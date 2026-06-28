package ui

import "testing"

func TestExecutionHandoffNodeFromPayload(t *testing.T) {
	node := executionHandoffNodeFromPayload(map[string]any{
		"summary": "delegating",
		"payload": map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "[redacted]:83 chars",
			"status":      "running",
		},
	}, map[string]string{
		"main->geospatial": "Resolve San Diego to coordinates.",
	})

	if node.Kind != executionNodeHandoff || node.ParentAgent != "main" || node.Agent != "geospatial" {
		t.Fatalf("handoff node identity mismatch: %+v", node)
	}
	if node.Question != "Resolve San Diego to coordinates." {
		t.Fatalf("handoff redacted question fallback mismatch: %+v", node)
	}
	if node.Status != "running" || node.Summary != "delegating" || node.Depth != 1 {
		t.Fatalf("handoff node status/summary/depth mismatch: %+v", node)
	}
}

func TestExecutionReactStepNodeFromPayload(t *testing.T) {
	node := executionReactStepNodeFromPayload(map[string]any{
		"summary": "searched NDP",
		"payload": map[string]any{
			"expert_id":   "ndp_dataset_discovery",
			"step_index":  1,
			"thought":     " Stage the catalog. ",
			"reasoning":   " raw reasoning ",
			"tool_name":   "ndp_stage_resource",
			"tool_args":   map[string]any{"url": "earthscope_converted_data.csv"},
			"observation": map[string]any{"local_path": "/tmp/earthscope_converted_data.csv"},
		},
	})

	if node.Kind != executionNodeReactStep || node.Agent != "ndp_dataset_discovery" {
		t.Fatalf("react node identity mismatch: %+v", node)
	}
	if node.StepIndex != 1 || node.ToolName != "ndp_stage_resource" {
		t.Fatalf("react node step/tool mismatch: %+v", node)
	}
	if node.Thinking != "Stage the catalog." || node.Reasoning != "raw reasoning" {
		t.Fatalf("react node text mismatch: %+v", node)
	}
	if node.Summary != "searched NDP" || node.Depth != 2 {
		t.Fatalf("react node summary/depth mismatch: %+v", node)
	}
}

func TestExecutionExpertExtractNodeFromPayload(t *testing.T) {
	node := executionExpertExtractNodeFromPayload(map[string]any{
		"payload": map[string]any{
			"expert_id":      "geospatial",
			"output":         "Resolved San Diego.",
			"reasoning":      " checked coordinate source ",
			"result_summary": "resolved region",
			"structured":     map[string]any{"center_lat": 32.7174202},
		},
	})

	if node.Kind != executionNodeExpertReport || node.Agent != "geospatial" {
		t.Fatalf("extract node identity mismatch: %+v", node)
	}
	if node.Text != "Resolved San Diego." || node.Reasoning != "checked coordinate source" {
		t.Fatalf("extract node text mismatch: %+v", node)
	}
	if node.Summary != "resolved region" || node.Structured == nil {
		t.Fatalf("extract node summary/structured mismatch: %+v", node)
	}
}

func TestExecutionDelegationReportNodeFromPayload(t *testing.T) {
	node := executionDelegationReportNodeFromPayload(map[string]any{
		"payload": map[string]any{
			"delegate_to":    "data",
			"return_to":      "main",
			"output_summary": "catalog staged",
			"status":         "completed",
		},
	})

	if node.Kind != executionNodeExpertReport || node.Agent != "data" || node.ParentAgent != "main" {
		t.Fatalf("delegation report identity mismatch: %+v", node)
	}
	if node.Text != "catalog staged" || node.Status != "completed" || node.Depth != 1 {
		t.Fatalf("delegation report content mismatch: %+v", node)
	}
}

func TestExecutionToolNodesFromPayload(t *testing.T) {
	started := executionToolStartedNodeFromPayload(map[string]any{
		"actor": map[string]any{"agent_id": "utility"},
		"payload": map[string]any{
			"tool_name": "shell_bash",
			"args":      map[string]any{"command": "cut -d, -f1-3"},
			"call_id":   "call-1",
		},
	})
	if started.Kind != executionNodeToolRun || started.Status != "running" || started.Agent != "utility" {
		t.Fatalf("started tool node mismatch: %+v", started)
	}
	if started.ToolName != "shell_bash" || started.CallID != "call-1" || started.ToolArgs == nil {
		t.Fatalf("started tool payload mismatch: %+v", started)
	}

	completed := executionToolCompletedNodeFromPayload(map[string]any{
		"summary": "prepared clean catalog",
		"actor":   map[string]any{"agent_id": "utility"},
		"payload": map[string]any{
			"tool_name": "shell_bash",
			"result":    map[string]any{"exit_code": 0},
			"status":    "completed",
			"call_id":   "call-1",
		},
	})
	if completed.Kind != executionNodeToolRun || completed.Status != "completed" || completed.Agent != "utility" {
		t.Fatalf("completed tool node mismatch: %+v", completed)
	}
	if completed.ToolName != "shell_bash" || completed.CallID != "call-1" || completed.Observation == nil {
		t.Fatalf("completed tool payload mismatch: %+v", completed)
	}
	if completed.Summary != "prepared clean catalog" {
		t.Fatalf("completed tool summary mismatch: %+v", completed)
	}
}

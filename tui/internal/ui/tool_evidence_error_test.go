package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestToolEvidenceErrorResultRendersStructuredSummary(t *testing.T) {
	msg := gact.Message{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: "The file is unavailable."}},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "hdf5_list_datasets",
					"args": map[string]any{"filepath": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5"},
					"ok":   true,
					"result": map[string]any{
						"ok": false,
						"error": map[string]any{
							"code":        "file_not_found",
							"field":       "filepath",
							"message":     "File does not exist: /home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5",
							"next_action": "Provide an existing file inside an allowed root.",
							"path":        "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5",
							"tool":        "hdf5_list_datasets",
						},
					},
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	foundErrorResult := false
	for _, part := range msg.Parts {
		if part.Type == gact.PartTypeToolResult && part.IsError {
			foundErrorResult = true
		}
	}
	if !foundErrorResult {
		t.Fatal("tool evidence result with nested ok=false/error should be marked as IsError")
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"(error)",
		"error result:",
		"code: file_not_found",
		"message: File does not exist:",
		"path: .../clio-benchmark-data/missing_fusion_run.h5",
		"next action: Provide an existing file",
		"Ctrl+E",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("structured error summary missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) || strings.Contains(out, `"next_action"`) {
		t.Fatalf("inline error summary should not be raw JSON:\n%s", out)
	}
}

func TestMessageErrorInfoPromotesToExpandableErrorPart(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "answer",
			Type: gact.PartTypeText,
			Text: "Chart saved.",
		}},
		ErrorInfo: &gact.ErrorInfo{
			Error:       "tool_error",
			Message:     "Column 'event_status' not found. Available: ['event_id', 'status']",
			Recoverable: true,
			Details: map[string]any{
				"tool": "plot_bar_chart",
				"tool_error": map[string]any{
					"next_action": "Retry with the status column.",
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	if len(msg.Parts) < 2 || msg.Parts[0].Type != gact.PartTypeError || msg.Parts[1].Type != gact.PartTypeText {
		t.Fatalf("message error_info should be inserted before final text: %#v", msg.Parts)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"✗ tool_error",
		"Column 'event_status' not found.",
		"error detail",
		"Ctrl+E",
		"partial answer after surfaced error",
		"Chart saved.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("message error_info render missing %q:\n%s", want, out)
		}
	}
	ref := partDetailRef("msg", msg.Parts[0])
	for _, want := range []string{
		"kind: error",
		"code: tool_error",
		"recoverable: true",
		"Column 'event_status' not found",
		"plot_bar_chart",
		"Retry with the status column.",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("message error detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestStopReasonErrorMarksFinalTextAsPartial(t *testing.T) {
	msg := gact.Message{
		Role:       gact.RoleAssistant,
		StopReason: gact.StopReasonError,
		Parts: []gact.Part{
			{
				ID:   "handoff",
				Type: gact.PartTypeExpertHandoff,
				Text: "visualization | partial | planner",
				Metadata: map[string]any{
					"agent_id":       "visualization",
					"stage":          "planner",
					"status":         "partial",
					"output_summary": "Agent planner reached the step limit after partial observations.",
				},
			},
			{
				ID:   "answer",
				Type: gact.PartTypeText,
				Text: "Scatter plot saved.",
			},
		},
	}

	normalizeMessagePresentation(&msg)
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	if !strings.Contains(out, "partial answer after surfaced error") {
		t.Fatalf("stop_reason=error final text should be explicitly marked partial:\n%s", out)
	}
}

func TestExpertHandoffFailureShowsParsedErrorSummary(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "data | failure | direct_tool",
		Metadata: map[string]any{
			"agent_id":    "data",
			"stage":       "direct_tool",
			"status":      "failure",
			"duration_ms": 4.0,
			"error":       `{"error":{"code":"file_not_found","message":"File does not exist: /home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5","next_action":"Provide an existing file inside an allowed root.","path":"/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5","tool":"hdf5_list_datasets"}}`,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{
		"✗ data",
		"failure",
		"direct_tool",
		"error result:",
		"code: file_not_found",
		"next action: Provide an existing file",
	} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("failed handoff should surface parsed error summary %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) {
		t.Fatalf("failed handoff should not show raw error JSON inline:\n%s", out)
	}
}

func TestExpertHandoffPartialJSONShowsReadableSummary(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "visualization | partial | planner",
		Metadata: map[string]any{
			"agent_id":       "visualization",
			"stage":          "planner",
			"status":         "partial",
			"output_summary": `{"error":"routing_error","message":"Agent planner reached the step limit after partial observations.","details":{"partial":true,"stage":"step_limit_after_observations","step_limit":12,"recovery_actions":["retry","reconfigure_provider","exit"]},"recoverable":true}`,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	for _, want := range []string{
		"visualization",
		"partial",
		"status: routing_error",
		"message: Agent planner reached the step limit",
		"stage: step_limit_after_observations",
		"step limit: 12",
		"recovery: retry, reconfigure_provider, exit",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("partial handoff should surface readable summary %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) || strings.Contains(out, `"recoverable"`) {
		t.Fatalf("partial handoff should not show raw JSON inline:\n%s", out)
	}
}

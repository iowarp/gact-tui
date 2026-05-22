package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRenderAssistantToolEvidenceFromMetadata(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "I inspected the file."},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name":             "hdf5_list_datasets",
					"args":             map[string]any{"path": "run.h5"},
					"result":           []any{"/entry/current", "/entry/voltage"},
					"ok":               true,
					"duration_ms":      18.0,
					"telemetry_source": "live_observer",
				},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	for _, want := range []string{
		"Tool evidence",
		"summary metadata; no live tool transcript was sent",
		"hdf5_list_datasets",
		`{"path":"run.h5"}`,
		"live_observer",
		"18ms",
		`result: ["/entry/current","/entry/voltage"]`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered tool evidence missing %q:\n%s", want, out)
		}
	}
}

func TestStructuredToolCallsDoNotRenderDuplicateToolEvidence(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				Type:     gact.PartTypeToolCall,
				CallID:   "call_1",
				ToolName: "hdf5_list_datasets",
				Input:    map[string]any{"path": "run.h5"},
			},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{"name": "hdf5_list_datasets"},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	if strings.Contains(out, "Tool evidence") {
		t.Fatalf("structured tool call should not duplicate metadata evidence:\n%s", out)
	}
	if !strings.Contains(out, "Hdf5ListDatasets") {
		t.Fatalf("structured tool call itself should still render:\n%s", out)
	}
}

func TestMessageCompletedMergesToolEvidenceMetadata(t *testing.T) {
	a := &App{
		messages: []gact.Message{
			{
				ID:    "asst_1",
				Role:  gact.RoleAssistant,
				Parts: []gact.Part{{Type: gact.PartTypeText, Text: "done"}},
			},
		},
	}

	a.applySSE(client.SSEEvent{
		Type: "message.completed",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id": "asst_1",
				"metadata": map[string]any{
					"tools_called": []any{
						map[string]any{
							"name":             "parquet_compute_statistics",
							"telemetry_source": "agent_trace",
						},
					},
				},
			},
		},
	})

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(a.messages[0], nil, 100, nil))
	if !strings.Contains(out, "Tool evidence") ||
		!strings.Contains(out, "parquet_compute_statistics") ||
		!strings.Contains(out, "agent_trace") {
		t.Fatalf("message.completed metadata was not rendered:\n%s", out)
	}
}

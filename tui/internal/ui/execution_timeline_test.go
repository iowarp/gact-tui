package ui

import (
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestProjectExecutionTimelineInterleavesMainGeoDataNDP(t *testing.T) {
	events := executionTimelineFixtureMainGeoDataNDP()

	nodes := projectExecutionTimeline(events)
	var got []string
	for _, node := range nodes {
		got = append(got, nodeSignature(node))
	}

	want := []string{
		"text:main",
		"handoff:main->geospatial",
		"step:geospatial:0:geo_geocode",
		"step:geospatial:1:finish",
		"report:geospatial->main",
		"text:main",
		"handoff:main->data",
		"text:data",
		"handoff:data->ndp_dataset_discovery",
		"step:ndp_dataset_discovery:0:ndp_search_datasets",
		"step:ndp_dataset_discovery:1:ndp_stage_resource",
		"report:ndp_dataset_discovery->data",
		"text:data",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("timeline order mismatch\nwant:\n%s\n\ngot:\n%s", strings.Join(want, "\n"), strings.Join(got, "\n"))
	}

	if nodes[1].Question == "" || strings.Contains(nodes[1].Question, "[redacted]") {
		t.Fatalf("geospatial handoff question was not merged from live part: %#v", nodes[1])
	}
	if nodes[8].Question == "" || strings.Contains(nodes[8].Question, "[redacted]") {
		t.Fatalf("ndp handoff question was not merged from live part: %#v", nodes[8])
	}
	assertNodeTextContains(t, nodes[0], "locate the nearest EarthScope station to San Diego")
	assertNodeTextContains(t, nodes[5], "The region for San Diego has been resolved")
	assertNodeTextContains(t, nodes[7], "data acquisition process for San Diego")
	assertNodeTextContains(t, nodes[12], "metadata catalog has been staged")
}

func TestProjectExecutionTimelineDedupsRepeatedHandoffAndOverlappedText(t *testing.T) {
	events := []executionTimelineEvent{
		deltaEvent(1, "The"),
		deltaEvent(2, "The workflow has identified the target region."),
		semanticEventWithTurn(3, "turn-one", "blueprint.delegation.started", "main", "synthesis", map[string]any{
			"parent_id":   "main",
			"delegate_to": "synthesis",
			"question":    "Synthesize the final answer.",
			"status":      "running",
		}),
		semanticEventWithTurn(4, "turn-one", "blueprint.delegation.started", "main", "synthesis", map[string]any{
			"parent_id":   "main",
			"delegate_to": "synthesis",
			"question":    "Synthesize the final answer.",
			"status":      "running",
		}),
	}

	rendered := ansi.Strip(DefaultTheme().renderExecutionTimeline(projectExecutionTimeline(events), 100))
	if strings.Contains(rendered, "TheThe") {
		t.Fatalf("overlapped text was not normalized:\n%s", rendered)
	}
	if count := strings.Count(rendered, "→ delegates to synthesis"); count != 1 {
		t.Fatalf("handoff count = %d, want 1:\n%s", count, rendered)
	}
}

func TestProjectExecutionTimelineDedupsDuplicateAssistantTextAcrossHandoff(t *testing.T) {
	textBad := "I am initiating the process to find the nearest GNSS station to San Diego andgenerate a plot of its data. First, I will resolve the geographic coordinates for San Diego."
	textGood := "I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego."
	events := []executionTimelineEvent{
		deltaEvent(1, textBad),
		semanticEventWithTurn(2, "turn-one", "blueprint.delegation.started", "main", "geospatial", map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "Resolve San Diego.",
			"status":      "running",
		}),
		{Sequence: 3, Type: "message.part.added", Part: &gact.Part{Type: gact.PartTypeText, Text: textGood}},
	}

	rendered := ansi.Strip(DefaultTheme().renderExecutionTimeline(projectExecutionTimeline(events), 120))
	if got := strings.Count(rendered, "I am initiating the process"); got != 1 {
		t.Fatalf("expected one assistant prose block, got %d:\n%s", got, rendered)
	}
	if strings.Contains(rendered, "andgenerate") {
		t.Fatalf("worse duplicate text was retained:\n%s", rendered)
	}
	if !strings.Contains(rendered, "and generate") {
		t.Fatalf("better duplicate text was not retained:\n%s", rendered)
	}
}

func TestRecordExecutionSSESkipsLiveTextPartAdded(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{ID: "msg_user_1", SessionID: "s1", Role: gact.RoleUser}}
	a.execution.recordSSE(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":    "s1",
			"turn_id":       "msg_user_1",
			"message_id":    "msg_asst_1",
			"stream_source": "live",
			"part": map[string]any{
				"id":   "part_1",
				"type": "text",
				"text": "This is already represented by deltas.",
			},
		}},
	})
	if got := len(a.execution.executionEventsBySession["s1"]); got != 0 {
		t.Fatalf("live text part added should not be recorded, got %d events", got)
	}
	a.execution.recordSSE(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{"payload": map[string]any{
			"session_id":    "s1",
			"turn_id":       "msg_user_1",
			"message_id":    "msg_asst_1",
			"stream_source": "batch",
			"part": map[string]any{
				"id":   "part_1",
				"type": "text",
				"text": "Batch text should be recorded.",
			},
		}},
	})
	if got := len(a.execution.executionEventsBySession["s1"]); got != 1 {
		t.Fatalf("batch text part added should be recorded, got %d events", got)
	}
}

func TestProjectExecutionTimelineSuppressesNoAnswerPlaceholder(t *testing.T) {
	events := []executionTimelineEvent{
		deltaEvent(1, "*No answer yet – awaiting geospatial resolution of “San Diego”.*"),
		semanticEventWithTurn(2, "turn-one", "blueprint.delegation.started", "main", "geospatial", map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "Resolve San Diego.",
			"status":      "running",
		}),
	}

	rendered := ansi.Strip(DefaultTheme().renderExecutionTimeline(projectExecutionTimeline(events), 100))
	if strings.Contains(rendered, "No answer yet") {
		t.Fatalf("placeholder leaked into transcript:\n%s", rendered)
	}
	if !strings.Contains(rendered, "→ delegates to geospatial") {
		t.Fatalf("real handoff was removed with placeholder:\n%s", rendered)
	}
}

func TestProjectExecutionTimelineExtractReplacesPriorDelegationReport(t *testing.T) {
	events := []executionTimelineEvent{
		semanticEvent(1, "blueprint.delegation.completed", "visualization", "main", map[string]any{
			"delegate_to":    "visualization",
			"return_to":      "main",
			"output_summary": "workflow_state map[artifact:map[path:/tmp/plot.png]]",
			"status":         "completed",
		}),
		semanticEvent(2, "expert.extract.completed", "visualization", "main", map[string]any{
			"expert_id": "visualization",
			"output":    "Generated plot.",
			"structured": map[string]any{
				"workflow_state": map[string]any{
					"artifact": map[string]any{
						"kind":    "gnss_timeseries_plot",
						"path":    "/tmp/plot.png",
						"columns": []any{"east", "north", "up"},
						"status":  "ready",
					},
				},
			},
		}),
	}

	nodes := projectExecutionTimeline(events)
	var reports []executionTimelineNode
	for _, node := range nodes {
		if node.Kind == executionNodeExpertReport && node.Agent == "visualization" {
			reports = append(reports, node)
		}
	}
	if len(reports) != 1 {
		t.Fatalf("expected one visualization report, got %d: %#v", len(reports), nodes)
	}
	rendered := ansi.Strip(DefaultTheme().renderExecutionExpertReport(reports[0], 120))
	if strings.Contains(rendered, "map[") {
		t.Fatalf("raw compact delegation report was not replaced:\n%s", rendered)
	}
	if !strings.Contains(rendered, "gnss_timeseries_plot") || !strings.Contains(rendered, "plot.png") {
		t.Fatalf("rich extract report not rendered:\n%s", rendered)
	}
}

func executionTimelineFixtureMainGeoDataNDP() []executionTimelineEvent {
	return []executionTimelineEvent{
		deltaEvent(1, "I am initiating the workflow to locate the nearest EarthScope station to San Diego, stage its data, perform an analysis, and generate a visualization. I will start by resolving the geographic coordinates for San Diego."),
		semanticEvent(2, "blueprint.delegation.started", "main", "geospatial", map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "[redacted]:123 chars",
			"status":      "running",
		}),
		handoffPartEvent(3, "main", "geospatial", "Resolve the place name \"San Diego\" into coordinates (latitude, longitude) and define a search region for station discovery."),
		semanticEvent(4, "react.step.completed", "geospatial", "", map[string]any{
			"expert_id":   "geospatial",
			"step_index":  0,
			"thought":     "The user wants to resolve the place name \"San Diego\" into coordinates and a search region.",
			"tool_name":   "geo_geocode",
			"tool_args":   map[string]any{"query": "San Diego", "countrycodes": "us", "limit": 1},
			"observation": "[{'display_name': 'San Diego, San Diego County, California, United States', 'lat': 32.7174202, 'lon': -117.162772, 'provenance': 'osm_nominatim'}]",
		}),
		semanticEvent(5, "react.step.completed", "geospatial", "", map[string]any{
			"expert_id":   "geospatial",
			"step_index":  1,
			"thought":     "I have successfully retrieved the coordinates and bounding box for \"San Diego\" using the `geo_geocode` tool.",
			"tool_name":   "finish",
			"is_finish":   true,
			"observation": "Completed.",
		}),
		semanticEvent(6, "blueprint.delegation.completed", "geospatial", "main", map[string]any{
			"parent_id":      "main",
			"delegate_to":    "geospatial",
			"return_to":      "main",
			"status":         "completed",
			"output_summary": "resolved region · center 32.72, -117.2 · radius 100 km · confidence high",
		}),
		deltaEvent(7, "The region for San Diego has been resolved. I am now proceeding to discover the nearest EarthScope GNSS station and stage its time-series data for analysis."),
		semanticEvent(8, "blueprint.delegation.started", "main", "data", map[string]any{
			"parent_id":   "main",
			"delegate_to": "data",
			"question":    "[redacted]:226 chars",
			"status":      "running",
		}),
		handoffPartEvent(9, "main", "data", "Using the resolved coordinates for San Diego (32.7174202, -117.162772) and the 100km radius, discover the nearest EarthScope/NDP GNSS station, rank candidates by distance, and stage the time-series CSV for the nearest station."),
		deltaEvent(10, "I am initiating the data acquisition process for San Diego. The first step is to discover and stage the EarthScope station metadata catalog from the NDP."),
		semanticEvent(11, "blueprint.delegation.started", "data", "ndp_dataset_discovery", map[string]any{
			"parent_id":   "data",
			"delegate_to": "ndp_dataset_discovery",
			"question":    "[redacted]:160 chars",
			"status":      "running",
		}),
		handoffPartEvent(12, "data", "ndp_dataset_discovery", "Search the NDP for the EarthScope GNSS station metadata catalog and stage the CSV file to provide a metadata path for spatial filtering in the San Diego region."),
		semanticEvent(13, "react.step.completed", "ndp_dataset_discovery", "", map[string]any{
			"expert_id":   "ndp_dataset_discovery",
			"step_index":  0,
			"thought":     "Search for the dataset using the exact search terms provided.",
			"tool_name":   "ndp_search_datasets",
			"tool_args":   map[string]any{"search_terms": []any{"earthscope", "converted"}, "limit": 10},
			"observation": `{"count":1,"datasets":[{"title":"EarthScope Stations Dataset","resource":"earthscope_converted_data.csv"}]}`,
		}),
		semanticEvent(14, "react.step.completed", "ndp_dataset_discovery", "", map[string]any{
			"expert_id":   "ndp_dataset_discovery",
			"step_index":  1,
			"thought":     "Now I proceed to Step 2: stage this catalog by URL to the Active workspace root.",
			"tool_name":   "ndp_stage_resource",
			"tool_args":   map[string]any{"url": "earthscope_converted_data.csv"},
			"observation": `{"ok":true,"local_path":"/tmp/gact-tui-audit/earthscope_converted_data.csv","size_bytes":153082}`,
		}),
		semanticEvent(15, "blueprint.delegation.completed", "ndp_dataset_discovery", "data", map[string]any{
			"parent_id":      "data",
			"delegate_to":    "ndp_dataset_discovery",
			"return_to":      "data",
			"status":         "completed",
			"output_summary": "staged catalog · earthscope_converted_data.csv · ready for spatial filtering",
		}),
		deltaEvent(16, "The EarthScope station metadata catalog has been staged and is ready for spatial filtering."),
	}
}

func deltaEvent(sequence int, text string) executionTimelineEvent {
	return executionTimelineEvent{
		Sequence: sequence,
		Type:     "message.part.delta",
		Payload: map[string]any{
			"delta": map[string]any{"text_append": text},
		},
	}
}

func handoffPartEvent(sequence int, parent string, agent string, question string) executionTimelineEvent {
	return executionTimelineEvent{
		Sequence: sequence,
		Type:     "message.part.added",
		Part: &gact.Part{
			Type: gact.PartTypeExpertHandoff,
			Metadata: map[string]any{
				"parent_id": parent,
				"agent_id":  agent,
				"question":  question,
			},
		},
	}
}

func semanticEvent(sequence int, eventType string, actor string, subject string, payload map[string]any) executionTimelineEvent {
	return semanticEventWithTurn(sequence, "", eventType, actor, subject, payload)
}

func semanticEventWithTurn(sequence int, turnID string, eventType string, actor string, subject string, payload map[string]any) executionTimelineEvent {
	return executionTimelineEvent{
		Sequence: sequence,
		Type:     eventType,
		TurnID:   turnID,
		Payload: map[string]any{
			"event_type": eventType,
			"status":     firstNonEmpty(stringValue(payload["status"]), "completed"),
			"summary":    semanticTestSummary(eventType, actor, subject),
			"actor":      map[string]any{"agent_id": actor},
			"subject":    map[string]any{"agent_id": subject},
			"payload":    payload,
		},
	}
}

func semanticTestSummary(eventType string, actor string, subject string) string {
	switch eventType {
	case "blueprint.delegation.started":
		return actor + " delegated sync work to " + subject + "."
	case "blueprint.delegation.completed":
		return actor + " returned a compact result to " + subject + "."
	default:
		return eventType
	}
}

func nodeSignature(node executionTimelineNode) string {
	switch node.Kind {
	case executionNodeAssistantText:
		return "text:" + node.Agent
	case executionNodeHandoff:
		return "handoff:" + node.ParentAgent + "->" + node.Agent
	case executionNodeReactStep:
		return "step:" + node.Agent + ":" + strconv.Itoa(node.StepIndex) + ":" + node.ToolName
	case executionNodeExpertReport:
		return "report:" + node.Agent + "->" + node.ParentAgent
	default:
		return string(node.Kind)
	}
}

func assertNodeTextContains(t *testing.T, node executionTimelineNode, want string) {
	t.Helper()
	if !strings.Contains(node.Text, want) {
		t.Fatalf("node text missing %q: %#v", want, node)
	}
}

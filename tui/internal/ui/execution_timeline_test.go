package ui

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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

func TestRenderProjectedExecutionConversationUsesOneAssistantTurn(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.selected = 0
	a.currentStatus = gact.StatusRunning
	a.messages = []gact.Message{{
		ID:        "msg_user_d8da77ab69d0",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts: []gact.Part{{
			ID:   "part_user",
			Type: gact.PartTypeText,
			Text: "Find the nearest station to San Diego on earthscope, download and analyze the data and plot it",
		}},
	}}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": executionTimelineFixtureMainGeoDataNDP()}

	rendered := ansi.Strip(a.renderBody(120, 90))
	if count := strings.Count(rendered, "ASSISTANT"); count != 1 {
		t.Fatalf("assistant header count = %d, want 1\n%s", count, rendered)
	}
	for _, want := range []string{
		"main",
		"↳ main → geospatial",
		"The user wants to resolve the place name",
		"Geocode location(countrycodes: us · limit: 1 · query: San Diego)",
		"San Diego, San Diego County, California, United States",
		"geospatial returned evidence",
		"↳ main → data",
		"data",
		"↳ data → ndp_dataset_discovery",
		"NDP catalog search",
		"earthscope_converted_data.csv",
		"ndp_dataset_discovery returned evidence",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered transcript missing %q:\n%s", want, rendered)
		}
	}
	for _, bad := range []string{"[redacted]", "running now", "step 0 ·", "step 1 ·"} {
		if strings.Contains(rendered, bad) {
			t.Fatalf("rendered transcript contains %q:\n%s", bad, rendered)
		}
	}
}

func TestRenderProjectedExecutionConversationScopesAssistantDeltasWithoutTurnID(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.selected = 0
	a.currentStatus = gact.StatusRunning
	a.messages = []gact.Message{
		{
			ID:        "msg_user_1",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "Can you find the nearest station to san diego and plot its data?"}},
		},
		{
			ID:        "semantic_live_" + stableIDFragment("msg_user_1"),
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Metadata:  map[string]any{"semantic_live_message": true, "turn_id": "msg_user_1"},
			Parts: []gact.Part{{
				ID:   "semantic_handoff",
				Type: gact.PartTypeExpertHandoff,
				Metadata: map[string]any{
					"parent_id": "main",
					"agent_id":  "geospatial",
				},
			}},
		},
		{
			ID:        "msg_asst_1",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:   "asst_text",
				Type: gact.PartTypeText,
				Text: "I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego.",
			}},
		},
	}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		{
			Sequence: 1,
			Type:     "message.part.delta",
			TurnID:   "msg_user_1",
			Payload:  map[string]any{"delta": map[string]any{"text_append": "I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego."}},
		},
		semanticEventWithTurn(2, "msg_user_1", "blueprint.delegation.started", "main", "geospatial", map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "Resolve San Diego to coordinates.",
			"status":      "running",
		}),
	}}

	rendered := ansi.Strip(a.renderBody(120, 90))
	if count := strings.Count(rendered, "ASSISTANT"); count != 1 {
		t.Fatalf("assistant header count = %d, want 1\n%s", count, rendered)
	}
	intro := "I am initiating the process to find the nearest GNSS station"
	if count := strings.Count(rendered, intro); count != 1 {
		t.Fatalf("intro count = %d, want 1\n%s", count, rendered)
	}
	if !strings.Contains(rendered, "↳ main → geospatial") {
		t.Fatalf("projected handoff missing:\n%s", rendered)
	}
}

func TestRenderProjectedExecutionConversationUsesCanonicalTurnIDFromMessageEvents(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.selected = 0
	a.currentStatus = gact.StatusRunning
	a.messages = []gact.Message{
		{
			ID:        "msg_user_1",
			SessionID: "s1",
			TurnID:    "msg_user_1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "Can you find the nearest station to san diego and plot its data?"}},
		},
		{
			ID:        "msg_asst_1",
			SessionID: "s1",
			TurnID:    "msg_user_1",
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:   "asst_text",
				Type: gact.PartTypeText,
				Text: "I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego.",
				Metadata: map[string]any{
					"stream_source": "live",
					"turn_id":       "msg_user_1",
				},
			}},
		},
		{
			ID:        "semantic_live_" + stableIDFragment("msg_user_1"),
			SessionID: "s1",
			TurnID:    "msg_user_1",
			Role:      gact.RoleAssistant,
			Metadata:  map[string]any{"semantic_live_message": true, "turn_id": "msg_user_1"},
			Parts: []gact.Part{{
				ID:   "semantic_handoff",
				Type: gact.PartTypeExpertHandoff,
				Metadata: map[string]any{
					"parent_id": "main",
					"agent_id":  "geospatial",
					"turn_id":   "msg_user_1",
				},
			}},
		},
	}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		{
			Sequence: 1,
			Type:     "message.part.delta",
			TurnID:   "msg_user_1",
			Payload: map[string]any{
				"turn_id":       "msg_user_1",
				"message_id":    "msg_asst_1",
				"stream_source": "live",
				"delta": map[string]any{
					"text_append": "I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego.",
				},
			},
		},
		semanticEventWithTurn(2, "msg_user_1", "blueprint.delegation.started", "main", "geospatial", map[string]any{
			"parent_id":   "main",
			"delegate_to": "geospatial",
			"question":    "Resolve San Diego to coordinates.",
			"status":      "running",
		}),
	}}

	rendered := ansi.Strip(a.renderBody(120, 90))
	if count := strings.Count(rendered, "ASSISTANT"); count != 1 {
		t.Fatalf("assistant header count = %d, want 1\n%s", count, rendered)
	}
	if count := strings.Count(rendered, "I am initiating the process to find the nearest GNSS station"); count != 1 {
		t.Fatalf("assistant prose count = %d, want 1\n%s", count, rendered)
	}
	if strings.Contains(rendered, "semantic_live") {
		t.Fatalf("semantic live implementation details leaked:\n%s", rendered)
	}
	if !strings.Contains(rendered, "↳ main → geospatial") {
		t.Fatalf("projected handoff missing:\n%s", rendered)
	}
}

func TestRenderProjectedExecutionConversationGroupsByUserTurn(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.selected = 0
	a.currentStatus = gact.StatusRunning
	a.messages = []gact.Message{
		{
			ID:        "turn-one",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "first question"}},
		},
		{
			ID:        "turn-two",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u2", Type: gact.PartTypeText, Text: "second question"}},
		},
	}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		{Sequence: 1, Type: "message.part.delta", TurnID: "turn-one", Payload: map[string]any{"delta": map[string]any{"text_append": "first answer"}}},
		semanticEventWithTurn(2, "turn-one", "react.step.completed", "main", "", map[string]any{
			"expert_id":   "main",
			"thought":     "first turn thought",
			"tool_name":   "finish",
			"is_finish":   true,
			"observation": "done",
		}),
		{Sequence: 3, Type: "message.part.delta", TurnID: "turn-two", Payload: map[string]any{"delta": map[string]any{"text_append": "second answer"}}},
		semanticEventWithTurn(4, "turn-two", "react.step.completed", "main", "", map[string]any{
			"expert_id":   "main",
			"thought":     "second turn thought",
			"tool_name":   "finish",
			"is_finish":   true,
			"observation": "done",
		}),
	}}

	rendered := ansi.Strip(a.renderBody(120, 90))
	if count := strings.Count(rendered, "ASSISTANT"); count != 2 {
		t.Fatalf("assistant header count = %d, want 2\n%s", count, rendered)
	}
	firstUser := strings.Index(rendered, "first question")
	firstAssistant := strings.Index(rendered, "first answer")
	secondUser := strings.Index(rendered, "second question")
	secondAssistant := strings.Index(rendered, "second answer")
	if !(firstUser >= 0 && firstAssistant > firstUser && secondUser > firstAssistant && secondAssistant > secondUser) {
		t.Fatalf("turns were not interleaved by user turn:\n%s", rendered)
	}
}

func TestRenderProjectedExecutionConversationIncludesPersistedArtifactSupplement(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.selected = 0
	a.currentStatus = gact.StatusIdle
	a.messages = []gact.Message{
		{
			ID:        "turn-one",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "plot station"}},
		},
		{
			ID:        "assistant-one",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:   "handoff-plot",
				Type: gact.PartTypeExpertHandoff,
				Metadata: map[string]any{
					"agent_id":  "visualization",
					"parent_id": "main",
				},
				Text: `Retained typed workflow state:
{"workflow_state":{"artifact":{"columns":["east","north","up"],"kind":"gnss_timeseries_plot","path":"/tmp/run/P475.CI.LY_.20.png","status":"ready"}}}`,
			}},
		},
	}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		{Sequence: 1, Type: "message.part.delta", TurnID: "turn-one", Payload: map[string]any{"delta": map[string]any{"text_append": "working"}}},
		semanticEventWithTurn(2, "turn-one", "react.step.completed", "main", "", map[string]any{
			"expert_id":   "main",
			"thought":     "The plot will be generated by a downstream expert.",
			"tool_name":   "finish",
			"is_finish":   true,
			"observation": "done",
		}),
	}}

	rendered := ansi.Strip(a.renderBody(120, 90))
	if count := strings.Count(rendered, "ASSISTANT"); count != 1 {
		t.Fatalf("assistant header count = %d, want 1\n%s", count, rendered)
	}
	for _, want := range []string{"visualization returned evidence", "gnss_timeseries_plot", "P475.CI.LY_.20.png", "Ctrl+E full image", "columns east, north, up"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered transcript missing %q:\n%s", want, rendered)
		}
	}
}

func TestExecutionObservationPreviewShowsArtifactsAndRankings(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "earthscope_converted_data.csv")
	clean := filepath.Join(dir, "earthscope_stations_clean.csv")
	if err := os.WriteFile(source, []byte("Site,Latitude,(deg),Height\nP475,32.803967,-117.236,1\nSIO5,32.840736,-117.249,2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(clean, []byte("Site,Latitude,(deg)\nP475,32.803967,-117.236\nSIO5,32.840736,-117.249\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	theme := DefaultTheme()
	theme.CollapseThreshold = 3

	staged := theme.executionObservationPreview("ndp_stage_resource", map[string]any{
		"local_path":   source,
		"size_bytes":   153082,
		"content_type": "text/csv",
	})
	for _, want := range []string{"earthscope_converted_data.csv · 153082 bytes", "Site,Latitude,(deg),Height", "P475,32.803967,-117.236,1", "Ctrl+E full preview"} {
		if !strings.Contains(staged, want) {
			t.Fatalf("staged preview missing %q:\n%s", want, staged)
		}
	}

	diff := theme.executionObservationPreview("shell_bash", map[string]any{
		"command":   "cut -d, -f1-3 '" + source + "' > '" + clean + "'",
		"exit_code": 0,
	})
	for _, want := range []string{"prepared earthscope_stations_clean.csv", "- Site,Latitude,(deg),Height", "+ Site,Latitude,(deg)", "+ P475,32.803967,-117.236", "Ctrl+E full diff"} {
		if !strings.Contains(diff, want) {
			t.Fatalf("diff preview missing %q:\n%s", want, diff)
		}
	}

	ranking := theme.executionObservationPreview("geo_filter_points_by_radius", map[string]any{
		"within_radius_count": 9,
		"radius_km":           50,
		"points": []any{
			map[string]any{"Site": "P475", "distance_km": 9.4807},
			map[string]any{"Site": "SIO5", "distance_km": 15.9393},
			map[string]any{"Site": "P472", "distance_km": 19.8584},
			map[string]any{"Site": "P473", "distance_km": 20.0313},
		},
	})
	for _, want := range []string{"9 stations within radius (50 km)", "P475 9.481 km", "SIO5 15.94 km", "P472 19.86 km", "Ctrl+E full output"} {
		if !strings.Contains(ranking, want) {
			t.Fatalf("ranking preview missing %q:\n%s", want, ranking)
		}
	}
}

func TestProjectedExecutionCtrlEOpensProducedImageArtifact(t *testing.T) {
	dir := t.TempDir()
	plotPath := filepath.Join(dir, "P475.CI.LY_.20.png")
	if err := os.WriteFile(plotPath, []byte("not a real png, but a real produced artifact path"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 60
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "plot station"}},
	}}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		semanticEventWithTurn(1, "turn-one", "react.step.completed", "visualization", "", map[string]any{
			"expert_id": "visualization",
			"thought":   "Plot the nearest station time series.",
			"tool_name": "gnss_timeseries_plot",
			"tool_args": map[string]any{"station": "P475"},
			"observation": map[string]any{
				"output_path": plotPath,
				"plot_type":   "timeseries",
				"y_columns":   []any{"east", "north", "up"},
			},
		}),
	}}

	if !a.openExecutionArtifactForSelection() {
		t.Fatal("expected projected execution artifact to be expandable")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatalf("detail view not opened: open=%v ref=%+v", a.detailViewOpen, a.detailView)
	}
	if a.detailView.localPath != plotPath {
		t.Fatalf("detail localPath = %q, want %q", a.detailView.localPath, plotPath)
	}
	if !strings.Contains(a.detailView.title, "P475.CI.LY_.20.png") {
		t.Fatalf("detail title does not name image artifact: %q", a.detailView.title)
	}
	if len(a.detailView.fileModes) == 0 {
		t.Fatalf("image artifact should use file detail modes: %+v", a.detailView)
	}
}

func TestProjectedExecutionEnterOpensSemanticDetailNotArtifact(t *testing.T) {
	dir := t.TempDir()
	plotPath := filepath.Join(dir, "P475.CI.LY_.20.png")
	if err := os.WriteFile(plotPath, []byte("artifact"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.selected = 0
	a.focus = FocusBody
	a.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "plot station"}},
	}}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		semanticEventWithTurn(1, "turn-one", "react.step.completed", "visualization", "", map[string]any{
			"expert_id": "visualization",
			"thought":   "Plot the nearest station time series.",
			"tool_name": "gnss_timeseries_plot",
			"observation": map[string]any{
				"output_path": plotPath,
				"plot_type":   "timeseries",
			},
		}),
	}}

	out, _ := a.handleBodyKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	got := out.(*App)
	if got.detailView == nil {
		t.Fatal("Enter should open projected execution semantic detail")
	}
	if got.detailView.localPath != "" {
		t.Fatalf("Enter opened artifact path %q; want semantic detail", got.detailView.localPath)
	}
	for _, want := range []string{"Turn", "turn-one", "Event counts", "react.step.completed", "visualization"} {
		if !strings.Contains(got.detailView.fullText, want) {
			t.Fatalf("semantic detail missing %q:\n%s", want, got.detailView.fullText)
		}
	}
	got.closeDetailView()
	if !got.openExecutionArtifactForSelection() {
		t.Fatal("Ctrl+E artifact path should still be available")
	}
	if got.detailView == nil || got.detailView.localPath != plotPath {
		t.Fatalf("artifact expansion targeted %+v, want %s", got.detailView, plotPath)
	}
}

func TestProjectedExecutionCtrlEOpensReasoningWhenThatIsCollapsedContent(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "inspect"}},
	}}
	a.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		semanticEventWithTurn(1, "turn-one", "react.step.completed", "data", "", map[string]any{
			"expert_id": "data",
			"thought":   "Choose the next data acquisition action.",
			"reasoning": "This is the raw reasoning trace that should remain collapsed until expansion.",
			"tool_name": "finish",
			"is_finish": true,
		}),
	}}

	if !a.openExecutionArtifactForSelection() {
		t.Fatal("expected projected reasoning trace to be expandable")
	}
	if a.detailView == nil || !strings.Contains(a.detailView.fullText, "raw reasoning trace") {
		t.Fatalf("detail view did not expose reasoning trace: %+v", a.detailView)
	}
}

func TestRenderExecutionAgentBlockSummarizesWorkflowJSON(t *testing.T) {
	rendered := ansi.Strip(DefaultTheme().renderExecutionAgentBlock("data", `{
  "catalog": {"status": "metadata_found"},
  "acquisition": {"status": "staged", "local_path": "/tmp/run/P475.CI.LY_.20.csv", "analysis_ready": true},
  "resource_candidate": {"resource_name": "P475.CI.LY_.20.csv"}
}`, 1, 100))
	for _, want := range []string{"data", "acquisition staged", "P475.CI.LY_.20.csv", "analysis ready true"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("structured agent block missing %q:\n%s", want, rendered)
		}
	}
	for _, bad := range []string{"\"resource_candidate\"", "\"acquisition\""} {
		if strings.Contains(rendered, bad) {
			t.Fatalf("structured agent block leaked raw JSON %q:\n%s", bad, rendered)
		}
	}
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
	if count := strings.Count(rendered, "↳ main → synthesis"); count != 1 {
		t.Fatalf("handoff count = %d, want 1:\n%s", count, rendered)
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
	if !strings.Contains(rendered, "↳ main → geospatial") {
		t.Fatalf("real handoff was removed with placeholder:\n%s", rendered)
	}
}

func TestRenderExecutionDoesNotCollapseExpertProse(t *testing.T) {
	theme := DefaultTheme()
	theme.CollapseThreshold = 2
	node := executionTimelineNode{
		Kind:  executionNodeExpertReport,
		Agent: "data",
		Text:  "line one\nline two\nline three\nline four",
	}

	rendered := ansi.Strip(theme.renderExecutionExpertReport(node, 100))
	for _, want := range []string{"line one", "line two", "line three", "line four"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("expert prose was collapsed, missing %q:\n%s", want, rendered)
		}
	}
	if strings.Contains(rendered, "Ctrl+E full output") {
		t.Fatalf("expert prose should not advertise collapsed output:\n%s", rendered)
	}
}

func TestRenderExecutionSubagentToolAlignsUnderThought(t *testing.T) {
	theme := DefaultTheme()
	node := executionTimelineNode{
		Kind:        executionNodeReactStep,
		Agent:       "ndp_dataset_discovery",
		Depth:       2,
		Thinking:    "I need to search for the catalog.",
		ToolName:    "ndp_search_datasets",
		ToolArgs:    map[string]any{"search_terms": []any{"earthscope", "converted"}, "limit": 10},
		Observation: map[string]any{"status": "success", "count": 1},
	}

	rendered := ansi.Strip(theme.renderExecutionReactStep(node, 120))
	lines := strings.Split(rendered, "\n")
	var thoughtIndent, toolIndent = -1, -1
	for _, line := range lines {
		if strings.Contains(line, "I need to search") {
			thoughtIndent = len(line) - len(strings.TrimLeft(line, " "))
		}
		if strings.Contains(line, "NDP catalog search") {
			toolIndent = len(line) - len(strings.TrimLeft(line, " "))
		}
	}
	if thoughtIndent < 0 || toolIndent < 0 {
		t.Fatalf("missing thought/tool lines:\n%s", rendered)
	}
	if thoughtIndent != toolIndent {
		t.Fatalf("tool indent = %d, thought indent = %d:\n%s", toolIndent, thoughtIndent, rendered)
	}
}

func TestRenderExecutionKnownObservationPreviews(t *testing.T) {
	theme := DefaultTheme()
	theme.CollapseThreshold = 3
	cases := []struct {
		name        string
		node        executionTimelineNode
		want        []string
		mustNotHave []string
	}{
		{
			name: "geocode",
			node: executionTimelineNode{
				Kind:     executionNodeReactStep,
				Depth:    1,
				ToolName: "geo_geocode",
				ToolArgs: map[string]any{"query": "San Diego, CA"},
				Observation: "[{'display_name': 'San Diego, San Diego County, California, United States', " +
					"'lat': 32.7174202, 'lon': -117.162772, 'provenance': 'osm_nominatim'}]",
			},
			want: []string{
				"San Diego, San Diego County, California, United States",
				"center 32.7174202, -117.162772",
				"source osm_nominatim",
			},
			mustNotHave: []string{"display_name", "provenance"},
		},
		{
			name: "ndp search",
			node: executionTimelineNode{
				Kind:     executionNodeReactStep,
				Depth:    2,
				ToolName: "ndp_search_datasets",
				ToolArgs: map[string]any{"search_terms": []any{"earthscope", "converted"}},
				Observation: `{"datasets":[{"title":"EarthScope Stations Dataset","resources":[` +
					`{"name":"earthscope_converted_data.csv","format":"CSV"}]}],"count":1}`,
			},
			want:        []string{"earthscope_converted_data.csv"},
			mustNotHave: []string{"status: success", "count: 1", "EarthScope Stations Dataset"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rendered := ansi.Strip(theme.renderExecutionReactStep(tc.node, 120))
			for _, want := range tc.want {
				if !strings.Contains(rendered, want) {
					t.Fatalf("rendered output missing %q:\n%s", want, rendered)
				}
			}
			for _, bad := range tc.mustNotHave {
				if strings.Contains(rendered, bad) {
					t.Fatalf("rendered output should not include %q:\n%s", bad, rendered)
				}
			}
		})
	}
}

func TestRenderExecutionStationCatalogReportAvoidsRawMap(t *testing.T) {
	theme := DefaultTheme()
	tests := []struct {
		name       string
		node       executionTimelineNode
		want       []string
		mustNotAny []string
	}{
		{
			name: "station catalog",
			node: executionTimelineNode{
				Kind:  executionNodeExpertReport,
				Agent: "earthscope_station_catalog",
				Structured: map[string]any{
					"workflow_state": map[string]any{
						"station_catalog": map[string]any{
							"candidate_count": 42,
							"station_ids":     []any{"P475", "SIO5", "P472", "P473"},
							"status":          "ranked",
						},
					},
				},
			},
			want:       []string{"42 candidate stations", "status ranked", "P475", "SIO5", "P472", "Ctrl+E full output"},
			mustNotAny: []string{"map[", "station_catalog map"},
		},
		{
			name: "profile",
			node: executionTimelineNode{
				Kind:  executionNodeExpertReport,
				Agent: "gnss_timeseries_analysis",
				Structured: map[string]any{
					"workflow_state": map[string]any{
						"profile": map[string]any{
							"path":         "/tmp/P475.CI.LY_.20.csv",
							"scan_limited": true,
							"status":       "complete",
						},
					},
				},
			},
			want:       []string{"profile complete", "P475.CI.LY_.20.csv", "scan limited true"},
			mustNotAny: []string{"map[", "profile map"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rendered := ansi.Strip(theme.renderExecutionExpertReport(tt.node, 120))
			for _, want := range tt.want {
				if !strings.Contains(rendered, want) {
					t.Fatalf("rendered report missing %q:\n%s", want, rendered)
				}
			}
			for _, bad := range tt.mustNotAny {
				if strings.Contains(rendered, bad) {
					t.Fatalf("report leaked raw map formatting %q:\n%s", bad, rendered)
				}
			}
		})
	}
}

func TestRenderExecutionFinishThoughtStripsWorkflowJSONFence(t *testing.T) {
	theme := DefaultTheme()
	node := executionTimelineNode{
		Kind:     executionNodeReactStep,
		Agent:    "ndp_dataset_discovery",
		Depth:    2,
		ToolName: "finish",
		IsFinish: true,
		Thinking: "The EarthScope stations dataset was found and the cleaned metadata path was created.\n\n" +
			"```json\n" +
			"{\"catalog\":{\"status\":\"metadata_found\"},\"acquisition\":{\"metadata_path\":\"/tmp/earthscope_stations_clean.csv\"}}\n" +
			"```",
		Observation: "Completed.",
	}

	rendered := ansi.Strip(theme.renderExecutionReactStep(node, 120))
	if !strings.Contains(rendered, "The EarthScope stations dataset was found") {
		t.Fatalf("prose was removed with control JSON:\n%s", rendered)
	}
	for _, bad := range []string{"```json", "\"catalog\"", "\"acquisition\"", "metadata_path"} {
		if strings.Contains(rendered, bad) {
			t.Fatalf("workflow JSON leaked into rendered thought (%q):\n%s", bad, rendered)
		}
	}
}

func TestRenderExecutionAgentProsePreservesSpacesWithMarkdownBullets(t *testing.T) {
	theme := DefaultTheme()
	text := "The EarthScope station metadata catalog has been staged. I am now routing to the station catalog expert to filter for stations within 100km of San Diego and rank the nearest candidates.\n\n" +
		"The nearest EarthScope GNSS station for San Diego has been identified and its data staged.\n" +
		"- **Selected Station**: P475\n" +
		"- **Staged CSV Path**: /tmp/P475.CI.LY_.20.csv\n" +
		"CLIO merged nested typed workflow state:\n{\"workflow_state\":{}}\n"

	rendered := ansi.Strip(theme.renderExecutionAgentBlock("data", text, 1, 100))
	for _, want := range []string{"to filter", "and rank", "nearest candidates", "data staged.", "Staged CSV Path"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered prose missing %q:\n%s", want, rendered)
		}
	}
	for _, bad := range []string{"tofilter", "andrank", "nearestcandidates", "staged.-Selected", "CSVPath", "workflow_state"} {
		if strings.Contains(rendered, bad) {
			t.Fatalf("rendered prose contains joined/control text %q:\n%s", bad, rendered)
		}
	}
}

func TestRenderExecutionExpertMarkdownProsePreservesSpaces(t *testing.T) {
	theme := DefaultTheme()
	text := "**CSV Profile Summary: Station P475**\n" +
		"- **Rows Profiled (Numeric Summary):** 5,000\n\n" +
		"**Displacement Ranges (Profiled Rows):**\n" +
		"- **East:** Min: -0.056, Max: -0.02, Mean: -0.0420664\n" +
		"- **North:** Min: -0.015, Max: 0.03, Mean: 0.0017842\n" +
		"- **Up:** Min: -0.077, Max: 0.04, Mean: -0.0209854\n\n" +
		"**Caveats:**\n" +
		"- **Sampling:** The analysis used a sampled profile (5,000 of 250,000 rows); statistics are representative of the profiled subset.\n"
	node := executionTimelineNode{
		Kind:  executionNodeExpertReport,
		Agent: "gnss_timeseries_analysis",
		Text:  text,
	}

	rendered := ansi.Strip(theme.renderExecutionExpertReport(node, 160))
	for _, want := range []string{"Profiled Rows", "- North", "Min: -0.015", "The analysis used a sampled profile"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered expert prose missing %q:\n%s", want, rendered)
		}
	}
	for _, bad := range []string{"ProfiledRows", "-North", "Min:-0.015", "analysisusedasampled"} {
		if strings.Contains(rendered, bad) {
			t.Fatalf("rendered expert prose joined text %q:\n%s", bad, rendered)
		}
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

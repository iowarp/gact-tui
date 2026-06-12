package ui

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func BenchmarkRenderLargeSemanticTranscript(b *testing.B) {
	app := benchmarkLargeSemanticTranscriptApp(160, 48, 180)
	app.MouseEnabled = true
	_ = app.renderBody(app.width-40, app.height-3)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = app.renderBody(app.width-40, app.height-3)
	}
}

func BenchmarkViewLargeSemanticTranscript(b *testing.B) {
	app := benchmarkLargeSemanticTranscriptApp(160, 48, 180)
	app.MouseEnabled = true
	_ = app.View()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = app.View()
	}
}

func BenchmarkFullConversationCopyLargeSemanticTranscript(b *testing.B) {
	app := benchmarkLargeSemanticTranscriptApp(160, 48, 180)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, ok := fullConversationText(app.messages); !ok {
			b.Fatal("large transcript should be copyable")
		}
	}
}

func BenchmarkSelectedBlockCopyLargeSemanticTranscript(b *testing.B) {
	app := benchmarkLargeSemanticTranscriptApp(160, 48, 180)
	app.bodySelMsgIdx = len(app.messages) - 1
	app.bodySelPartIdx = 1
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, ok := selectedConversationBlockText(app.messages, app.bodySelMsgIdx, app.bodySelPartIdx); !ok {
			b.Fatal("selected block should be copyable")
		}
	}
}

func BenchmarkDetailModalLargeMarkdownInitialRender(b *testing.B) {
	app := benchmarkLargeDetailApp()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		app.detailWrap = detailWrapCache{}
		app.detailScroll = 0
		_ = app.viewDetailView()
	}
}

func BenchmarkDetailModalLargeMarkdownCachedScroll(b *testing.B) {
	app := benchmarkLargeDetailApp()
	_ = app.viewDetailView()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		app.detailScroll = i % 250
		_ = app.viewDetailView()
	}
}

func TestLargeSemanticTranscriptDefaultViewIsReadable(t *testing.T) {
	app := benchmarkLargeSemanticTranscriptApp(140, 42, 20)
	out := ansi.Strip(app.renderBody(app.width-40, app.height-3))
	for _, want := range []string{
		"CONVERSATION",
		"NDP catalog search",
		"EarthScope waveform discovery",
		"SAC waveform visualization",
		"Final answer",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("large semantic transcript missing %q:\n%s", want, out)
		}
	}
}

func TestWorkflowStateJSONSummaryDoesNotLeakInline(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "Retained typed workflow state: {\"workflow_state\":{\"acquisition\":{\"analysis_ready\":true,\"local_path\":\"/home/jcernuda/agent-demo/MTA1.CI.LY_.30.csv\",\"metadata_path\":\"/home/jcernuda/agent-demo/earthscope_stations_clean.csv\"},\"geospatial\":{\"center_lat\":34.0522,\"center_lon\":-118.2437,\"radius_km\":50},\"visualization\":{\"artifact_path\":\"/home/jcernuda/agent-demo/sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png\"}}}",
		Metadata: map[string]any{
			"agent_id":       "analysis",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": "Retained typed workflow state: {\"workflow_state\":{\"acquisition\":{\"analysis_ready\":true,\"local_path\":\"/home/jcernuda/agent-demo/MTA1.CI.LY_.30.csv\",\"metadata_path\":\"/home/jcernuda/agent-demo/earthscope_stations_clean.csv\"},\"geospatial\":{\"center_lat\":34.0522,\"center_lon\":-118.2437,\"radius_km\":50},\"visualization\":{\"artifact_path\":\"/home/jcernuda/agent-demo/sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png\"}}}",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	for _, want := range []string{"analysis returned evidence to main", "state:", "acquisition", "geospatial", "visualization"} {
		if !strings.Contains(out, want) {
			t.Fatalf("workflow summary missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"workflow_state", "\"local_path\"", "\"metadata_path\"", "\"artifact_path\"", "/home/jcernuda/agent-demo"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("workflow summary leaked raw JSON/path %q:\n%s", unwanted, out)
		}
	}
}

func TestConversationRenderCacheTracksChangedPartTextWithoutGlobalInvalidation(t *testing.T) {
	app := benchmarkLargeSemanticTranscriptApp(120, 34, 1)
	app.messages[1].Parts[len(app.messages[1].Parts)-1].Text = "Final answer: first version."
	first := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[1], &app.messages[0], 80, nil, "").row)
	if !strings.Contains(first, "first version") {
		t.Fatalf("initial render missing first version:\n%s", first)
	}

	app.messages[1].Parts[len(app.messages[1].Parts)-1].Text = "Final answer: changed version."
	second := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[1], &app.messages[0], 80, nil, "").row)
	if !strings.Contains(second, "changed version") {
		t.Fatalf("cached render did not reflect changed text:\n%s", second)
	}
	if strings.Contains(second, "first version") {
		t.Fatalf("cached render leaked stale text:\n%s", second)
	}
}

func TestConversationRenderCacheTracksPartAddedWithoutGlobalInvalidation(t *testing.T) {
	app := benchmarkLargeSemanticTranscriptApp(120, 34, 1)
	app.messages[1].Parts = app.messages[1].Parts[:1]
	first := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[1], &app.messages[0], 80, nil, "").row)
	if strings.Contains(first, "late evidence") {
		t.Fatalf("initial render unexpectedly had late part:\n%s", first)
	}

	app.messages[1].Parts = append(app.messages[1].Parts, gact.Part{
		ID:   "late_part",
		Type: gact.PartTypeText,
		Text: "late evidence arrived while streaming",
	})
	second := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[1], &app.messages[0], 80, nil, "").row)
	if !strings.Contains(second, "late evidence arrived while streaming") {
		t.Fatalf("cached render did not reflect appended part:\n%s", second)
	}
}

func TestConversationRenderCacheTracksPartDeltaWithoutGlobalInvalidation(t *testing.T) {
	app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	app.messages = []gact.Message{{
		ID:   "msg_1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
			Text: "streaming",
		}},
	}}
	first := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[0], nil, 80, nil, "").row)
	if !strings.Contains(first, "streaming") {
		t.Fatalf("initial render missing streamed text:\n%s", first)
	}

	app.applyPartDelta(client.SSEEvent{
		Type: "message.part.delta",
		Payload: map[string]any{"payload": map[string]any{
			"message_id": "msg_1",
			"part_id":    "part_1",
			"delta":      map[string]any{"text_append": " update"},
		}},
	})
	second := ansi.Strip(app.cachedConversationMessageRender(app.Theme, app.messages[0], nil, 80, nil, "").row)
	if !strings.Contains(second, "streaming update") {
		t.Fatalf("cached render did not reflect text delta:\n%s", second)
	}
}

func benchmarkLargeSemanticTranscriptApp(width, height, turns int) *App {
	app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	app.width = width
	app.height = height
	app.stage = StageReady
	app.focus = FocusBody
	app.stickyToBottom = true
	app.sessions = []gact.Session{{
		ID:        "sess_perf",
		Title:     "large semantic transcript",
		Status:    gact.StatusIdle,
		CreatedAt: time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 6, 11, 9, 5, 0, 0, time.UTC),
	}}
	app.selected = 0
	app.currentStatus = gact.StatusIdle
	app.bodySelMsgIdx = turns*2 - 1
	app.bodySelPartIdx = 0
	app.messages = benchmarkSemanticMessages(turns)
	return app
}

func benchmarkLargeDetailApp() *App {
	app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	app.width = 160
	app.height = 48
	app.stage = StageReady
	app.focus = FocusBody
	app.MouseEnabled = true
	app.detailViewOpen = true
	app.detailView = &bulkyPartRef{
		messageID: "msg_perf",
		partID:    "part_large_markdown",
		title:     "Tool evidence · large Markdown output",
		fullText:  benchmarkLargeMarkdownDetail(420),
	}
	return app
}

func benchmarkLargeMarkdownDetail(rows int) string {
	var b strings.Builder
	b.WriteString("# EarthScope GNSS Station Candidates\n\n")
	b.WriteString("Ranked stations around Los Angeles with confidence notes and artifact provenance.\n\n")
	b.WriteString("| Rank | Station ID | Distance (km) | Trust | Notes |\n")
	b.WriteString("| ---: | --- | ---: | --- | --- |\n")
	for i := 0; i < rows; i++ {
		fmt.Fprintf(&b, "| %d | MTA%03d | %.4f | %s | staged CSV `/tmp/grind-es/MTA%03d.CI.LY_.30.csv`; scan-limited profile retained |\n",
			i+1,
			i,
			float64(i)*0.3749,
			[]string{"high", "medium", "review"}[i%3],
			i,
		)
	}
	b.WriteString("\n## Workflow State\n\n")
	for i := 0; i < rows/12; i++ {
		fmt.Fprintf(&b, "- acquisition step %03d completed with metadata provenance and no blocker\n", i)
	}
	return b.String()
}

func benchmarkSemanticMessages(turns int) []gact.Message {
	messages := make([]gact.Message, 0, turns*2)
	created := time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC)
	for i := 0; i < turns; i++ {
		messages = append(messages, gact.Message{
			ID:        fmt.Sprintf("msg_user_%03d", i),
			SessionID: "sess_perf",
			Role:      gact.RoleUser,
			CreatedAt: created.Add(time.Duration(i*2) * time.Second),
			Parts: []gact.Part{{
				ID:   fmt.Sprintf("part_user_%03d", i),
				Type: gact.PartTypeText,
				Text: "Explore seismic activity around San Diego, find catalog evidence, analyze trace statistics, and produce a waveform artifact for discussion.",
			}},
		})
		messages = append(messages, benchmarkAssistantSemanticMessage(i, created.Add(time.Duration(i*2+1)*time.Second)))
	}
	return messages
}

func benchmarkAssistantSemanticMessage(i int, created time.Time) gact.Message {
	toolRows := []map[string]any{
		benchmarkToolRow("ndp_search_datasets", map[string]any{
			"search_terms": "seismic waveform San Diego EarthScope recent",
			"server":       "global",
		}, map[string]any{
			"dataset_id": "00d66104-dcb0-4381-86b4-fc62f08b3434",
			"title":      "Southern California earthquake waveform collection",
		}, 91),
		benchmarkToolRow("sac_discover_earthscope_region_waveform", map[string]any{
			"location":      "San Diego, CA",
			"days_back":     7,
			"duration":      120,
			"min_magnitude": 1,
		}, map[string]any{
			"station": "AZ.LVA2.--.BHZ",
			"archive": "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.sac",
		}, 20353),
		benchmarkToolRow("sac_compute_trace_statistics", map[string]any{
			"filepath":   "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.sac",
			"max_traces": 8,
		}, map[string]any{
			"trace_count": 1,
			"mean":        -0.0000021,
			"max":         0.021,
		}, 5),
		benchmarkToolRow("sac_plot_traces", map[string]any{
			"filepath":    "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.sac",
			"output_path": "/home/jcernuda/agent-demo/sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png",
		}, map[string]any{
			"artifact": "/home/jcernuda/agent-demo/sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png",
			"ok":       true,
		}, 33908),
	}

	state := map[string]any{
		"geospatial": map[string]any{
			"center_lat": 34.0522,
			"center_lon": -118.2437,
			"radius_km":  50,
		},
		"acquisition": map[string]any{
			"analysis_ready": true,
			"local_path":     "/home/jcernuda/agent-demo/MTA1.CI.LY_.30.csv",
			"metadata_path":  "/home/jcernuda/agent-demo/earthscope_stations_clean.csv",
		},
		"visualization": map[string]any{
			"artifact_path": "/home/jcernuda/agent-demo/sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png",
		},
	}

	return gact.Message{
		ID:         fmt.Sprintf("msg_asst_%03d", i),
		SessionID:  "sess_perf",
		Role:       gact.RoleAssistant,
		CreatedAt:  created,
		StopReason: "end_turn",
		Parts: []gact.Part{
			{
				ID:            fmt.Sprintf("part_route_%03d", i),
				Type:          gact.PartTypeRoutingDecision,
				SelectedAgent: "data",
				Rationale:     "Agent planner selected data because the request needs NDP catalog search before waveform analysis.",
				Confidence:    0.86,
			},
			benchmarkHandoffPart(i, "main", "data", "delegate.started", "running", "Resolve San Diego geography and find matching NDP seismic data."),
			benchmarkHandoffPart(i, "data", "ndp_catalog", "tool.call.completed", "completed", "NDP dataset found and staged; resource is large, preserving dataset metadata and continuing with EarthScope waveform discovery."),
			benchmarkHandoffPart(i, "main", "analysis", "delegate.started", "running", "Run SAC fallback while preserving the user's requested recent San Diego window."),
			benchmarkHandoffPart(i, "analysis", "sac_format", "delegate.completed", "completed", "EarthScope waveform discovery returned AZ.LVA2 -- BHZ archive and trace statistics."),
			benchmarkHandoffPart(i, "main", "visualization", "delegate.completed", "completed", "SAC waveform visualization saved artifact sac_traces_earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.png."),
			{
				ID:   fmt.Sprintf("part_answer_%03d", i),
				Type: gact.PartTypeText,
				Text: "Final answer: found recent Southern California seismic waveform evidence, inspected the EarthScope SAC trace, computed summary statistics, and produced a waveform visualization artifact for review.",
			},
		},
		Metadata: map[string]any{
			"tools_called":   anySlice(toolRows),
			"workflow_state": state,
		},
	}
}

func benchmarkHandoffPart(i int, parent, agent, stage, status, summary string) gact.Part {
	return gact.Part{
		ID:   fmt.Sprintf("part_handoff_%03d_%s_%s", i, parent, agent),
		Type: gact.PartTypeExpertHandoff,
		Text: summary,
		Metadata: map[string]any{
			"parent_id":      parent,
			"agent_id":       agent,
			"stage":          stage,
			"status":         status,
			"output_summary": summary,
			"duration_ms":    float64(1000 + i),
		},
	}
}

func benchmarkToolRow(name string, args map[string]any, result map[string]any, duration float64) map[string]any {
	return map[string]any{
		"name":             name,
		"args":             args,
		"result":           result,
		"ok":               true,
		"duration_ms":      duration,
		"telemetry_source": "live_observer",
	}
}

func anySlice[T any](items []T) []any {
	out := make([]any, len(items))
	for i := range items {
		out[i] = items[i]
	}
	return out
}

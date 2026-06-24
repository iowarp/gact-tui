package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "plot station"}},
	}}
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
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

	if !a.execution.openArtifactForSelection() {
		t.Fatal("expected projected execution artifact to be expandable")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatalf("detail view not opened: open=%v ref=%+v", a.detail.visible, a.detail.ref)
	}
	if a.detail.ref.localPath != plotPath {
		t.Fatalf("detail localPath = %q, want %q", a.detail.ref.localPath, plotPath)
	}
	if !strings.Contains(a.detail.ref.title, "P475.CI.LY_.20.png") {
		t.Fatalf("detail title does not name image artifact: %q", a.detail.ref.title)
	}
	if len(a.detail.ref.fileModes) == 0 {
		t.Fatalf("image artifact should use file detail modes: %+v", a.detail.ref)
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
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.focus = FocusBody
	a.conversation.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "plot station"}},
	}}
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
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

	out, _ := a.conversation.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	got := out.(*App)
	if got.detail.ref == nil {
		t.Fatal("Enter should open projected execution semantic detail")
	}
	if got.detail.ref.localPath != "" {
		t.Fatalf("Enter opened artifact path %q; want semantic detail", got.detail.ref.localPath)
	}
	for _, want := range []string{"Turn", "turn-one", "Event counts", "react.step.completed", "visualization"} {
		if !strings.Contains(got.detail.ref.fullText, want) {
			t.Fatalf("semantic detail missing %q:\n%s", want, got.detail.ref.fullText)
		}
	}
	got.detail.close()
	if !got.execution.openArtifactForSelection() {
		t.Fatal("Ctrl+E artifact path should still be available")
	}
	if got.detail.ref == nil || got.detail.ref.localPath != plotPath {
		t.Fatalf("artifact expansion targeted %+v, want %s", got.detail.ref, plotPath)
	}
}

func TestProjectedExecutionCtrlEOpensReasoningWhenThatIsCollapsedContent(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "turn-one",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "inspect"}},
	}}
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		semanticEventWithTurn(1, "turn-one", "react.step.completed", "data", "", map[string]any{
			"expert_id": "data",
			"thought":   "Choose the next data acquisition action.",
			"reasoning": "This is the raw reasoning trace that should remain collapsed until expansion.",
			"tool_name": "finish",
			"is_finish": true,
		}),
	}}

	if !a.execution.openArtifactForSelection() {
		t.Fatal("expected projected reasoning trace to be expandable")
	}
	if a.detail.ref == nil || !strings.Contains(a.detail.ref.fullText, "raw reasoning trace") {
		t.Fatalf("detail view did not expose reasoning trace: %+v", a.detail.ref)
	}
}

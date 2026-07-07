package ui

import (
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

// Single-node render helpers exercising the canonical timeline writer in
// isolation. Production rendering goes through renderExecutionTimeline (the
// stateful walk); these let the content-preview assertions target one node's
// rows without the header/return chrome of a full turn.
func (t Theme) renderExecutionAgentBlock(agent, text string, depth, width int) string {
	w := &execTimelineWriter{t: t, width: width, levelAgent: map[int]string{}}
	w.emitHeader(depth, agent)
	w.emitProseTurn(depth, agent, text)
	return strings.Join(w.rows, "\n")
}

func (t Theme) renderExecutionExpertReport(node executionTimelineNode, width int) string {
	w := &execTimelineWriter{t: t, width: width, levelAgent: map[int]string{}}
	w.emitHeader(node.Depth, firstNonEmpty(node.Agent, "expert"))
	w.emitTurns(node, node.Depth)
	return strings.Join(w.rows, "\n")
}

func (t Theme) renderExecutionReactStep(node executionTimelineNode, width int) string {
	w := &execTimelineWriter{t: t, width: width, levelAgent: map[int]string{}}
	w.emitReactStep(node, node.Depth)
	return strings.Join(w.rows, "\n")
}

func (t Theme) renderExecutionHandoff(node executionTimelineNode, width int) string {
	w := &execTimelineWriter{t: t, width: width, levelAgent: map[int]string{}}
	depth := node.Depth - 1
	if depth < 0 {
		depth = 0
	}
	w.emitDelegation(node, depth)
	return strings.Join(w.rows, "\n")
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

func TestRenderExecutionHandoffWrapsWithinWidthWithIndent(t *testing.T) {
	theme := DefaultTheme()
	node := executionTimelineNode{
		Kind:        executionNodeHandoff,
		Agent:       "ndp_dataset_discovery",
		ParentAgent: "data",
		Depth:       2,
		Question:    "Search the NDP for EarthScope GNSS station metadata datasets. Identify the appropriate catalog containing station coordinates and metadata, and stage that metadata CSV to provide a acquisition.metadata_path for subsequent filtering.",
	}

	rendered := ansi.Strip(theme.renderExecutionHandoff(node, 76))
	for _, line := range strings.Split(rendered, "\n") {
		if len(line) > 76 {
			t.Fatalf("line exceeded render width (%d): %q\n%s", len(line), line, rendered)
		}
		if strings.Contains(line, "subsequent") && !strings.HasPrefix(line, "      ") {
			t.Fatalf("wrapped continuation lost handoff indent: %q\n%s", line, rendered)
		}
	}
}

func TestRenderExecutionObservationStylesDiffLines(t *testing.T) {
	theme := DefaultTheme()
	rendered := theme.executionObservationBlock("prepared file.csv\n- old,row\n+ new,row\nCtrl+E full diff")
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("expected styled observation output, got plain text: %q", rendered)
	}
	plain := ansi.Strip(rendered)
	for _, want := range []string{"⎿ prepared file.csv", "- old,row", "+ new,row", "Ctrl+E full diff"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("styled observation missing %q:\n%s", want, plain)
		}
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
	normalizedRendered := strings.Join(strings.Fields(rendered), " ")
	for _, want := range []string{"to filter", "and rank", "nearest candidates", "data staged.", "Staged CSV Path"} {
		if !strings.Contains(normalizedRendered, want) {
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

// TestRenderExecutionProviderThinkingCollapsesToDisclosure pins #233 box 3 (web
// parity): a provider-thinking react step renders ONLY the muted
// `thinking · N chars · Ctrl+E` summary — never the prose — and the char count
// tracks the full thinking length so it ticks up as the block streams.
func TestRenderExecutionProviderThinkingCollapsesToDisclosure(t *testing.T) {
	theme := DefaultTheme()
	thinking := "The user wants the nearest EarthScope station to San Diego. " +
		"I should resolve the coordinates, search the catalog, then stage and plot the data."
	node := executionTimelineNode{
		Kind:             executionNodeReactStep,
		Agent:            "main",
		Depth:            1,
		Thinking:         thinking,
		ProviderThinking: true,
	}

	rendered := ansi.Strip(theme.renderExecutionReactStep(node, 120))
	wantSummary := "thinking · " + strconv.Itoa(len(thinking)) + " chars · Ctrl+E"
	if !strings.Contains(rendered, wantSummary) {
		t.Fatalf("provider thinking summary %q missing:\n%s", wantSummary, rendered)
	}
	for _, leaked := range []string{"nearest EarthScope station", "search the catalog"} {
		if strings.Contains(rendered, leaked) {
			t.Fatalf("provider thinking prose leaked into transcript (%q):\n%s", leaked, rendered)
		}
	}
}

// TestRenderExecutionProviderThinkingCountGrowsWhileStreaming proves the summary
// count reflects the current (growing) thinking length rather than a fixed value.
func TestRenderExecutionProviderThinkingCountGrowsWhileStreaming(t *testing.T) {
	theme := DefaultTheme()
	short := executionTimelineNode{Kind: executionNodeReactStep, Depth: 1, Thinking: "abc", ProviderThinking: true}
	grown := executionTimelineNode{Kind: executionNodeReactStep, Depth: 1, Thinking: "abcdefghij", ProviderThinking: true}
	if got := ansi.Strip(theme.renderExecutionReactStep(short, 120)); !strings.Contains(got, "thinking · 3 chars · Ctrl+E") {
		t.Fatalf("short thinking count wrong:\n%s", got)
	}
	if got := ansi.Strip(theme.renderExecutionReactStep(grown, 120)); !strings.Contains(got, "thinking · 10 chars · Ctrl+E") {
		t.Fatalf("grown thinking count wrong:\n%s", got)
	}
}

// TestRenderExecutionRegularThinkingRendersInlineUnchanged is the golden guard:
// a react step WITHOUT the provider flag still spills its next_thought prose
// inline and shows no disclosure summary (behavior unchanged for ReAct models).
func TestRenderExecutionRegularThinkingRendersInlineUnchanged(t *testing.T) {
	theme := DefaultTheme()
	thinking := "I need to search for the catalog before staging anything."
	node := executionTimelineNode{
		Kind:     executionNodeReactStep,
		Agent:    "main",
		Depth:    1,
		Thinking: thinking,
	}

	rendered := ansi.Strip(theme.renderExecutionReactStep(node, 120))
	if !strings.Contains(rendered, "I need to search for the catalog") {
		t.Fatalf("regular thinking prose was dropped:\n%s", rendered)
	}
	if strings.Contains(rendered, "chars · Ctrl+E") {
		t.Fatalf("regular thinking wrongly collapsed to a disclosure:\n%s", rendered)
	}
}

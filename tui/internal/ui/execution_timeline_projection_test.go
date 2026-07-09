package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// earthscopeDelegationAssistant builds an assistant message whose ordered
// message.part.* atoms encode the main→geospatial and main→data→
// ndp_dataset_discovery delegation run — the realistic clio transcript shape the
// canonical render projects from (tool parts carry the fine-grained tool-owner
// agent_id; the expert is the active delegation child).
func earthscopeDelegationAssistant(turnID string) gact.Message {
	seq := 0
	next := func() int { seq++; return seq }
	return gact.Message{
		ID:        "msg_asst_" + turnID,
		SessionID: "s1",
		TurnID:    turnID,
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, AgentID: "main", Sequence: next(), Text: "I am initiating the process to find the nearest GNSS station to San Diego."},
			{Type: gact.PartTypeExpertHandoff, AgentID: "main", Sequence: next(), Metadata: map[string]any{
				"parent_id": "main", "delegate_to": "geospatial", "depth": 0,
				"question": "Resolve San Diego to grounded coordinates.",
			}},
			{Type: gact.PartTypeToolCall, AgentID: "geo", Sequence: next(), CallID: "c1",
				ToolName: "geo_geocode", Thought: "The user wants to resolve the place name to coordinates.",
				Input: map[string]any{"query": "San Diego", "countrycodes": "us", "limit": 1}},
			{Type: gact.PartTypeToolResult, AgentID: "geo", Sequence: next(), CallID: "c1", Metadata: map[string]any{
				"result": "[{'display_name': 'San Diego, San Diego County, California, United States', 'lat': 32.7174, 'lon': -117.1628, 'provenance': 'osm_nominatim'}]",
			}},
			{Type: gact.PartTypeText, AgentID: "geospatial", Sequence: next(), Text: "The region for San Diego has been resolved to grounded coordinates."},
			{Type: gact.PartTypeText, AgentID: "main", Sequence: next(), Text: "Geography resolved; delegating data acquisition for San Diego."},
			{Type: gact.PartTypeExpertHandoff, AgentID: "main", Sequence: next(), Metadata: map[string]any{
				"parent_id": "main", "delegate_to": "data", "depth": 0,
				"question": "Discover and stage EarthScope GNSS stations near San Diego.",
			}},
			{Type: gact.PartTypeExpertHandoff, AgentID: "data", Sequence: next(), Metadata: map[string]any{
				"parent_id": "data", "delegate_to": "ndp_dataset_discovery", "depth": 1,
				"question": "Search NDP for the EarthScope station metadata catalog.",
			}},
			{Type: gact.PartTypeToolCall, AgentID: "ndp", Sequence: next(), CallID: "c2",
				ToolName: "ndp_search_datasets", Thought: "Search NDP for the earthscope converted catalog.",
				Input: map[string]any{"search_terms": []any{"earthscope", "converted"}, "limit": 10}},
			{Type: gact.PartTypeToolResult, AgentID: "ndp", Sequence: next(), CallID: "c2", Metadata: map[string]any{
				"result": `{"datasets":[{"title":"EarthScope Stations Dataset","resources":[{"name":"earthscope_converted_data.csv","format":"CSV"}]}],"count":1}`,
			}},
			{Type: gact.PartTypeText, AgentID: "data", Sequence: next(), Text: "EarthScope station metadata catalog discovered and staged."},
		},
	}
}

func TestRenderProjectedExecutionConversationUsesOneAssistantTurn(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	a.conversation.messages = []gact.Message{
		{
			ID:        "msg_user_d8da77ab69d0",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts: []gact.Part{{
				ID:   "part_user",
				Type: gact.PartTypeText,
				Text: "Find the nearest station to San Diego on earthscope, download and analyze the data and plot it",
			}},
		},
		earthscopeDelegationAssistant("msg_user_d8da77ab69d0"),
	}

	rendered := ansi.Strip(a.conversation.render(120, 90))
	// One user turn renders one timeline headed by the root agent; the legacy
	// "ASSISTANT" role banner is gone in favour of the ▎main canonical header.
	if !strings.Contains(rendered, "▎main") {
		t.Fatalf("root agent header ▎main missing\n%s", rendered)
	}
	for _, want := range []string{
		"main",
		"→ delegates to geospatial",
		"The user wants to resolve the place name",
		"Geocode location(countrycodes: us · limit: 1 · query: San Diego)",
		"San Diego, San Diego County, California, United States",
		"⤶ returns to main",
		"→ delegates to data",
		"data",
		"→ delegates to ndp_dataset_discovery",
		"NDP catalog search",
		"earthscope_converted_data.csv",
		"⤶ returns to data",
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
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	// The user message carries no explicit TurnID; the assistant turn scopes to
	// it by the user message ID. A semantic-live placeholder message is present
	// and must be skipped (never rendered).
	a.conversation.messages = []gact.Message{
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
		earthscopeDelegationAssistant("msg_user_1"),
	}

	rendered := ansi.Strip(a.conversation.render(120, 90))
	if !strings.Contains(rendered, "▎main") {
		t.Fatalf("root agent header ▎main missing\n%s", rendered)
	}
	intro := "I am initiating the process to find the nearest GNSS station"
	if count := strings.Count(rendered, intro); count != 1 {
		t.Fatalf("intro count = %d, want 1\n%s", count, rendered)
	}
	if !strings.Contains(rendered, "→ delegates to geospatial") {
		t.Fatalf("projected handoff missing:\n%s", rendered)
	}
}

func TestRenderProjectedExecutionConversationUsesCanonicalTurnIDFromMessageEvents(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	a.conversation.messages = []gact.Message{
		{
			ID:        "msg_user_1",
			SessionID: "s1",
			TurnID:    "msg_user_1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "Can you find the nearest station to san diego and plot its data?"}},
		},
		earthscopeDelegationAssistant("msg_user_1"),
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

	rendered := ansi.Strip(a.conversation.render(120, 90))
	if !strings.Contains(rendered, "▎main") {
		t.Fatalf("root agent header ▎main missing\n%s", rendered)
	}
	if count := strings.Count(rendered, "I am initiating the process to find the nearest GNSS station"); count != 1 {
		t.Fatalf("assistant prose count = %d, want 1\n%s", count, rendered)
	}
	if strings.Contains(rendered, "semantic_live") {
		t.Fatalf("semantic live implementation details leaked:\n%s", rendered)
	}
	if !strings.Contains(rendered, "→ delegates to geospatial") {
		t.Fatalf("projected handoff missing:\n%s", rendered)
	}
}

func TestRenderProjectedExecutionConversationGroupsByUserTurn(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	delegatingTurn := func(turnID, answer string) gact.Message {
		return gact.Message{
			ID:        "asst-" + turnID,
			SessionID: "s1",
			TurnID:    turnID,
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{
				{Type: gact.PartTypeExpertHandoff, AgentID: "main", Sequence: 1, Metadata: map[string]any{
					"parent_id": "main", "delegate_to": "geospatial", "depth": 0, "question": "resolve it",
				}},
				{Type: gact.PartTypeText, AgentID: "geospatial", Sequence: 2, Text: answer},
			},
		}
	}
	a.conversation.messages = []gact.Message{
		{
			ID:        "turn-one",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "first question"}},
		},
		delegatingTurn("turn-one", "first answer"),
		{
			ID:        "turn-two",
			SessionID: "s1",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "u2", Type: gact.PartTypeText, Text: "second question"}},
		},
		delegatingTurn("turn-two", "second answer"),
	}

	rendered := ansi.Strip(a.conversation.render(120, 90))
	// Each user turn renders its own timeline headed by ▎main, so two turns
	// produce two root headers.
	if count := strings.Count(rendered, "▎main"); count != 2 {
		t.Fatalf("root header count = %d, want 2\n%s", count, rendered)
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
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusIdle
	a.conversation.messages = []gact.Message{
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
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
		{Sequence: 1, Type: "message.part.delta", TurnID: "turn-one", Payload: map[string]any{"delta": map[string]any{"text_append": "working"}}},
		semanticEventWithTurn(2, "turn-one", "react.step.completed", "main", "", map[string]any{
			"expert_id":   "main",
			"thought":     "The plot will be generated by a downstream expert.",
			"tool_name":   "finish",
			"is_finish":   true,
			"observation": "done",
		}),
	}}

	rendered := ansi.Strip(a.conversation.render(120, 90))
	if !strings.Contains(rendered, "▎visualization") {
		t.Fatalf("visualization header missing\n%s", rendered)
	}
	for _, want := range []string{"gnss_timeseries_plot", "P475.CI.LY_.20.png", "Ctrl+E full image", "columns east, north, up"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered transcript missing %q:\n%s", want, rendered)
		}
	}
}

// TestProjectionKeepsCommandResultVerbatim guards the review's HIGH finding: a
// synthetic slash-command result (metadata.synthetic=="command_result") must NOT be
// run through cleanProse — its pipe/arrow-shaped body would be mangled by
// stripStatusPrefix. Web parity: transcriptDelegationModel.ts:549 routes it around
// cleanProse. Meanwhile a real orchestration placeholder is still dropped and real
// answer prose still survives.
func TestProjectionKeepsCommandResultVerbatim(t *testing.T) {
	cmdBody := "cache -> stats | ok | 42 entries, 3 evictions"
	messages := []gact.Message{
		{ID: "u1", SessionID: "s1", Role: gact.RoleUser},
		{ID: "a1", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{
			{ID: "p1", Type: gact.PartTypeText, Sequence: 1, Text: cmdBody,
				Metadata: map[string]any{"synthetic": "command_result", "agent_id": "main"}},
			{ID: "p2", Type: gact.PartTypeText, Sequence: 2, Text: "(Delegating to the data expert; no final answer yet.)",
				Metadata: map[string]any{"agent_id": "main"}},
			{ID: "p3", Type: gact.PartTypeText, Sequence: 3, Text: "Real answer here.",
				Metadata: map[string]any{"agent_id": "main"}},
		}},
	}
	turns := filterProjectedTurns(projectExecutionTimelineFromMessages(messages))
	if len(turns) != 1 {
		t.Fatalf("want one projected turn, got %d", len(turns))
	}
	var texts []string
	for _, n := range turns[0].Nodes {
		if n.Kind == executionNodeAssistantText {
			texts = append(texts, n.Text)
		}
	}
	joined := strings.Join(texts, "\n")
	if !strings.Contains(joined, cmdBody) {
		t.Errorf("command_result body was mangled/dropped by cleanProse; text nodes: %#v", texts)
	}
	if strings.Contains(joined, "Delegating to the data expert") {
		t.Errorf("orchestration placeholder was not dropped; text nodes: %#v", texts)
	}
	if !strings.Contains(joined, "Real answer here.") {
		t.Errorf("real answer prose was dropped; text nodes: %#v", texts)
	}
}

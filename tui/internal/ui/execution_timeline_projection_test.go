package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestRenderProjectedExecutionConversationUsesOneAssistantTurn(t *testing.T) {
	a := NewWithTheme("", DefaultTheme())
	a.stage = StageReady
	a.width = 120
	a.height = 90
	a.session.sessions = []gact.Session{{ID: "s1", Status: gact.StatusRunning}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusRunning
	a.conversation.messages = []gact.Message{{
		ID:        "msg_user_d8da77ab69d0",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts: []gact.Part{{
			ID:   "part_user",
			Type: gact.PartTypeText,
			Text: "Find the nearest station to San Diego on earthscope, download and analyze the data and plot it",
		}},
	}}
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": executionTimelineFixtureMainGeoDataNDP()}

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
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
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
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
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
	a.conversation.messages = []gact.Message{
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
	a.execution.executionEventsBySession = map[string][]executionTimelineEvent{"s1": {
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

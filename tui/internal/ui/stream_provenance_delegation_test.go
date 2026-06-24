package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplySemanticEventRendersDelegationAsReadableHandoff(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "resume_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"trace_id":     "trace_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces",
			"detail_level": "semantic",
			"actor": map[string]any{
				"kind":     "agent",
				"agent_id": "analysis",
				"role":     "child_expert",
			},
			"subject": map[string]any{
				"agent_id": "main",
				"role":     "parent_expert",
			},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 20353,
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Type != gact.PartTypeExpertHandoff || part.Metadata["parent_id"] != "main" || part.Metadata["agent_id"] != "analysis" {
		t.Fatalf("delegation part = %#v", part)
	}
	if strings.Contains(part.Text, "NEXT_EXPERT") || !strings.Contains(part.Text, "analysis returned") {
		t.Fatalf("delegation text should be user-facing: %#v", part)
	}
}

func TestApplySemanticEventSummarizesContractOnlyDelegation(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_contract_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.started",
			"status":       "running",
			"summary":      "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback DO_NOT_DELEGATE_DATA_AGAIN: true",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "main",
				"agent_id":  "analysis",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if part.Text != "main handed work to analysis · next: analysis - run SAC fallback" {
		t.Fatalf("contract-only delegation summary = %#v", part)
	}
	if strings.Contains(part.Text, "NEXT_EXPERT") || strings.Contains(part.Text, "DO_NOT_DELEGATE") {
		t.Fatalf("delegation leaked control contract: %#v", part)
	}
}

func TestApplySemanticEventKeepsNextActionFromStrippedContract(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_next_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "analysis returned a compact result to main. NEXT_EXPERT: visualization NEXT_ACTION: plot_sac_traces /home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_AZ_LVA2_--_BHZ_2026-06-03T203524.sac DO_NOT_FINALIZE_BEFORE_VISUALIZATION: true",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 20353,
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	for _, want := range []string{"analysis returned evidence to main", "next: visualization - plot SAC traces"} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("next-action delegation summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "NEXT_ACTION", "DO_NOT_FINALIZE", "clio-seismic-staging"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("delegation leaked control contract %q: %#v", unwanted, part)
		}
	}
}

func TestApplySemanticEventPrioritizesReadableBlockerFromContract(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_blocker_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.completed",
			"status":       "completed",
			"summary":      "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window Blocker: resource_too_large - dataset ID 00d66104-dcb0-4381-86b4-fc62f08b3434, resource size 1503238553 bytes",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject":      map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":     "delegate.completed",
				"parent_id": "main",
				"agent_id":  "data",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	for _, want := range []string{"data returned evidence to main", "blocked: resource too large - dataset ID 00d66104-dcb0-4381-86b4-fc62f08b3434"} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("blocker delegation summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"NEXT_EXPERT", "NEXT_ACTION", "Blocker:", "resource_too_large"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("blocker delegation leaked raw contract %q: %#v", unwanted, part)
		}
	}

	ref := partDetailRef(a.conversation.messages[0].ID, part)
	if !strings.Contains(ref.fullText, "what happened: data returned evidence to main · blocked: resource too large") {
		t.Fatalf("blocker detail missing readable summary:\n%s", ref.fullText)
	}
	if strings.Contains(ref.fullText, "NEXT_ACTION") || strings.Contains(ref.fullText, "Blocker:") {
		t.Fatalf("blocker detail leaked raw contract:\n%s", ref.fullText)
	}
}

func TestApplySemanticEventHumanizesPlumbingDelegationSummary(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":     "delegate_sync_1",
			"session_id":   "s1",
			"turn_id":      "turn_1",
			"event_type":   "blueprint.delegation.started",
			"status":       "running",
			"summary":      "main delegated sync work to visualization.",
			"detail_level": "semantic",
			"actor":        map[string]any{"agent_id": "main", "role": "parent_expert"},
			"subject":      map[string]any{"agent_id": "visualization", "role": "child_expert"},
			"payload":      map[string]any{"stage": "delegate.started"},
		}},
	})

	part := a.conversation.messages[0].Parts[0]
	if part.Text != "main handed work to visualization." || part.Metadata["parent_id"] != "main" || part.Metadata["agent_id"] != "visualization" {
		t.Fatalf("plumbing delegation summary = %#v", part)
	}
}

func TestApplySemanticEventRendersWorkflowStateSummaryInline(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_state_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary":    "analysis returned a compact result to main.",
			"actor":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":    map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":       "delegate.completed",
				"parent_id":   "main",
				"agent_id":    "analysis",
				"duration_ms": 1200,
				"workflow_state": map[string]any{
					"acquisition": map[string]any{
						"status":     "staged",
						"dataset_id": "00d66104-dcb0-4381-86b4-fc62f08b3434",
					},
					"artifact": map[string]any{
						"status":        "ready",
						"artifact_path": "sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
					},
				},
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("semantic messages = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	if got := stringValue(part.Metadata["workflow_summary"]); !strings.Contains(got, "acquisition staged") || !strings.Contains(got, "artifact ready") {
		t.Fatalf("workflow summary metadata = %q", got)
	}
	plain := ansi.Strip(DefaultTheme().renderMessage(a.conversation.messages[0], 120))
	for _, want := range []string{"analysis returned", "state:", "acquisition staged", "artifact ready"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("semantic workflow render missing %q:\n%s", want, plain)
		}
	}
	if strings.Contains(plain, "field") || strings.Contains(plain, "workflow_state") || strings.Contains(plain, "dataset_id=") || strings.Contains(plain, "artifact_path=") {
		t.Fatalf("semantic workflow render leaked raw state shape:\n%s", plain)
	}
	ref := partDetailRef(a.conversation.messages[0].ID, part)
	for _, want := range []string{"workflow state:", "acquisition staged", "artifact ready"} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("semantic workflow detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestApplySemanticEventPrefersDelegationOutputSummaryOverCompactContract(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_contract_1",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary": "NEXT_EXPERT: analysis NEXT_ACTION: run_sac_fallback preserving the user's requested region/recent window; " +
				"otherwise IU.ANMO.00.BHZ 2010-02-27T06:30:00 duration=60s DO_NOT_DELEGATE_DATA_AGAIN: true",
			"actor":   map[string]any{"agent_id": "data", "role": "child_expert"},
			"subject": map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":          "delegate.completed",
				"parent_id":      "main",
				"agent_id":       "data",
				"output_summary": "NDP resource 00d66104 was too large to stage; using EarthScope fallback for the requested San Diego window.",
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("delegation output summary message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	for _, want := range []string{
		"NDP resource 00d66104 was too large to stage",
		"next: analysis - run SAC fallback preserving the user's requested region/recent window",
	} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("delegation output summary missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"NEXT_EXPERT", "NEXT_ACTION", "DO_NOT_DELEGATE", "IU.ANMO"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("delegation output summary leaked compact contract %q: %#v", unwanted, part)
		}
	}
}

func TestApplySemanticEventSummarizesStructuredDelegationOutput(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"event_id":   "delegate_structured_output",
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.completed",
			"status":     "completed",
			"summary":    "analysis returned a compact result to main.",
			"actor":      map[string]any{"agent_id": "analysis", "role": "child_expert"},
			"subject":    map[string]any{"agent_id": "main", "role": "parent_expert"},
			"payload": map[string]any{
				"stage":     "delegate.completed",
				"parent_id": "main",
				"agent_id":  "analysis",
				"result": map[string]any{
					"artifact_path":  "/home/jcernuda/DemoBench/sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
					"traces_plotted": 3,
				},
			},
		}},
	})

	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("structured delegation output message = %#v", a.conversation.messages)
	}
	part := a.conversation.messages[0].Parts[0]
	for _, want := range []string{
		"SAC evidence:",
		"sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png",
		"traces_plotted: 3",
	} {
		if !strings.Contains(part.Text, want) {
			t.Fatalf("structured delegation output missing %q: %#v", want, part)
		}
	}
	for _, unwanted := range []string{"compact result", "NEXT_EXPERT", "artifact_path"} {
		if strings.Contains(part.Text, unwanted) {
			t.Fatalf("structured delegation output leaked raw/plumbing %q: %#v", unwanted, part)
		}
	}
}

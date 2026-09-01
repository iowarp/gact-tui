package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// routing_decision part renders as an action row
// with selected_agent, heuristic/LM indicator, and confidence,
// followed by a dimmed rationale line.
func TestRender_RoutingDecision_ShapedCorrectly(t *testing.T) {
	p := gact.NewRoutingDecisionPart("data_expert",
		"Intent matched data-analysis keywords.", 0.85, true)
	out := DefaultTheme().renderPart(p, 80)
	plain := stripANSI(out)

	if !strings.Contains(plain, "▸ orchestrator selected data_expert") {
		t.Errorf("expected routing action sentence; got:\n%s", plain)
	}
	if !strings.Contains(plain, "heuristic") {
		t.Errorf("heuristic=true should render the 'heuristic' tag; got:\n%s", plain)
	}
	if !strings.Contains(plain, "confidence 0.85") {
		t.Errorf("expected confidence readout; got:\n%s", plain)
	}
	if !strings.Contains(plain, "Intent matched data-analysis keywords.") {
		t.Errorf("rationale missing from render; got:\n%s", plain)
	}
}

// LM-routed decisions render with the "LM-routed"
// tag instead of "heuristic".
func TestRender_RoutingDecision_LMRoutedTag(t *testing.T) {
	p := gact.NewRoutingDecisionPart("research_expert",
		"LM classifier selected research expert.", 0.72, false)
	out := DefaultTheme().renderPart(p, 80)
	plain := stripANSI(out)

	if !strings.Contains(plain, "LM-routed") {
		t.Errorf("heuristic=false should render 'LM-routed'; got:\n%s", plain)
	}
	if strings.Contains(plain, "heuristic") {
		t.Errorf("'heuristic' tag should NOT appear for LM-routed decision; got:\n%s", plain)
	}
}

// Empty rationale collapses to the badge row alone
// (no second line of empty italics).
func TestRender_RoutingDecision_NoRationale(t *testing.T) {
	p := gact.NewRoutingDecisionPart("code_expert", "", 0.9, true)
	out := DefaultTheme().renderPart(p, 80)
	plain := stripANSI(out)

	lines := strings.Split(strings.TrimRight(plain, "\n"), "\n")
	if len(lines) != 1 {
		t.Errorf("empty rationale should give one line; got %d lines:\n%s",
			len(lines), plain)
	}
}

func TestRender_RoutingDecision_HidesInternalCleanupRows(t *testing.T) {
	p := gact.NewRoutingDecisionPart("main",
		"removed retained evidence scaffolding from final dynamic answer", 0, false)
	out := DefaultTheme().renderPart(p, 80)
	if strings.TrimSpace(stripANSI(out)) != "" {
		t.Fatalf("internal cleanup routing row should be hidden:\n%s", stripANSI(out))
	}
}

// When a routing_decision part is present in an
// assistant message, the full-message render places it at the top
// (before the answer text).
func TestRender_MessageWithRoutingDecisionPutsItFirst(t *testing.T) {
	m := gact.Message{
		ID:   "a1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			gact.NewRoutingDecisionPart("data_expert", "picked", 0.8, true),
			gact.NewTextPart("Here is the analysis..."),
		},
	}
	out := DefaultTheme().renderMessage(m, 80)
	plain := stripANSI(out)
	idxRoute := strings.Index(plain, "data_expert")
	idxAnswer := strings.Index(plain, "Here is the analysis")
	if idxRoute < 0 || idxAnswer < 0 {
		t.Fatalf("missing sections in render:\n%s", plain)
	}
	if idxRoute >= idxAnswer {
		t.Errorf("routing_decision should render before the answer text; routing at %d, answer at %d\n%s",
			idxRoute, idxAnswer, plain)
	}
}

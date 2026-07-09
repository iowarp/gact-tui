package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Characterization tests for the cleanProse chain — the Go port of the web's
// presentationFilters.ts. They pin the two behaviours that matter for #233 parity:
// (1) whole-line orchestration chrome is stripped so the row drops, and
// (2) real prose that merely MENTIONS orchestration survives untouched.

func TestCleanProseStripsWholeLineStatusParentheticals(t *testing.T) {
	// These are the exact placeholder shapes the EarthScope wire emits; each is a
	// whole-line parenthetical → cleaned entirely to empty → the row is dropped.
	placeholders := []string{
		"(Delegating to data expert for station discovery; no final answer yet.)",
		"(Delegating to earthscope_station_catalog for spatial filtering and ranking; no final answer yet.)",
		"(Delegating to visualization expert for PNG artifact creation; synthesis pending.)",
		"(Delegating to geospatial child; no answer yet.)",
		"(Routing to the synthesis expert.)",
		"(Awaiting synthesis before finishing.)",
	}
	for _, p := range placeholders {
		if got := cleanProse(p); got != "" {
			t.Errorf("expected placeholder to clean to empty\n  in:  %q\n  got: %q", p, got)
		}
	}
}

func TestCleanProsePreservesRealProseMentioningOrchestration(t *testing.T) {
	// Regression guard: real answer prose that mentions routing/delegation must NOT
	// be hidden — only whole-line parentheticals are chrome (the web behaves the same;
	// isOrchestrationPlaceholder is a gate, never a hide).
	cases := []string{
		"The EarthScope station metadata catalog has been staged. I am now routing to the station catalog expert to filter for stations within 100km of San Diego and rank the nearest candidates.",
		"Geography resolved. Delegating GNSS station discovery to the data expert.",
		"I delegated to the geospatial expert and it returned coordinates.",
	}
	for _, c := range cases {
		if got := cleanProse(c); got != c {
			t.Errorf("real prose must survive verbatim\n  in:  %q\n  got: %q", c, got)
		}
	}
}

func TestCleanProseStripsSectionMarkersAndStateBlob(t *testing.T) {
	in := "Real answer here.\n[[ ## reasoning ## ]]\nMore answer.\nCLIO merged typed workflow state:\n{\"workflow_state\":{\"a\":1}}\n"
	got := cleanProse(in)
	if got == "" {
		t.Fatalf("expected surviving prose, got empty")
	}
	for _, bad := range []string{"[[", "## reasoning", "workflow_state", "typed workflow state"} {
		if strings.Contains(got, bad) {
			t.Errorf("cleaned prose still contains %q:\n%s", bad, got)
		}
	}
	for _, want := range []string{"Real answer here.", "More answer."} {
		if !strings.Contains(got, want) {
			t.Errorf("cleaned prose lost real content %q:\n%s", want, got)
		}
	}
}

func TestStripStatusPrefixStructural(t *testing.T) {
	if got := stripStatusPrefix("main -> data | completed | acquisition | The data is staged."); got != "The data is staged." {
		t.Errorf("status prefix not stripped: %q", got)
	}
	// A markdown table row (pipes but no arrow head) must NOT be eaten.
	row := "| col a | col b |"
	if got := stripStatusPrefix(row); got != row {
		t.Errorf("markdown table row wrongly stripped: %q", got)
	}
}

// TestExecutionPlaceholderNarrowedToWebParity documents the intentional #233 change:
// the TUI no longer hides a row merely because it CONTAINS a bare, un-parenthesized
// domain phrase like "awaiting data acquisition" (the former overfit heuristic). The
// web doesn't hide those either — its isOrchestrationPlaceholder is a hasPriorAnswerRow
// gate, never a hide. Only text that cleans ENTIRELY to chrome (a whole-line
// parenthetical) is hidden.
func TestExecutionPlaceholderNarrowedToWebParity(t *testing.T) {
	for _, hidden := range []string{
		"(Awaiting synthesis before finishing.)",
		"(Delegating to the data expert for acquisition.)",
	} {
		if !executionPlaceholderAssistantText(hidden) {
			t.Errorf("expected parenthesized chrome to be hidden: %q", hidden)
		}
	}
	// Bare, un-parenthesized prose → NOT hidden (web parity; was hidden by the old
	// domain-substring heuristic, intentionally retired).
	for _, shown := range []string{
		"Awaiting data acquisition to complete before ranking the candidate stations.",
		"The geospatial expert is now awaiting synthesis of the resolved coordinates.",
	} {
		if executionPlaceholderAssistantText(shown) {
			t.Errorf("expected bare prose to survive (web parity): %q", shown)
		}
	}
}

// TestCleanProseWebInheritedOverStripping is a CHARACTERIZATION test pinning behavior
// that is byte-for-byte inherited from the web (statusParenRE / stripStatusPrefix):
// a whole-line parenthetical opening with a status verb, or a line shaped like
// "A -> B | seg | prose", is stripped even when it is arguably real prose. This is
// intentional PARITY with the web today; if the shared filter is ever loosened it
// must be loosened in BOTH clients — this test is the tripwire.
func TestCleanProseWebInheritedOverStripping(t *testing.T) {
	for _, s := range []string{
		"(Coordinating the results, we find both stations report consistent data.)",
		"(Querying additional stations did not change the ranking.)",
	} {
		if got := cleanProse(s); got != "" {
			t.Errorf("web-inherited: expected whole-line trigger parenthetical stripped\n  in:  %q\n  got: %q", s, got)
		}
	}
	in := "A -> B | this reads like a state transition | in the model | not chrome.\nSecond line stays."
	if got := cleanProse(in); got != "not chrome.\nSecond line stays." {
		t.Errorf("web-inherited stripStatusPrefix head-strip characterization changed:\n  got: %q", got)
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

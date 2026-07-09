package presentation

import (
	"strings"
	"testing"
)

// Characterization tests for the CleanProse chain — the Go port of the web's
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
		if got := CleanProse(p); got != "" {
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
		if got := CleanProse(c); got != c {
			t.Errorf("real prose must survive verbatim\n  in:  %q\n  got: %q", c, got)
		}
	}
}

func TestCleanProseStripsSectionMarkersAndStateBlob(t *testing.T) {
	in := "Real answer here.\n[[ ## reasoning ## ]]\nMore answer.\nCLIO merged typed workflow state:\n{\"workflow_state\":{\"a\":1}}\n"
	got := CleanProse(in)
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
	if got := StripStatusPrefix("main -> data | completed | acquisition | The data is staged."); got != "The data is staged." {
		t.Errorf("status prefix not stripped: %q", got)
	}
	// A markdown table row (pipes but no arrow head) must NOT be eaten.
	row := "| col a | col b |"
	if got := StripStatusPrefix(row); got != row {
		t.Errorf("markdown table row wrongly stripped: %q", got)
	}
}

// TestCleanProseWebInheritedOverStripping is a CHARACTERIZATION test pinning behavior
// that is byte-for-byte inherited from the web (statusParenRE / StripStatusPrefix):
// a whole-line parenthetical opening with a status verb, or a line shaped like
// "A -> B | seg | prose", is stripped even when it is arguably real prose. This is
// intentional PARITY with the web today; if the shared filter is ever loosened it
// must be loosened in BOTH clients — this test is the tripwire.
func TestCleanProseWebInheritedOverStripping(t *testing.T) {
	for _, s := range []string{
		"(Coordinating the results, we find both stations report consistent data.)",
		"(Querying additional stations did not change the ranking.)",
	} {
		if got := CleanProse(s); got != "" {
			t.Errorf("web-inherited: expected whole-line trigger parenthetical stripped\n  in:  %q\n  got: %q", s, got)
		}
	}
	in := "A -> B | this reads like a state transition | in the model | not chrome.\nSecond line stays."
	if got := CleanProse(in); got != "not chrome.\nSecond line stays." {
		t.Errorf("web-inherited StripStatusPrefix head-strip characterization changed:\n  got: %q", got)
	}
}

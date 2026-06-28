package ui

import (
	"strings"
	"testing"
)

func TestStripSemanticControlContractsRemovesWorkflowState(t *testing.T) {
	got := stripSemanticControlContracts(`Resolved region.

CLIO typed workflow state:
{"workflow_state":{"geospatial":{"center_lat":32.7}}}`)
	if got != "Resolved region." {
		t.Fatalf("stripSemanticControlContracts() = %q", got)
	}
}

func TestStripSemanticControlContractsKeepsMarkdownBlockShape(t *testing.T) {
	text := strings.Join([]string{
		"## Region",
		"",
		"- Center: 32.7174202, -117.162772",
		"- Radius: 50 km",
	}, "\n")
	got := stripSemanticControlContracts(text)
	if !strings.Contains(got, "## Region") || !strings.Contains(got, "- Radius: 50 km") {
		t.Fatalf("markdown summary lost useful structure:\n%s", got)
	}
}

func TestSemanticSummaryIsPlumbing(t *testing.T) {
	for _, input := range []string{
		"completed",
		"delegate.started",
		"main delegated sync work to data.",
		"analysis returned a compact result to main.",
	} {
		if !semanticSummaryIsPlumbing(input, "blueprint.delegation.completed") {
			t.Fatalf("%q should be classified as plumbing", input)
		}
	}
	if semanticSummaryIsPlumbing("Resolved San Diego center 32.7174202, -117.162772.", "blueprint.delegation.completed") {
		t.Fatal("useful region evidence should not be classified as plumbing")
	}
}

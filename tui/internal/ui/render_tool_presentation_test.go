package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestDeclaredToolPresentationUsesDisplayLineBudget(t *testing.T) {
	theme := Theme{CollapseThreshold: 5}
	for _, kind := range []string{"text", "diff"} {
		part := gact.Part{ToolName: "arbitrary_tool", Presentation: &gact.ToolPresentation{Blocks: []gact.ToolPresentationBlock{{ID: "body", Type: kind, Text: strings.Repeat("visible line\n", 15)}}}}
		rendered := theme.renderDeclaredToolPresentation(part, 80, false)
		expected := 5
		if kind == "diff" {
			expected = 10
		}
		if got := strings.Count(rendered, "visible line"); got != expected {
			t.Fatalf("%s: got %d lines, want %d", kind, got, expected)
		}
		if !strings.Contains(rendered, "more lines") {
			t.Fatal("missing expansion hint")
		}
	}
}

func TestDeclaredTerminalKeepsCommandOrderingAndExitCode(t *testing.T) {
	code := 7
	part := gact.Part{Presentation: &gact.ToolPresentation{Blocks: []gact.ToolPresentationBlock{{ID: "terminal", Type: "terminal", Command: "run the command", Text: "first\nwarning\nlast", ExitCode: &code}}}}
	rendered := (Theme{CollapseThreshold: 5}).renderDeclaredToolPresentation(part, 80, false)
	for _, expected := range []string{"$ run the command", "first\nwarning\nlast", "Process exited with code 7."} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("missing %q in %s", expected, rendered)
		}
	}
}

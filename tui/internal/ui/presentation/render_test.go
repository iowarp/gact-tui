package presentation

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestDeclaredToolPresentationUsesDisplayLineBudget(t *testing.T) {
	for _, kind := range []string{"text", "diff"} {
		part := gact.Part{ToolName: "arbitrary_tool", Presentation: &gact.ToolPresentation{Blocks: []gact.ToolPresentationBlock{{ID: "body", Type: kind, Text: strings.Repeat("visible line\n", 15)}}}}
		rendered := Render(part, 80, 5, false, func(s string) string { return s })
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
	rendered := Render(part, 80, 5, false, func(s string) string { return s })
	for _, expected := range []string{"$ run the command", "first\nwarning\nlast", "Process exited with code 7."} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("missing %q in %s", expected, rendered)
		}
	}
}

func TestDeclaredChecklistStates(t *testing.T) {
	part := gact.Part{Presentation: &gact.ToolPresentation{Blocks: []gact.ToolPresentationBlock{
		{ID: "a", Type: "check", State: "pending", Text: "Collect"},
		{ID: "b", Type: "check", State: "in_progress", Text: "Review"},
		{ID: "c", Type: "check", State: "completed", Text: "Publish"},
	}}}
	rendered := Render(part, 80, 5, false, func(s string) string { return s })
	for _, expected := range []string{"[ ] Collect", "[-] Review", "[x] Publish"} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("missing %q in %s", expected, rendered)
		}
	}
}

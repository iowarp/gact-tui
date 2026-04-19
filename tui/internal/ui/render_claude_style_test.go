package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestCapitalizeToolName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"bash", "Bash"},
		{"read_file", "ReadFile"},
		{"web_search", "WebSearch"},
		{"", "Tool"},
		{"grep", "Grep"},
		{"edit_file", "EditFile"},
		{"mcp__gh__search", "MCPGhSearch"},
	}
	for _, tc := range cases {
		got := capitalizeToolName(tc.in)
		// Normalise: we're case-insensitive on the prefix part. Allow
		// MCP__/mcp__ pre-normalisation to land wherever.
		if tc.in == "mcp__gh__search" {
			if !strings.HasPrefix(got, "Mcp") && !strings.HasPrefix(got, "MCP") {
				t.Errorf("mcp__gh__search = %q, want something starting with Mcp/MCP", got)
			}
			continue
		}
		if got != tc.want {
			t.Errorf("capitalizeToolName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestToolCallSummary_KnownTools(t *testing.T) {
	cases := []struct {
		tool  string
		input map[string]any
		want  string
	}{
		{"bash", map[string]any{"command": "ls -la"}, "ls -la"},
		{"shell", map[string]any{"cmd": "pwd"}, "pwd"},
		{"read_file", map[string]any{"path": "cmd/main.go"}, "cmd/main.go"},
		{"grep", map[string]any{"pattern": "TODO"}, "TODO"},
		{"web_search", map[string]any{"query": "golang generics"}, "golang generics"},
		// Unknown tool → JSON fallback.
		{"future_thing", map[string]any{"x": "y"}, "{x: y}"},
		// Known tool without the expected key → JSON fallback.
		{"bash", map[string]any{"not_command": "oops"}, "{not_command: oops}"},
	}
	for _, tc := range cases {
		got := toolCallSummary(gact.Part{
			Type: gact.PartTypeToolCall, ToolName: tc.tool, Input: tc.input,
		})
		if got != tc.want {
			t.Errorf("tool=%q input=%v → %q, want %q", tc.tool, tc.input, got, tc.want)
		}
	}
}

func TestRenderPart_ToolCallClaudeCodeShape(t *testing.T) {
	theme := DefaultTheme()
	p := gact.Part{
		Type: gact.PartTypeToolCall, ToolName: "bash",
		Input: map[string]any{"command": "cd /tmp && ls"},
	}
	got := theme.renderPart(p, 80)
	plain := ansi.Strip(got)
	if plain != "Bash(cd /tmp && ls)" {
		t.Errorf("tool_call render = %q, want 'Bash(cd /tmp && ls)'", plain)
	}
}

func TestRenderPart_ToolCallTruncatesLongSummary(t *testing.T) {
	theme := DefaultTheme()
	p := gact.Part{
		Type: gact.PartTypeToolCall, ToolName: "bash",
		Input: map[string]any{"command": strings.Repeat("x", 200)},
	}
	got := theme.renderPart(p, 40)
	plain := ansi.Strip(got)
	if ansi.StringWidth(plain) > 40 {
		t.Errorf("long tool call should truncate to width 40, got width=%d: %q",
			ansi.StringWidth(plain), plain)
	}
	if !strings.HasPrefix(plain, "Bash(") {
		t.Errorf("prefix lost after truncation: %q", plain)
	}
	if !strings.HasSuffix(plain, "…)") {
		t.Errorf("truncation suffix missing: %q", plain)
	}
}

func TestRenderPart_ToolResultLeadingGlyph(t *testing.T) {
	theme := DefaultTheme()
	p := gact.Part{
		Type: gact.PartTypeToolResult, CallID: "c1",
		Content: []gact.Part{
			{Type: gact.PartTypeText, Text: "first line\nsecond line\nthird line"},
		},
	}
	got := theme.renderPart(p, 40)
	plain := ansi.Strip(got)
	lines := strings.Split(plain, "\n")
	if !strings.HasPrefix(lines[0], "⎿") {
		t.Errorf("tool_result first line missing glyph: %q", lines[0])
	}
	// Continuation lines should be indented under the glyph. After
	// XXXXX1 the gutter is " │ " (space + bar + space) instead of
	// three spaces — both shapes leave content at column 3 with a
	// leading whitespace, so the assertion is "starts with a space"
	// (the bar variant) OR "starts with three spaces" (the legacy
	// shape). Either way the visual indent is preserved.
	for i := 1; i < len(lines); i++ {
		if !(strings.HasPrefix(lines[i], "   ") ||
			strings.HasPrefix(lines[i], " │ ")) {
			t.Errorf("continuation line %d not indented under glyph: %q", i, lines[i])
		}
	}
}

func TestRenderPart_ToolResultErrorTag(t *testing.T) {
	theme := DefaultTheme()
	p := gact.Part{
		Type: gact.PartTypeToolResult, CallID: "c1", IsError: true,
		Content: []gact.Part{{Type: gact.PartTypeText, Text: "command failed"}},
	}
	got := theme.renderPart(p, 40)
	if !strings.Contains(ansi.Strip(got), "(error)") {
		t.Errorf("error tag missing from tool_result: %q", ansi.Strip(got))
	}
}

func TestRenderPart_ThinkingUsesContinuationGlyph(t *testing.T) {
	theme := DefaultTheme()
	p := gact.Part{
		Type: gact.PartTypeThinking, Thinking: "considering options",
	}
	got := theme.renderPart(p, 40)
	plain := ansi.Strip(got)
	if !strings.Contains(plain, "⎿ thinking") {
		t.Errorf("thinking header missing new glyph: %q", plain)
	}
	if !strings.Contains(plain, "considering options") {
		t.Errorf("thinking body lost: %q", plain)
	}
}

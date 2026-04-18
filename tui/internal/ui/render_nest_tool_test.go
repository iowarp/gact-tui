package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestRenderMessageInContext_HidesToolHeaderAfterAssistantCall(t *testing.T) {
	theme := DefaultTheme()
	prev := &gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, ToolName: "bash",
				Input: map[string]any{"command": "ls"}},
		},
	}
	toolMsg := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "a.go\nb.go"}}},
		},
	}
	got := theme.renderMessageInContext(toolMsg, prev, 80)
	if strings.Contains(ansi.Strip(got), "TOOL") {
		t.Errorf("TOOL header should be suppressed when following assistant-with-tool-call; got:\n%s",
			ansi.Strip(got))
	}
	// The output block should still be there.
	if !strings.Contains(ansi.Strip(got), "⎿") {
		t.Errorf("tool result body missing: %q", ansi.Strip(got))
	}
}

func TestRenderMessageInContext_HidesToolHeaderAfterAnotherTool(t *testing.T) {
	// Multi-tool turn: assistant emits 3 tool_calls, then 3 TOOL
	// messages arrive. The first suppresses because its prev is the
	// assistant-with-calls. The second and third must ALSO suppress
	// because their prev is another TOOL message chained from the
	// same assistant turn.
	theme := DefaultTheme()
	prev := &gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "first"}}},
		},
	}
	m := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c2",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "second"}}},
		},
	}
	got := theme.renderMessageInContext(m, prev, 80)
	if strings.Contains(ansi.Strip(got), "TOOL") {
		t.Errorf("chained-tool TOOL header should be suppressed; got:\n%s",
			ansi.Strip(got))
	}
}

func TestRenderMessageInContext_ShowsToolHeaderWhenStandaloneTool(t *testing.T) {
	// A TOOL message not preceded by an assistant-with-tool-call
	// keeps its header (the "standalone" case; rare in practice
	// but possible).
	theme := DefaultTheme()
	prev := &gact.Message{
		Role:  gact.RoleUser,
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}},
	}
	m := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "x"}}},
		},
	}
	got := theme.renderMessageInContext(m, prev, 80)
	if !strings.Contains(ansi.Strip(got), "TOOL") {
		t.Errorf("TOOL header should remain when prev isn't an assistant-with-tool-call")
	}
}

func TestRenderMessageInContext_AssistantWithoutToolCallDoesntSuppress(t *testing.T) {
	// Assistant text-only followed by a tool message → the tool
	// header should show because there's no call to nest under.
	theme := DefaultTheme()
	prev := &gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "thinking out loud"},
		},
	}
	m := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "orphan"}}},
		},
	}
	got := theme.renderMessageInContext(m, prev, 80)
	if !strings.Contains(ansi.Strip(got), "TOOL") {
		t.Errorf("TOOL header should remain when prev-assistant had no tool_call part")
	}
}

func TestRenderMessage_BackcompatUsesRenderMessageInContext(t *testing.T) {
	// renderMessage(m, w) wraps renderMessageInContext(m, nil, w) —
	// with prev=nil, the suppress-path can't fire and a standalone
	// TOOL render always shows its header.
	theme := DefaultTheme()
	m := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "ok"}}},
		},
	}
	got := theme.renderMessage(m, 80)
	if !strings.Contains(ansi.Strip(got), "TOOL") {
		t.Errorf("renderMessage(m) should include TOOL header; got:\n%s", ansi.Strip(got))
	}
}

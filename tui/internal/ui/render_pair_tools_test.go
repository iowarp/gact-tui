package ui

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// TestPairToolResults_HappyPath: assistant emits 3 calls; 3 tool
// messages follow each carrying one matching result. All three should
// land in inlineResults[0] keyed by call_id, and all three tool
// messages should be marked absorbed.
func TestPairToolResults_HappyPath(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "I'll do three things"},
			{Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read"},
			{Type: gact.PartTypeToolCall, CallID: "c2", ToolName: "grep"},
			{Type: gact.PartTypeToolCall, CallID: "c3", ToolName: "edit"},
		}},
		{Role: gact.RoleTool, Parts: []gact.Part{{Type: gact.PartTypeToolResult, CallID: "c1"}}},
		{Role: gact.RoleTool, Parts: []gact.Part{{Type: gact.PartTypeToolResult, CallID: "c2"}}},
		{Role: gact.RoleTool, Parts: []gact.Part{{Type: gact.PartTypeToolResult, CallID: "c3"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "done"}}},
	}
	inline, absorbed := render.PairToolResults(msgs)
	if got := len(inline[0]); got != 3 {
		t.Errorf("inline[0]: want 3 results, got %d", got)
	}
	for _, cid := range []string{"c1", "c2", "c3"} {
		if _, ok := inline[0][cid]; !ok {
			t.Errorf("inline[0] missing %q", cid)
		}
	}
	for i := 1; i <= 3; i++ {
		if !absorbed[i] {
			t.Errorf("expected msg %d absorbed", i)
		}
	}
	if absorbed[0] || absorbed[4] {
		t.Errorf("non-tool messages should never be absorbed")
	}
}

// TestPairToolResults_UnpairedToolStaysVisible: a tool message that
// doesn't match any preceding call must NOT be absorbed (otherwise we
// silently drop output the user expected to see).
func TestPairToolResults_UnpairedToolStaysVisible(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read"},
		}},
		{Role: gact.RoleTool, Parts: []gact.Part{{Type: gact.PartTypeToolResult, CallID: "stranger"}}},
	}
	inline, absorbed := render.PairToolResults(msgs)
	if len(inline[0]) != 0 {
		t.Errorf("expected no results paired, got %d", len(inline[0]))
	}
	if absorbed[1] {
		t.Errorf("unpaired tool message must NOT be absorbed")
	}
}

// TestRenderPartsForRoleWithResults_Interleaves: the result for c1
// appears BETWEEN the c1 call and the c2 call in the rendered output.
func TestRenderPartsForRoleWithResults_Interleaves(t *testing.T) {
	parts := []gact.Part{
		{Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read", Input: map[string]any{"path": "a.go"}},
		{Type: gact.PartTypeToolCall, CallID: "c2", ToolName: "grep", Input: map[string]any{"pattern": "x"}},
	}
	results := map[string]gact.Part{
		"c1": {Type: gact.PartTypeToolResult, CallID: "c1", Content: []gact.Part{
			{Type: gact.PartTypeText, Text: "FILE_A_CONTENT"},
		}},
		"c2": {Type: gact.PartTypeToolResult, CallID: "c2", Content: []gact.Part{
			{Type: gact.PartTypeText, Text: "GREP_HIT"},
		}},
	}
	out := DefaultTheme().renderPartsForRoleWithResults(parts, 80, gact.RoleAssistant, results)

	// Order check: read header, then file content, then grep header,
	// then grep hit. Anchored to the toolName because lipgloss styling
	// wraps the rest in ANSI codes.
	idxRead := strings.Index(out, "Read")
	idxFile := strings.Index(out, "FILE_A_CONTENT")
	idxGrep := strings.Index(out, "Grep")
	idxHit := strings.Index(out, "GREP_HIT")
	if idxRead < 0 || idxFile < 0 || idxGrep < 0 || idxHit < 0 {
		t.Fatalf("missing expected substrings: %q", out)
	}
	if !(idxRead < idxFile && idxFile < idxGrep && idxGrep < idxHit) {
		t.Errorf("expected order Read < FILE < Grep < HIT; got %d %d %d %d in:\n%s",
			idxRead, idxFile, idxGrep, idxHit, out)
	}
}

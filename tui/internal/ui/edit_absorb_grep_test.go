package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// When an edit_file tool_call is paired with a sibling
// file_diff for the same path in the same message, the diff renders
// UNDER the edit_file header (absorbed) and the standalone "◇ diff"
// block is suppressed. User feedback: "EditFile returns the diff,
// there shouldn't be an 'ok' or a diff indicated but instead the
// changes".
func TestEditFile_AbsorbsSiblingDiff(t *testing.T) {
	before := "a\nb\nc\n"
	after := "a\nB\nc\n"
	parts := []gact.Part{
		{ID: "p_call", Type: gact.PartTypeToolCall, CallID: "c1",
			ToolName: "edit_file", Input: map[string]any{"path": "main.go"}},
		{ID: "p_diff", Type: gact.PartTypeFileDiff,
			Path: "main.go", Before: &before, After: &after},
	}
	// Give the tool_call a matching inline result of "ok" so we can
	// verify the "ok" row is NOT rendered.
	results := map[string]gact.Part{
		"c1": {ID: "p_result", Type: gact.PartTypeToolResult, CallID: "c1",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "ok"}}},
	}
	out := DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 80, gact.RoleAssistant, results, "")
	plain := stripANSI(out)

	// Must: EditFile header present.
	if !strings.Contains(plain, "EditFile(main.go)") {
		t.Errorf("missing EditFile header in:\n%s", plain)
	}
	// Must NOT: the standalone `◇ diff main.go` header (that's the
	// suppressed path).
	if strings.Contains(plain, "◇ diff main.go") {
		t.Errorf("sibling file_diff should be suppressed, but standalone diff header still rendered:\n%s", plain)
	}
	// Must NOT: the "⎿ ok" row — the diff replaces it as the edit's
	// body.
	trimmed := strings.ReplaceAll(plain, " ", "")
	if strings.Contains(trimmed, "⎿ok") {
		t.Errorf("'⎿ ok' row should not render when a diff is absorbed:\n%s", plain)
	}
	// Must: the diff body (some content that's in `after` only) is
	// rendered under the EditFile header.
	if !strings.Contains(plain, "B") {
		t.Errorf("diff body should be rendered inline; missing `B` marker from `after`:\n%s", plain)
	}
}

// A lone file_diff (no matching edit_file call) keeps
// its standalone rendering — back-compat with the diff-without-edit
// flow from the runDiffScript variants.
func TestEditFile_LoneFileDiffStillRendersStandalone(t *testing.T) {
	before := "a\n"
	after := "B\n"
	parts := []gact.Part{
		{ID: "p_diff", Type: gact.PartTypeFileDiff,
			Path: "main.go", Before: &before, After: &after},
	}
	out := DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 80, gact.RoleAssistant, nil, "")
	plain := stripANSI(out)
	if !strings.Contains(plain, "◇ diff main.go") {
		t.Errorf("standalone file_diff should render its `◇ diff` header; got:\n%s", plain)
	}
}

// Grep tool_result renders CC-style with a file header +
// line-number gutter instead of raw "path:line:content" text. User
// feedback: "the line numbers should be added by us not for them to
// be on the file".
func TestGrepResult_RendersGutter(t *testing.T) {
	parts := []gact.Part{
		{ID: "p_call", Type: gact.PartTypeToolCall, CallID: "c1",
			ToolName: "grep", Input: map[string]any{"pattern": `println\(`}},
	}
	results := map[string]gact.Part{
		"c1": {ID: "p_result", Type: gact.PartTypeToolResult, CallID: "c1",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: strings.Join([]string{
				`main.go:26:	println("fatal: --db or DB_URL required")`,
				`main.go:34:	println("fatal: db open:", err.Error())`,
				`internal/handlers/handlers.go:25:		println("[req]")`,
			}, "\n")}}},
	}
	out := DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 80, gact.RoleAssistant, results, "")
	plain := stripANSI(out)

	// Must: file headers are grouped (each path appears once).
	mainCount := strings.Count(plain, "main.go\n")
	if mainCount > 1 {
		t.Errorf("main.go should appear once as a header row; got %d occurrences in:\n%s", mainCount, plain)
	}
	// Must: line numbers 26, 34, 25 appear as gutter values.
	for _, want := range []string{"26", "34", "25"} {
		if !strings.Contains(plain, want) {
			t.Errorf("expected line number %q in gutter; got:\n%s", want, plain)
		}
	}
	// Must NOT: the raw "main.go:26:" prefix duplicated inside
	// content — the parser should have stripped it.
	if strings.Count(plain, "main.go:26:") > 0 {
		t.Errorf("raw 'main.go:26:' prefix should NOT appear in rendered output; got:\n%s", plain)
	}
	// Must: at least one content token that was to the right of the
	// second colon survives.
	if !strings.Contains(plain, `println("fatal: --db or DB_URL required")`) {
		t.Errorf("expected the content after 'path:line:' to survive; got:\n%s", plain)
	}
}

// A grep result that fails to parse (non-standard
// format) falls through to the generic tool_result render so we
// never swallow real output.
func TestGrepResult_UnparseableFallsThrough(t *testing.T) {
	parts := []gact.Part{
		{ID: "p_call", Type: gact.PartTypeToolCall, CallID: "c1",
			ToolName: "grep", Input: map[string]any{"pattern": "x"}},
	}
	results := map[string]gact.Part{
		"c1": {ID: "p_result", Type: gact.PartTypeToolResult, CallID: "c1",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "no colons here"}}},
	}
	out := DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 80, gact.RoleAssistant, results, "")
	plain := stripANSI(out)
	if !strings.Contains(plain, "no colons here") {
		t.Errorf("unparseable grep output should still render via fallback; got:\n%s", plain)
	}
}

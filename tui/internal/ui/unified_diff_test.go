package ui

import (
	"strings"
	"testing"
)

// The file_diff renderer must produce a real hunk-aware
// unified diff (Crush / Claude-Code style — "this is what we
// changed") for non-trivial changes. Asserts the hallmarks: a `@@`
// hunk header, at least one `+` insertion row, at least one `-`
// deletion row, and at least one surrounding context row (` ` prefix
// or non-+/- line retained from the source).
func TestUnifiedDiffView_HasHunkHeaderAndContext(t *testing.T) {
	before := strings.Join([]string{
		"package main",
		"",
		"import \"fmt\"",
		"",
		"func main() {",
		"\tfmt.Println(\"hello\")",
		"\tfmt.Println(\"world\")",
		"\tfmt.Println(\"!\")",
		"\tfmt.Println(\"done\")",
		"}",
	}, "\n") + "\n"
	after := strings.Join([]string{
		"package main",
		"",
		"import \"log\"",
		"",
		"func main() {",
		"\tlog.Println(\"hello\")",
		"\tlog.Println(\"world\")",
		"\tlog.Println(\"!\")",
		"\tlog.Println(\"done\")",
		"}",
	}, "\n") + "\n"

	out := unifiedDiffView("main.go", before, after, 80, DefaultTheme())
	// `@@ -X,Y +A,B @@` hunk header — distinguishes us from simpleDiff.
	if !strings.Contains(stripANSI(out), "@@") {
		t.Errorf("expected hunk header `@@` in output; got:\n%s", stripANSI(out))
	}
	// At least one deletion and one insertion.
	if !strings.Contains(stripANSI(out), "- ") || !strings.Contains(stripANSI(out), "+ ") {
		t.Errorf("expected +/- lines in output; got:\n%s", stripANSI(out))
	}
	// Context — lines that aren't +/- (e.g. the unchanged `package main`
	// that surrounds the change). If context is missing, we're just
	// emitting the raw diff-only pairs and regressed to simpleDiff.
	plain := stripANSI(out)
	hasContext := false
	for _, ln := range strings.Split(plain, "\n") {
		if strings.HasPrefix(ln, "  ") && !strings.HasPrefix(ln, "  -") && !strings.HasPrefix(ln, "  +") {
			if strings.Contains(ln, "package main") || strings.Contains(ln, "func main") {
				hasContext = true
				break
			}
		}
	}
	if !hasContext {
		t.Errorf("expected at least one context line in hunk; got:\n%s", plain)
	}
}

// Tiny diffs (≤ 6 total lines) route through simpleDiff so
// the hunk header isn't more noise than signal for a one-liner. This
// test pins that short-circuit so a future refactor doesn't
// accidentally always go through the hunk path.
func TestUnifiedDiffView_TinyChangesUseSimpleDiff(t *testing.T) {
	before := "hello\n"
	after := "hello world\n"
	out := unifiedDiffView("x.txt", before, after, 80, DefaultTheme())
	// No `@@` header on tiny diffs — they use simpleDiff's row-aligned
	// output with just +/- lines.
	if strings.Contains(stripANSI(out), "@@") {
		t.Errorf("tiny diff should short-circuit to simpleDiff (no @@ header); got:\n%s", stripANSI(out))
	}
}

// stripANSI removes ANSI escape sequences so assertions about content
// survive the colour-wrapping. Mirrors the one in tests that render
// lipgloss output.
func stripANSI(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		if r == 0x1b {
			in = true
			continue
		}
		if in {
			if r == 'm' || r == 'K' || r == 'H' || r == 'J' {
				in = false
			}
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

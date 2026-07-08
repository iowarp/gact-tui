package ui

// render_previews.go provides preview collapsing, line counting, and unified/simple diff views.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	udiff "github.com/aymanbagabas/go-udiff"
)

// toolResultPreviewLines is the inline preview budget for tool_result
// bodies. Anything longer collapses to this many lines + a "[N more]"
// footer. 8 lines hits the typical "`tail -N` output fits on one
// screen" sweet spot without drowning the conversation pane.
const toolResultPreviewLines = 8

// compactionPreviewLines keeps synthetic memory summaries visible without
// letting them dominate the transcript. The full summary remains reachable
// through the selected part detail view.
const compactionPreviewLines = 6

// collapseForPreview returns (visible, hidden) where visible is the
// first `n` lines of s and hidden is the count of lines not shown
// (0 when s already fits in n lines). Preserves trailing-newline
// absence — if s has no trailing \n, the visible prefix doesn't
// either. Used by tool_result rendering to keep big outputs from
// blowing up the viewport; the full content is reachable via the
// Ctrl+E detail view.
func collapseForPreview(s string, n int) (string, int) {
	if n <= 0 {
		return "", lineCount(s)
	}
	lines := strings.Split(s, "\n")
	// Trailing empty line from Split("text\n", "\n") shouldn't count
	// toward the visible budget — collapse() treats "text\n" as 1
	// line, not 2.
	total := len(lines)
	if total > 0 && lines[total-1] == "" {
		total--
	}
	if total <= n {
		return s, 0
	}
	visible := strings.Join(lines[:n], "\n")
	return visible, total - n
}

// lineCount counts content lines in s (no trailing-empty inflation).
// Used by the detail view to show "{count} lines" without surprising
// off-by-ones on strings with/without a trailing newline.
func lineCount(s string) int {
	if s == "" {
		return 0
	}
	n := strings.Count(s, "\n")
	if !strings.HasSuffix(s, "\n") {
		n++
	}
	return n
}

// indentWithGlyph prepends `glyph` to the first line of s and `cont`
// to every continuation line. Used by the tool_result render to
// produce:
//
//	⎿ first line of output
//	   second line of output
//	   third line of output
//
// Preserves trailing-newline absence — if s has no trailing \n, the
// output doesn't either.
func indentWithGlyph(s, glyph, cont string) string {
	if s == "" {
		return glyph
	}
	lines := strings.Split(s, "\n")
	out := make([]string, len(lines))
	for i, l := range lines {
		if i == 0 {
			out[i] = glyph + " " + l
		} else {
			out[i] = cont + l
		}
	}
	return strings.Join(out, "\n")
}

// unifiedDiffView renders a real hunk-aware diff
// (Myers/LCS via go-udiff) instead of the primitive row-aligned diff
// simpleDiff produces. Output mirrors `git diff --no-color` in
// structure:
//
//	@@ -A,B +C,D @@                    ← hunk header (muted primary)
//	   context line                    ← 2-space gutter, dim fg
//	 - removed line                    ← red
//	 + added line                      ← green
//
// For tiny changes (before+after <= 6 lines combined) it short-
// circuits to simpleDiff — the unified diff's hunk header is more
// noise than signal on a one-liner. width is the inner column budget
// before the caller's indent — each line is truncated to width-2 so
// the gutter glyph always fits.
func unifiedDiffView(path, before, after string, width int, t Theme) string {
	lineCount := func(s string) int {
		if s == "" {
			return 0
		}
		return strings.Count(s, "\n") + 1
	}
	if lineCount(before)+lineCount(after) <= 6 {
		return simpleDiff(before, after, width)
	}
	// go-udiff's Unified() uses 3 context lines, which matches git's
	// default and is what Crush/CC use.
	raw := udiff.Unified(path, path, before, after)
	if raw == "" {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("(no changes)")
	}
	// Strip the `--- path` / `+++ path` header rows; we already
	// rendered the file name in the part head above, and the
	// redundant row wastes vertical budget.
	var out []string
	dimStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	hunkStyle := lipgloss.NewStyle().Foreground(t.Primary).Bold(true)
	delStyle := lipgloss.NewStyle().Foreground(red)
	addStyle := lipgloss.NewStyle().Foreground(green)
	ctxStyle := lipgloss.NewStyle().Foreground(t.Fg)
	for _, ln := range strings.Split(strings.TrimRight(raw, "\n"), "\n") {
		if strings.HasPrefix(ln, "--- ") || strings.HasPrefix(ln, "+++ ") {
			continue
		}
		if strings.HasPrefix(ln, "@@") {
			// Hunk header: keep the whole line, coloured to stand out.
			out = append(out, hunkStyle.Render(textutil.Truncate(ln, width)))
			continue
		}
		if len(ln) == 0 {
			out = append(out, "")
			continue
		}
		prefix, rest := ln[:1], ln[1:]
		// Pad/truncate rest to width-2 so the gutter stays visible on
		// long lines (keep the leading `- ` / `+ ` marker).
		rest = textutil.Truncate(rest, width-2)
		switch prefix {
		case "-":
			out = append(out, delStyle.Render("- "+rest))
		case "+":
			out = append(out, addStyle.Render("+ "+rest))
		case " ":
			// Context lines: dim but readable. `·` at the start so the
			// gutter reads as a 2-char prefix like the +/- cases.
			out = append(out, ctxStyle.Render("  "+rest))
		case "\\":
			// "\ No newline at end of file" — muted, rare.
			out = append(out, dimStyle.Italic(true).Render(textutil.Truncate(ln, width)))
		default:
			out = append(out, textutil.Truncate(ln, width))
		}
	}
	return strings.Join(out, "\n")
}

// simpleDiff produces a primitive +/- per-line diff — fine for the demo
// output. A real implementation would use an LCS diff.
func simpleDiff(before, after string, width int) string {
	bs := strings.Split(strings.TrimRight(before, "\n"), "\n")
	as := strings.Split(strings.TrimRight(after, "\n"), "\n")
	out := []string{}
	min := len(bs)
	if len(as) < min {
		min = len(as)
	}
	for i := 0; i < min; i++ {
		if bs[i] == as[i] {
			out = append(out, "  "+textutil.Truncate(bs[i], width-2))
			continue
		}
		out = append(out, lipgloss.NewStyle().Foreground(red).Render("- "+textutil.Truncate(bs[i], width-2)))
		out = append(out, lipgloss.NewStyle().Foreground(green).Render("+ "+textutil.Truncate(as[i], width-2)))
	}
	for i := min; i < len(bs); i++ {
		out = append(out, lipgloss.NewStyle().Foreground(red).Render("- "+textutil.Truncate(bs[i], width-2)))
	}
	for i := min; i < len(as); i++ {
		out = append(out, lipgloss.NewStyle().Foreground(green).Render("+ "+textutil.Truncate(as[i], width-2)))
	}
	return strings.Join(out, "\n")
}

var (
	red   = lipgloss.Color("#FF6B6B")
	green = lipgloss.Color("#73F59F")
)

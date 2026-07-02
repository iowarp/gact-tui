package ui

// execution_render_format.go formats execution prose, tool-call lines, observation blocks, and indentation.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func executionProseWrapWidth(width int) int {
	w := width - 8
	if w < 24 {
		return max(12, width-2)
	}
	return w
}

func executionWrapForPrefix(text string, width int, prefix string) string {
	w := executionProseWrapWidth(width) - lipgloss.Width(prefix)
	if w < 12 {
		w = 12
	}
	return indentText(textutil.Wrap(text, w), prefix)
}

func executionDisplayProse(text string) string {
	text = stripExecutionControlSections(stripSemanticControlContracts(text))
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "`", "")
	return flowExecutionProse(text)
}

// executionDisplayProseFull is executionDisplayProse WITHOUT the semantic
// summary truncation: control-contract markers are still stripped, but the
// prose keeps its full length. The unified transcript render (#233) uses it
// for assistant text parts \u2014 the web renders the same rows in full, and the
// flat render this replaced never truncated them.
func executionDisplayProseFull(text string) string {
	text = stripExecutionControlSections(stripSemanticControlMarkers(text))
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "`", "")
	return flowExecutionProse(text)
}

func flowExecutionProse(text string) string {
	var out []string
	var paragraph []string
	flushParagraph := func() {
		if len(paragraph) == 0 {
			return
		}
		out = append(out, strings.Join(paragraph, " "))
		paragraph = nil
	}
	for _, raw := range strings.Split(strings.TrimSpace(text), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			flushParagraph()
			if len(out) > 0 && out[len(out)-1] != "" {
				out = append(out, "")
			}
			continue
		}
		line = strings.Join(strings.Fields(line), " ")
		if executionProseLineIsBoundary(line) {
			flushParagraph()
			out = append(out, line)
			continue
		}
		paragraph = append(paragraph, line)
	}
	flushParagraph()
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func executionProseLineIsBoundary(line string) bool {
	if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
		return true
	}
	if len(line) > 3 && line[0] >= '0' && line[0] <= '9' {
		if dot := strings.Index(line, ". "); dot > 0 && dot <= 3 {
			return true
		}
	}
	return false
}

func (t Theme) executionToolCallLine(toolName string, args any, width int) string {
	name := firstNonEmpty(toolDisplayName(toolName), toolName, "tool")
	nameStyle := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true)
	if argsText := executionArgsPreview(args); argsText != "" {
		plain := name + "(" + argsText + ")"
		if lipgloss.Width(plain) > width {
			keep := max(1, width-lipgloss.Width(name)-3)
			argsText = textutil.Truncate(argsText, keep)
		}
		return nameStyle.Render(name) +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render("(") +
			lipgloss.NewStyle().Foreground(t.Fg).Render(argsText) +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(")")
	}
	return nameStyle.Render(textutil.Truncate(name, width))
}

func (t Theme) executionObservationBlock(observation string) string {
	glyph := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).Render("⎿")
	lines := strings.Split(strings.TrimRight(observation, "\n"), "\n")
	for i := range lines {
		lines[i] = t.executionObservationLine(lines[i])
	}
	return indentWithGlyph(strings.Join(lines, "\n"), glyph, " ")
}

func (t Theme) executionObservationLine(line string) string {
	switch classifyExecutionObservationLine(line) {
	case executionObservationLineAdded:
		return lipgloss.NewStyle().Foreground(t.Success).Render(line)
	case executionObservationLineRemoved:
		return lipgloss.NewStyle().Foreground(t.Danger).Render(line)
	case executionObservationLineAffordance:
		return lipgloss.NewStyle().Foreground(t.FgFaint).Render(line)
	case executionObservationLineTable:
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(line)
	default:
		return line
	}
}

func executionIndent(depth int) string {
	if depth < 0 {
		depth = 0
	}
	return strings.Repeat("  ", depth)
}

func executionContentIndent(depth int) string {
	return executionIndent(depth) + "  "
}

func indentText(text, prefix string) string {
	text = strings.TrimRight(text, "\n")
	if text == "" {
		return ""
	}
	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

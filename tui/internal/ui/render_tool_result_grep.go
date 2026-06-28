package ui

// render_tool_result_grep.go renders grep tool results.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// renderGrepResult parses grep's "path:line:content" output and renders a
// file header with a line-number gutter per hit. It returns "" when parsing
// fails so the caller can fall back to the raw tool_result render.
func (t Theme) renderGrepResult(p gact.Part, width int) string {
	raw := ""
	for i, c := range p.Content {
		if i > 0 {
			raw += "\n"
		}
		if c.Type == gact.PartTypeText {
			raw += c.Text
		}
	}
	raw = strings.TrimRight(raw, "\n")
	if raw == "" {
		return ""
	}
	type hit struct {
		path    string
		line    string
		content string
	}
	var hits []hit
	for _, row := range strings.Split(raw, "\n") {
		p1 := strings.IndexByte(row, ':')
		if p1 < 0 {
			return ""
		}
		p2 := strings.IndexByte(row[p1+1:], ':')
		if p2 < 0 {
			return ""
		}
		p2 += p1 + 1
		hits = append(hits, hit{
			path:    row[:p1],
			line:    row[p1+1 : p2],
			content: strings.TrimLeft(row[p2+1:], "\t "),
		})
	}
	if len(hits) == 0 {
		return ""
	}
	gutterW := 0
	for _, h := range hits {
		if w := lipgloss.Width(h.line); w > gutterW {
			gutterW = w
		}
	}
	if gutterW < 2 {
		gutterW = 2
	}
	barColor := t.RoleTool
	if barColor == nil {
		barColor = t.Border
	}
	elbow := lipgloss.NewStyle().Foreground(barColor).Render("⎿")
	bar := lipgloss.NewStyle().Foreground(barColor).Render("│")
	pathStyle := lipgloss.NewStyle().Foreground(t.Primary).Bold(true)
	lineStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	contentStyle := lipgloss.NewStyle().Foreground(t.Fg)

	bodyBudget := width - 3 - gutterW - 1 - 2
	if bodyBudget < 10 {
		bodyBudget = 10
	}

	var rows []string
	rows = append(rows, elbow)
	lastPath := ""
	for _, h := range hits {
		if h.path != lastPath {
			if lastPath != "" {
				rows = append(rows, " "+bar)
			}
			rows = append(rows, " "+bar+" "+pathStyle.Render(h.path))
			lastPath = h.path
		}
		padded := strings.Repeat(" ", gutterW-lipgloss.Width(h.line)) + h.line
		content := h.content
		if lipgloss.Width(content) > bodyBudget {
			content = textutil.Truncate(content, bodyBudget)
		}
		row := " " + bar + " " +
			lineStyle.Render(padded) + " " + bar + " " + contentStyle.Render(content)
		rows = append(rows, row)
	}
	return strings.Join(rows, "\n")
}

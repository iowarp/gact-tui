package ui

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// renderDeclaredToolPresentation interprets block types, never tool names or raw JSON.
func (t Theme) renderDeclaredToolPresentation(p gact.Part, width int, running bool) string {
	if p.Presentation == nil {
		return ""
	}
	threshold := t.CollapseThreshold
	if threshold < 1 {
		threshold = 5
	}
	if width < 8 {
		width = 8
	}
	var rendered []string
	if p.Presentation.Summary != "" {
		rendered = append(rendered, textutil.Wrap(p.Presentation.Summary, width-3))
	}
	for _, block := range p.Presentation.Blocks {
		budget := threshold
		if block.Type == "diff" {
			budget *= 2
		}
		text := block.Text
		if block.Type == "link" {
			text = block.Label + " · " + block.URI
		}
		if block.Command != "" {
			rendered = append(rendered, "$ "+textutil.Wrap(block.Command, width-5))
		}
		wrapped := textutil.Wrap(text, width-3)
		if running && block.Type == "terminal" {
			lines := strings.Split(wrapped, "\n")
			if len(lines) > budget {
				lines = lines[len(lines)-budget:]
			}
			rendered = append(rendered, strings.Join(lines, "\n"))
		} else {
			preview, hidden := collapseForPreview(wrapped, budget)
			rendered = append(rendered, preview)
			if hidden > 0 {
				rendered = append(rendered, t.renderToolDetailHint(fmt.Sprintf("%d more lines", hidden)))
			}
		}
		if !running && block.Type == "terminal" {
			if block.TimedOut {
				rendered = append(rendered, "Process timed out.")
			} else if block.ExitCode != nil {
				rendered = append(rendered, fmt.Sprintf("Process exited with code %d.", *block.ExitCode))
			}
		}
	}
	return strings.Join(rendered, "\n")
}

// Package presentation renders provider-declared results without tool-name inference.
package presentation

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// Render interprets declared block types, never tool names or raw JSON.
func Render(p gact.Part, width, threshold int, running bool, detailHint func(string) string) string {
	if p.Presentation == nil {
		return ""
	}
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
			lines := strings.Split(wrapped, "\n")
			hidden := max(0, len(lines)-budget)
			preview := strings.Join(lines[:min(len(lines), budget)], "\n")
			rendered = append(rendered, preview)
			if hidden > 0 {
				rendered = append(rendered, detailHint(fmt.Sprintf("%d more lines", hidden)))
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

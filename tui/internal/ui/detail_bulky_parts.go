package ui

// detail_bulky_parts.go locates the bulky (detail-worthy) part in a message and flattens tool results.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// findBulkyPartIn scans a single message for a bulky tool_result or text part
// when the body cursor points at a message but not a specific addressable part.
func findBulkyPartIn(m gact.Message) (bulkyPartRef, bool) {
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeToolResult:
			text := flattenToolResult(p)
			if lineCount(text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
				fullText:  text,
			}, true
		case gact.PartTypeText:
			if lineCount(p.Text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
				fullText:  p.Text,
			}, true
		}
	}
	return bulkyPartRef{}, false
}

// findLatestBulkyPart walks messages in reverse and returns the newest
// tool_result or text part that exceeds the inline preview budget.
func findLatestBulkyPart(msgs []gact.Message) (bulkyPartRef, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		for _, p := range m.Parts {
			switch p.Type {
			case gact.PartTypeToolResult:
				text := flattenToolResult(p)
				if lineCount(text) <= toolResultPreviewLines {
					continue
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    p.ID,
					title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
					fullText:  text,
				}, true
			case gact.PartTypeText:
				if lineCount(p.Text) <= toolResultPreviewLines {
					continue
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    p.ID,
					title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
					fullText:  p.Text,
				}, true
			}
		}
	}
	return bulkyPartRef{}, false
}

// flattenToolResult returns the concatenated text content of a tool_result
// part's sub-parts, matching the inline renderer's sibling text layout.
func flattenToolResult(p gact.Part) string {
	var b strings.Builder
	for i, c := range p.Content {
		if i > 0 {
			b.WriteString("\n")
		}
		if c.Type == gact.PartTypeText {
			b.WriteString(c.Text)
		}
	}
	return b.String()
}

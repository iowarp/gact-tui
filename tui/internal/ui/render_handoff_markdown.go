package ui

// render_handoff_markdown.go expands and truncates markdown tables inside handoff text.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func expandInlineMarkdownTables(text string) string {
	text = strings.TrimSpace(text)
	if text == "" || strings.Contains(text, "\n|") || !strings.Contains(text, "|") {
		return text
	}
	if !strings.Contains(text, "|---") && !strings.Contains(text, "| ---") && !strings.Contains(text, "|------") {
		return text
	}
	fields := strings.Split(text, "|")
	if len(fields) < 8 {
		return text
	}
	separatorStart := -1
	for i := 1; i < len(fields); i++ {
		cell := strings.TrimSpace(fields[i])
		if cell == "" && i+1 < len(fields) && markdownSeparatorCell(fields[i+1]) {
			separatorStart = i + 1
			break
		}
		if markdownSeparatorCell(cell) {
			separatorStart = i
			break
		}
	}
	if separatorStart <= 1 {
		return text
	}
	headerEnd := separatorStart
	if headerEnd > 0 && strings.TrimSpace(fields[headerEnd-1]) == "" {
		headerEnd--
	}
	headerStart := headerEnd - 1
	for headerStart > 0 && strings.TrimSpace(fields[headerStart]) != "" {
		headerStart--
	}
	headerStart++
	if headerStart >= headerEnd {
		return text
	}
	columnCount := headerEnd - headerStart
	if columnCount < 2 {
		return text
	}
	prefix := strings.TrimSpace(strings.Join(fields[:headerStart], "|"))
	cells := make([]string, 0, len(fields)-headerStart)
	for _, raw := range fields[headerStart:headerEnd] {
		cell := strings.TrimSpace(raw)
		if cell == "" {
			continue
		}
		cells = append(cells, cell)
	}
	for _, raw := range fields[separatorStart:] {
		cell := strings.TrimSpace(raw)
		if cell == "" {
			continue
		}
		cells = append(cells, cell)
	}
	if len(cells) < 6 {
		return text
	}
	remainder := []string{}
	if len(cells)%columnCount != 0 {
		fullCells := (len(cells) / columnCount) * columnCount
		if fullCells < columnCount*3 {
			return text
		}
		remainder = cells[fullCells:]
		cells = cells[:fullCells]
	}
	if len(cells)%columnCount != 0 {
		return text
	}
	var rows []string
	var prefixParts []string
	if prefix != "" {
		prefixParts = append(prefixParts, prefix)
	}
	for i := 0; i+columnCount <= len(cells); i += columnCount {
		rows = append(rows, "| "+strings.Join(cells[i:i+columnCount], " | ")+" |")
	}
	if len(rows) < 2 {
		return text
	}
	if len(prefixParts) > 0 {
		out := strings.Join(prefixParts, "\n\n") + "\n\n" + strings.Join(rows, "\n")
		if len(remainder) > 0 {
			out += "\n\n" + strings.Join(remainder, " ")
		}
		return out
	}
	out := strings.Join(rows, "\n")
	if len(remainder) > 0 {
		out += "\n\n" + strings.Join(remainder, " ")
	}
	return out
}

func markdownSeparatorCell(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	text = strings.Trim(text, ":- ")
	return text == ""
}

func truncateMarkdownBlock(text string, maxChars, maxLines int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	lines := strings.Split(text, "\n")
	truncated := false
	if maxLines > 0 && len(lines) > maxLines {
		lines = lines[:maxLines]
		truncated = true
	}
	out := strings.TrimSpace(strings.Join(lines, "\n"))
	if maxChars > 0 && len(out) > maxChars {
		out = strings.TrimSpace(textutil.Truncate(out, maxChars))
		truncated = true
	}
	if truncated {
		out += "\n\n_full summary available in detail_"
	}
	return out
}

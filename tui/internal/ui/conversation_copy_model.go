package ui

// conversation_copy_model.go defines the conversation copy snapshot/drag model and selection-text extraction.

import (
	"fmt"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/charmbracelet/x/ansi"
)

type conversationCopySnapshot struct {
	rect  mouseRect
	lines []string
}

type conversationCopyDrag struct {
	active bool
	moved  bool
	startX int
	startY int
	endX   int
	endY   int
}

func copiedSelectionToast(label, text string, chars int) string {
	preview := copiedSelectionPreview(text, 56)
	if preview == "" {
		return fmt.Sprintf("copied %s (%d chars)", label, chars)
	}
	return fmt.Sprintf("copied %s (%d chars): %s", label, chars, preview)
}

func copiedSelectionPreview(text string, limit int) string {
	preview := strings.Join(strings.Fields(text), " ")
	preview = textutil.Truncate(preview, limit)
	if preview == "" {
		return ""
	}
	return strconv.Quote(preview)
}

func activeTextSelectionStatus(label string, snapshot conversationCopySnapshot, drag conversationCopyDrag) string {
	if !drag.active {
		return ""
	}
	if !drag.moved {
		return "copy " + label + " - drag to choose text"
	}
	text := visibleConversationSelectionText(snapshot, drag.startX, drag.startY, drag.endX, drag.endY)
	if strings.TrimSpace(text) == "" {
		return "copy text - release when text is highlighted"
	}
	count := len([]rune(text))
	status := fmt.Sprintf("copy text (%d chars) - release to copy", count)
	if preview := copiedSelectionPreview(text, 44); preview != "" {
		status += ": " + preview
	}
	return status
}

func visibleConversationSelectionText(snapshot conversationCopySnapshot, startX, startY, endX, endY int) string {
	if snapshot.rect.w <= 0 || snapshot.rect.h <= 0 || len(snapshot.lines) == 0 {
		return ""
	}
	startRow, endRow, startCol, endCol := normalizedConversationCopySelection(snapshot, startX, startY, endX, endY)
	if startRow > endRow {
		return ""
	}
	if endRow >= len(snapshot.lines) {
		endRow = len(snapshot.lines) - 1
	}
	if startRow > endRow {
		return ""
	}
	out := make([]string, 0, endRow-startRow+1)
	for row := startRow; row <= endRow; row++ {
		line := snapshot.lines[row]
		from, to := 0, lipgloss.Width(line)
		if row == startRow {
			from = startCol
		}
		if row == endRow {
			to = endCol + 1
		}
		if to < from {
			to = from
		}
		out = append(out, strings.TrimRight(visualCellSlice(line, from, to), " "))
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n")
}

func normalizedConversationCopySelection(snapshot conversationCopySnapshot, startX, startY, endX, endY int) (startRow, endRow, startCol, endCol int) {
	startRow = startY - snapshot.rect.y
	endRow = endY - snapshot.rect.y
	startCol = startX - snapshot.rect.x
	endCol = endX - snapshot.rect.x
	if startRow > endRow || (startRow == endRow && startCol > endCol) {
		startRow, endRow = endRow, startRow
		startCol, endCol = endCol, startCol
	}
	if startRow < 0 {
		startRow = 0
	}
	maxRow := len(snapshot.lines) - 1
	if endRow > maxRow {
		endRow = maxRow
	}
	if startCol < 0 {
		startCol = 0
	}
	if endCol < 0 {
		endCol = 0
	}
	if startCol >= snapshot.rect.w {
		startCol = snapshot.rect.w - 1
	}
	if endCol >= snapshot.rect.w {
		endCol = snapshot.rect.w - 1
	}
	return startRow, endRow, startCol, endCol
}

func visualCellSlice(line string, start, end int) string {
	if start < 0 {
		start = 0
	}
	lineW := ansi.StringWidth(line)
	if end > lineW {
		end = lineW
	}
	if start >= end {
		return ""
	}
	return ansi.TruncateLeft(ansi.Truncate(line, end, ""), start, "")
}

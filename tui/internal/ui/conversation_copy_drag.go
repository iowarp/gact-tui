package ui

import (
	"fmt"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"
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

func (a *App) setConversationCopySnapshot(body string, viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	lines := strings.Split(ansi.Strip(body), "\n")
	if len(lines) > viewportRows {
		lines = lines[:viewportRows]
	}
	a.conversationCopy = conversationCopySnapshot{
		rect:  a.conversationContentRect(0, 0, contentW, viewportRows, bodyWidth, hasPermissionBanner),
		lines: lines,
	}
}

func (a *App) beginConversationCopyDrag(x, y int) bool {
	if !a.conversationCopy.rect.contains(x, y) {
		a.copyDrag = conversationCopyDrag{}
		return false
	}
	a.copyDrag = conversationCopyDrag{
		active: true,
		startX: x,
		startY: y,
		endX:   x,
		endY:   y,
	}
	return true
}

func (a *App) updateConversationCopyDrag(x, y int) {
	if !a.copyDrag.active {
		return
	}
	x, y = a.clampConversationCopyPoint(x, y)
	if x != a.copyDrag.startX || y != a.copyDrag.startY {
		a.copyDrag.moved = true
	}
	a.copyDrag.endX = x
	a.copyDrag.endY = y
}

func (a *App) finishConversationCopyDrag(x, y int) bool {
	if !a.copyDrag.active {
		return false
	}
	a.updateConversationCopyDrag(x, y)
	drag := a.copyDrag
	a.copyDrag = conversationCopyDrag{}
	if !drag.moved {
		return false
	}
	text := visibleConversationSelectionText(a.conversationCopy, drag.startX, drag.startY, drag.endX, drag.endY)
	if strings.TrimSpace(text) == "" {
		a.transientHint = "nothing to copy - drag selected no text"
		return true
	}
	a.transientHint = copyExactTextToClipboard(text, "nothing to copy - drag selected no text", func(chars int) string {
		return copiedSelectionToast("visible text", text, chars)
	})
	return true
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
	preview = truncate(preview, limit)
	if preview == "" {
		return ""
	}
	return strconv.Quote(preview)
}

func (a *App) mouseSelectionModeLabel() string {
	if a.MouseEnabled {
		return "CLIO copy"
	}
	return "terminal select"
}

func (a *App) mouseSelectionModeHint() string {
	if a.MouseEnabled {
		return "mouse mode: CLIO copy - wheel/click enabled; drag copies visible text"
	}
	return "mouse mode: terminal select - drag selects text in the terminal"
}

func (a *App) activeCopyDragStatus() string {
	if a.detailCopyDrag.active {
		return activeTextSelectionStatus("detail selection", a.detailCopy, a.detailCopyDrag)
	}
	if a.copyDrag.active {
		return activeTextSelectionStatus("visible text", a.conversationCopy, a.copyDrag)
	}
	return ""
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

func (a *App) renderConversationCopyDragHighlight(body string) string {
	if !a.copyDrag.active {
		return body
	}
	localSnapshot := a.conversationCopy
	localDrag := a.copyDrag
	localDrag.startX -= localSnapshot.rect.x
	localDrag.endX -= localSnapshot.rect.x
	localDrag.startY -= localSnapshot.rect.y
	localDrag.endY -= localSnapshot.rect.y
	localSnapshot.rect.x = 0
	localSnapshot.rect.y = 0
	return renderConversationCopySelection(body, localSnapshot, localDrag, a.Theme)
}

func (a *App) clampConversationCopyPoint(x, y int) (int, int) {
	r := a.conversationCopy.rect
	if r.w <= 0 || r.h <= 0 {
		return x, y
	}
	if x < r.x {
		x = r.x
	}
	if x >= r.x+r.w {
		x = r.x + r.w - 1
	}
	if y < r.y {
		y = r.y
	}
	if y >= r.y+r.h {
		y = r.y + r.h - 1
	}
	return x, y
}

func renderConversationCopySelection(body string, snapshot conversationCopySnapshot, drag conversationCopyDrag, theme Theme) string {
	if snapshot.rect.w <= 0 || snapshot.rect.h <= 0 || len(snapshot.lines) == 0 {
		return body
	}
	startRow, endRow, startCol, endCol := normalizedConversationCopySelection(snapshot, drag.startX, drag.startY, drag.endX, drag.endY)
	if startRow > endRow {
		return body
	}
	lines := strings.Split(ansi.Strip(body), "\n")
	selectionStyle := lipgloss.NewStyle().
		Foreground(theme.Bg).
		Background(theme.Secondary).
		Bold(true).
		Underline(true)
	for row := startRow; row <= endRow && row < len(lines); row++ {
		line := lines[row]
		from, to := 0, lipgloss.Width(line)
		if row == startRow {
			from = startCol
		}
		if row == endRow {
			to = endCol + 1
		}
		if !drag.moved && row == startRow && to < from+8 {
			to = from + 8
		}
		if to < from {
			to = from
		}
		prefix := visualCellSlice(line, 0, from)
		selected := visualCellSlice(line, from, to)
		suffix := visualCellSlice(line, to, lipgloss.Width(line))
		if selected == "" && from < snapshot.rect.w {
			selected = " "
		}
		lines[row] = prefix + selectionStyle.Render(selected) + suffix
	}
	return strings.Join(lines, "\n")
}

func renderCopySelectionOnSurface(surface string, snapshot conversationCopySnapshot, drag conversationCopyDrag, theme Theme) string {
	if snapshot.rect.w <= 0 || snapshot.rect.h <= 0 || len(snapshot.lines) == 0 {
		return surface
	}
	startRow, endRow, startCol, endCol := normalizedConversationCopySelection(snapshot, drag.startX, drag.startY, drag.endX, drag.endY)
	if startRow > endRow {
		return surface
	}
	lines := strings.Split(ansi.Strip(surface), "\n")
	selectionStyle := lipgloss.NewStyle().
		Foreground(theme.Bg).
		Background(theme.Secondary).
		Bold(true).
		Underline(true)
	for row := startRow; row <= endRow; row++ {
		surfaceRow := snapshot.rect.y + row
		if surfaceRow < 0 || surfaceRow >= len(lines) {
			continue
		}
		line := lines[surfaceRow]
		from, to := 0, lipgloss.Width(line)
		if row == startRow {
			from = startCol
		}
		if row == endRow {
			to = endCol + 1
		}
		if !drag.moved && row == startRow && to < from+8 {
			to = from + 8
		}
		if to < from {
			to = from
		}
		from += snapshot.rect.x
		to += snapshot.rect.x
		prefix := visualCellSlice(line, 0, from)
		selected := visualCellSlice(line, from, to)
		suffix := visualCellSlice(line, to, lipgloss.Width(line))
		if selected == "" && from < lipgloss.Width(line) {
			selected = " "
		}
		lines[surfaceRow] = prefix + selectionStyle.Render(selected) + suffix
	}
	return strings.Join(lines, "\n")
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

package ui

// conversation_copy_drag.go manages mouse drag text-selection over the conversation body and its highlight rendering.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func (c *clipboardComponent) setConversationSnapshot(body string, viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	lines := strings.Split(ansi.Strip(body), "\n")
	if len(lines) > viewportRows {
		lines = lines[:viewportRows]
	}
	c.conversationCopy = conversationCopySnapshot{
		rect:  c.app.conversation.contentRect(0, 0, contentW, viewportRows, bodyWidth, hasPermissionBanner),
		lines: lines,
	}
}

func (c *clipboardComponent) beginConversationDrag(x, y int) bool {
	if !c.conversationCopy.rect.contains(x, y) {
		c.copyDrag = conversationCopyDrag{}
		return false
	}
	c.copyDrag = conversationCopyDrag{
		active: true,
		startX: x,
		startY: y,
		endX:   x,
		endY:   y,
	}
	return true
}

func (c *clipboardComponent) updateConversationDrag(x, y int) {
	if !c.copyDrag.active {
		return
	}
	x, y = c.clampConversationPoint(x, y)
	if x != c.copyDrag.startX || y != c.copyDrag.startY {
		c.copyDrag.moved = true
	}
	c.copyDrag.endX = x
	c.copyDrag.endY = y
}

func (c *clipboardComponent) finishConversationDrag(x, y int) bool {
	if !c.copyDrag.active {
		return false
	}
	c.updateConversationDrag(x, y)
	drag := c.copyDrag
	c.copyDrag = conversationCopyDrag{}
	if !drag.moved {
		return false
	}
	text := visibleConversationSelectionText(c.conversationCopy, drag.startX, drag.startY, drag.endX, drag.endY)
	if strings.TrimSpace(text) == "" {
		c.app.setHint("nothing to copy - drag selected no text")
		return true
	}
	c.app.setHint(copyExactTextToClipboard(text, "nothing to copy - drag selected no text", func(chars int) string {
		return copiedSelectionToast("visible text", text, chars)
	}))
	return true
}

func (c *clipboardComponent) mouseSelectionModeLabel() string {
	if c.app.MouseEnabled {
		return "app copy"
	}
	return "terminal select"
}

func (c *clipboardComponent) mouseSelectionModeHint() string {
	if c.app.MouseEnabled {
		return "mouse mode: app copy - wheel/click enabled; drag copies visible text"
	}
	return "mouse mode: terminal select - drag selects text in the terminal"
}

func (c *clipboardComponent) activeDragStatus() string {
	if c.detailCopyDrag.active {
		return activeTextSelectionStatus("detail selection", c.detailCopy, c.detailCopyDrag)
	}
	if c.copyDrag.active {
		return activeTextSelectionStatus("visible text", c.conversationCopy, c.copyDrag)
	}
	return ""
}

func (c *clipboardComponent) renderConversationDragHighlight(body string) string {
	if !c.copyDrag.active {
		return body
	}
	localSnapshot := c.conversationCopy
	localDrag := c.copyDrag
	localDrag.startX -= localSnapshot.rect.x
	localDrag.endX -= localSnapshot.rect.x
	localDrag.startY -= localSnapshot.rect.y
	localDrag.endY -= localSnapshot.rect.y
	localSnapshot.rect.x = 0
	localSnapshot.rect.y = 0
	return renderConversationCopySelection(body, localSnapshot, localDrag, c.app.Theme)
}

func (c *clipboardComponent) clampConversationPoint(x, y int) (int, int) {
	r := c.conversationCopy.rect
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

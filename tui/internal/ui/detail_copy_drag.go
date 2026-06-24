package ui

// detail_copy_drag.go manages mouse drag text-selection within the detail modal.

import (
	"strings"

	"github.com/charmbracelet/x/ansi"
)

func (c *clipboardComponent) setDetailSnapshot(lines []string, renderedModal string, bodyRow int) {
	c.detailCopy = conversationCopySnapshot{}
	if renderedModal == "" || bodyRow < 0 || len(lines) == 0 {
		return
	}
	rect := overlayMouseRect(renderedModal, c.app.width, c.app.height)
	bodyWidth := modalScrollableBodyWidth(rect.w)
	if bodyWidth < 1 {
		bodyWidth = 1
	}
	c.detailCopy = conversationCopySnapshot{
		rect: mouseRect{
			x: rect.x + 3,
			y: rect.y + 2 + bodyRow,
			w: bodyWidth,
			h: len(lines),
		},
		lines: stripTextSelectionLines(lines),
	}
}

func stripTextSelectionLines(lines []string) []string {
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		out = append(out, ansi.Strip(line))
	}
	return out
}

func (c *clipboardComponent) beginDetailDrag(x, y int) bool {
	if !c.app.detail.visible || c.app.detail.ref == nil || !c.detailCopy.rect.contains(x, y) {
		c.detailCopyDrag = conversationCopyDrag{}
		return false
	}
	c.detailCopyDrag = conversationCopyDrag{
		active: true,
		startX: x,
		startY: y,
		endX:   x,
		endY:   y,
	}
	return true
}

func (c *clipboardComponent) updateDetailDrag(x, y int) {
	if !c.detailCopyDrag.active {
		return
	}
	x, y = clampTextSelectionPoint(c.detailCopy.rect, x, y)
	if x != c.detailCopyDrag.startX || y != c.detailCopyDrag.startY {
		c.detailCopyDrag.moved = true
	}
	c.detailCopyDrag.endX = x
	c.detailCopyDrag.endY = y
}

func (c *clipboardComponent) finishDetailDrag(x, y int) bool {
	if !c.detailCopyDrag.active {
		return false
	}
	c.updateDetailDrag(x, y)
	drag := c.detailCopyDrag
	c.detailCopyDrag = conversationCopyDrag{}
	if !drag.moved {
		return false
	}
	text := visibleConversationSelectionText(c.detailCopy, drag.startX, drag.startY, drag.endX, drag.endY)
	if strings.TrimSpace(text) == "" {
		c.app.setHint("nothing to copy - detail selection has no text")
		return true
	}
	c.app.setHint(copyExactTextToClipboard(text, "nothing to copy - detail selection has no text", func(chars int) string {
		return copiedSelectionToast("detail selection", text, chars)
	}))
	return true
}

func (c *clipboardComponent) renderDetailDragHighlight(modal string) string {
	if !c.detailCopyDrag.active || c.detailCopy.rect.w <= 0 {
		return modal
	}
	rect := overlayMouseRect(modal, c.app.width, c.app.height)
	localSnapshot := c.detailCopy
	localSnapshot.rect.x -= rect.x
	localSnapshot.rect.y -= rect.y
	localDrag := c.detailCopyDrag
	localDrag.startX -= rect.x
	localDrag.endX -= rect.x
	localDrag.startY -= rect.y
	localDrag.endY -= rect.y
	return renderCopySelectionOnSurface(modal, localSnapshot, localDrag, c.app.Theme)
}

func clampTextSelectionPoint(rect mouseRect, x, y int) (int, int) {
	if rect.w <= 0 || rect.h <= 0 {
		return x, y
	}
	if x < rect.x {
		x = rect.x
	}
	if x >= rect.x+rect.w {
		x = rect.x + rect.w - 1
	}
	if y < rect.y {
		y = rect.y
	}
	if y >= rect.y+rect.h {
		y = rect.y + rect.h - 1
	}
	return x, y
}

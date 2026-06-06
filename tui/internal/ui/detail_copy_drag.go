package ui

import (
	"strings"

	"github.com/charmbracelet/x/ansi"
)

func (a *App) setDetailCopySnapshot(lines []string, renderedModal string, bodyRow int) {
	a.detailCopy = conversationCopySnapshot{}
	if renderedModal == "" || bodyRow < 0 || len(lines) == 0 {
		return
	}
	rect := overlayMouseRect(renderedModal, a.width, a.height)
	bodyWidth := modalScrollableBodyWidth(rect.w)
	if bodyWidth < 1 {
		bodyWidth = 1
	}
	a.detailCopy = conversationCopySnapshot{
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

func (a *App) beginDetailCopyDrag(x, y int) bool {
	if !a.detailViewOpen || a.detailView == nil || !a.detailCopy.rect.contains(x, y) {
		a.detailCopyDrag = conversationCopyDrag{}
		return false
	}
	a.detailCopyDrag = conversationCopyDrag{
		active: true,
		startX: x,
		startY: y,
		endX:   x,
		endY:   y,
	}
	return true
}

func (a *App) updateDetailCopyDrag(x, y int) {
	if !a.detailCopyDrag.active {
		return
	}
	x, y = clampTextSelectionPoint(a.detailCopy.rect, x, y)
	if x != a.detailCopyDrag.startX || y != a.detailCopyDrag.startY {
		a.detailCopyDrag.moved = true
	}
	a.detailCopyDrag.endX = x
	a.detailCopyDrag.endY = y
}

func (a *App) finishDetailCopyDrag(x, y int) bool {
	if !a.detailCopyDrag.active {
		return false
	}
	a.updateDetailCopyDrag(x, y)
	drag := a.detailCopyDrag
	a.detailCopyDrag = conversationCopyDrag{}
	if !drag.moved {
		return false
	}
	text := visibleConversationSelectionText(a.detailCopy, drag.startX, drag.startY, drag.endX, drag.endY)
	if strings.TrimSpace(text) == "" {
		a.transientHint = "nothing to copy - detail selection has no text"
		return true
	}
	a.transientHint = copyExactTextToClipboard(text, "nothing to copy - detail selection has no text", func(chars int) string {
		return copiedSelectionToast("detail selection", text, chars)
	})
	return true
}

func (a *App) renderDetailCopyDragHighlight(modal string) string {
	if !a.detailCopyDrag.active || a.detailCopy.rect.w <= 0 {
		return modal
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	localSnapshot := a.detailCopy
	localSnapshot.rect.x -= rect.x
	localSnapshot.rect.y -= rect.y
	localDrag := a.detailCopyDrag
	localDrag.startX -= rect.x
	localDrag.endX -= rect.x
	localDrag.startY -= rect.y
	localDrag.endY -= rect.y
	return renderCopySelectionOnSurface(modal, localSnapshot, localDrag, a.Theme)
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

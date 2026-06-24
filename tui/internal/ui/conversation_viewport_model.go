package ui

// selectedPartScrollState: scroll/sticky-to-bottom state for the selected-part detail viewport.

import "strings"

type selectedPartScrollState struct {
	scrollOffset   int
	stickyToBottom bool
	changed        bool
}

func selectedPartScrollAdjustment(plainBody string, viewportH int, scrollOffset int, stickyToBottom bool) selectedPartScrollState {
	markerRow, ok := selectedPartMarkerRow(plainBody)
	if !ok {
		return selectedPartScrollState{scrollOffset: scrollOffset, stickyToBottom: stickyToBottom}
	}
	totalLines := strings.Count(plainBody, "\n") + 1
	if viewportH < 1 {
		viewportH = 1
	}
	margin := viewportH / 3
	if margin < 2 {
		margin = 2
	}
	if margin >= viewportH {
		margin = viewportH - 1
	}

	start := conversationVisibleStart(totalLines, viewportH, scrollOffset, stickyToBottom)
	end := start + viewportH
	if markerRow >= start && markerRow < end-margin {
		return selectedPartScrollState{scrollOffset: scrollOffset, stickyToBottom: stickyToBottom}
	}

	desired := totalLines - markerRow - viewportH + margin
	if desired < 0 {
		desired = 0
	}
	return selectedPartScrollState{
		scrollOffset:   desired,
		stickyToBottom: desired == 0,
		changed:        desired != scrollOffset || stickyToBottom != (desired == 0),
	}
}

func selectedPartMarkerRow(plainBody string) (int, bool) {
	idx := strings.Index(plainBody, "▌ ")
	if idx < 0 {
		// Older tests and historical render paths used the routing
		// triangle as the cursor marker. Prefer the current bar marker
		// so routing-decision triangles do not steal the scroll target,
		// but keep this fallback for compatibility.
		idx = strings.Index(plainBody, "▸ ")
	}
	if idx < 0 {
		return 0, false
	}
	return strings.Count(plainBody[:idx], "\n"), true
}

func conversationVisibleStart(totalLines int, maxRows int, scrollOffset int, stickyToBottom bool) int {
	if maxRows < 1 {
		return 0
	}
	if totalLines <= maxRows {
		return 0
	}
	start := totalLines - maxRows - scrollOffset
	if stickyToBottom {
		start = totalLines - maxRows
	}
	return boundedScrollWindow(totalLines, maxRows, start).start
}

func conversationContentRectFromGeometry(bodyX int, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool) mouseRect {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if col < 0 {
		col = 0
	}
	if col >= contentW {
		col = contentW - 1
	}
	if width < 1 {
		width = 1
	}
	if col+width > contentW {
		width = contentW - col
	}
	if width < 1 {
		width = 1
	}
	if height < 1 {
		height = 1
	}
	bodyTop := 4
	if hasPermissionBanner {
		bodyTop++
	}
	return mouseRect{
		x: bodyX + 2 + col,
		y: bodyTop + row,
		w: width,
		h: height,
	}
}

func conversationFocusSurfaceRectFromGeometry(bodyX int, conversationHeight int, bodyWidth int) mouseRect {
	return mouseRect{
		x: bodyX,
		y: 1,
		w: renderedPaneOuterWidth(bodyWidth),
		h: conversationHeight,
	}
}

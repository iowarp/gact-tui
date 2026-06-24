package ui

// app_view_overlay.go composites one rendered block on top of another at a screen offset (modal/overlay splicing).

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

// overlay splices `top` onto `base` as a centred floating window.
// Rows outside the modal's Y range pass through unchanged; rows intersecting
// the modal preserve base content to the left and right of the modal.
func overlay(base, top string, w, h int) string {
	baseLines := strings.Split(base, "\n")
	topLines := strings.Split(top, "\n")
	tH := len(topLines)
	tW := 0
	for _, l := range topLines {
		if wl := lipgloss.Width(l); wl > tW {
			tW = wl
		}
	}
	startY := modalOverlayTop(h, tH)
	startX := (w - tW) / 2
	if startX < 0 {
		startX = 0
	}
	for i, ol := range topLines {
		idx := startY + i
		if idx >= len(baseLines) {
			break
		}
		baseLines[idx] = spliceRow(baseLines[idx], ol, startX, tW)
	}
	return strings.Join(baseLines, "\n")
}

// spliceRow overlays `top` at display column startX while preserving base row
// content around it. The reset-SGR separators keep modal background color from
// leaking into the preserved base content.
func spliceRow(row, top string, startX, topW int) string {
	const resetSGR = "\x1b[0m"
	rowW := ansi.StringWidth(row)

	var left string
	if startX <= 0 {
		left = ""
	} else if rowW >= startX {
		left = ansi.Truncate(row, startX, "")
	} else {
		left = row + strings.Repeat(" ", startX-rowW)
	}

	var right string
	rightCut := startX + topW
	if rowW > rightCut {
		right = ansi.TruncateLeft(row, rightCut, "")
	}

	return left + resetSGR + top + resetSGR + right
}

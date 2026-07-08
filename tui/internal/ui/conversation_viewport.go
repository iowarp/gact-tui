package ui

// conversation_viewport.go manages conversation viewport scrolling and clipping to the selected part.

import (
	"strings"

	"github.com/charmbracelet/x/ansi"
)

// adjustScrollForSelectedPart finds the ▸ marker in the
// rendered body and re-anchors scrollOffset so the marker lands
// within the viewport. Called one-shot from the View path when a nav
// handler has flagged pendingPartScroll — the base
// scrollToSelectedMessage offset is an approximation (measures in
// messages, scrollClip wants lines), this fine-tunes it to land the
// actual selected row in view.
//
// Strategy:
//   - If no marker (cursor off or part has no rendered content),
//     leave scrollOffset untouched.
//   - Otherwise place the marker at ~1/3 from the top of the viewport
//     so there's context above it. If the marker is already visible
//     within that target range, nudge only when it's outside — never
//     snap the viewport back when the user paged beyond the marker
//     with PgDn/PgUp deliberately.
//
// scrollClip's math is:
//
//	start := len(lines) - maxRows - scrollOffset
//
// So to place `markerRow` at offset `margin` from the top of the
// viewport we solve:
//
//	markerRow == start + margin
//	          == len(lines) - maxRows - scrollOffset + margin
//	scrollOffset = len(lines) - markerRow - maxRows + margin
func (c *conversationComponent) adjustScrollForSelectedPart(body string, viewportH int) {
	plainBody := ansi.Strip(body)
	next := selectedPartScrollAdjustment(plainBody, viewportH, c.scrollOffset, c.stickyToBottom)
	if !next.changed {
		return
	}
	c.scrollOffset = next.scrollOffset
	c.stickyToBottom = next.stickyToBottom
}

// scrollClip clamps body to maxRows lines, sticking to bottom by default.
func (c *conversationComponent) scrollClip(body string, maxRows int, _ Theme) string {
	if maxRows < 1 {
		return ""
	}
	lines := strings.Split(body, "\n")
	if len(lines) <= maxRows {
		return body
	}
	start := len(lines) - maxRows
	if !c.stickyToBottom {
		start -= c.scrollOffset
	}
	win := boundedScrollWindow(len(lines), maxRows, start)
	return strings.Join(lines[win.start:win.end], "\n")
}

func (c *conversationComponent) scrollStart(body string, maxRows int) int {
	if maxRows < 1 {
		return 0
	}
	lines := strings.Split(body, "\n")
	return conversationVisibleStart(len(lines), maxRows, c.scrollOffset, c.stickyToBottom)
}

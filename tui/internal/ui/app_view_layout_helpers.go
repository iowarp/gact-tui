package ui

// app_view_layout_helpers.go provides low-level view helpers for blanking, clamping, gutters, and background-fitting rendered blocks.

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"
)

func blankScreen(width int, height int, bg color.Color) string {
	if width < 1 || height < 1 {
		return ""
	}
	line := lipgloss.NewStyle().Background(bg).Render(strings.Repeat(" ", width))
	lines := make([]string, height)
	for i := range lines {
		lines[i] = line
	}
	return strings.Join(lines, "\n")
}

func visualLineCount(text string, width int) int {
	if width < 1 {
		width = 80
	}
	if text == "" {
		return 1
	}
	total := 0
	for _, line := range strings.Split(text, "\n") {
		w := lipgloss.Width(line)
		if w <= 0 {
			total++
			continue
		}
		total += (w + width - 1) / width
	}
	if total < 1 {
		return 1
	}
	return total
}

// prependGutter inserts gutter at the start of every line of s.
// Used by the V3 search-hit marker so a message's gutter shows up
// on every wrapped row, not just the first.
func prependGutter(s, gutter string) string {
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = gutter + lines[i]
	}
	return strings.Join(lines, "\n")
}

// clampLines hard-truncates a pre-rendered string to at most max newline-
// separated rows. Used as a final safety net so layout siblings (header,
// footer) don't get pushed off-screen when a pane's internal clip math
// underestimates line count (soft-wrap, multi-line ANSI composites, etc.).
func clampLines(s string, max int) string {
	if max < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) <= max {
		return s
	}
	return strings.Join(lines[:max], "\n")
}

func fitLinesWithBackground(s string, n int, bg color.Color) string {
	if n < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	padLine := ""
	if bg != nil {
		width := 0
		for _, line := range lines {
			if w := lipgloss.Width(line); w > width {
				width = w
			}
		}
		if width > 0 {
			padLine = lipgloss.NewStyle().Background(bg).Render(strings.Repeat(" ", width))
		}
	}
	for len(lines) < n {
		lines = append(lines, padLine)
	}
	return strings.Join(lines, "\n")
}

func fitBorderedLinesWithBackground(s string, n int, bg color.Color) string {
	if n < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) > n && n >= 2 {
		lines = append(append([]string{}, lines[:n-1]...), lines[len(lines)-1])
	}
	return fitLinesWithBackground(strings.Join(lines, "\n"), n, bg)
}

func renderedBlockWidth(s string) int {
	width := 0
	for _, line := range strings.Split(s, "\n") {
		if w := lipgloss.Width(line); w > width {
			width = w
		}
	}
	return width
}

// shortID truncates a message ID for display (e.g. "msg_1a2b3c4d…").
func shortID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12] + "…"
}

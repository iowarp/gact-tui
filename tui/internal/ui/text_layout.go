package ui

// text_layout.go provides ANSI-aware padding/fitting and integer clamp/min/max helpers.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func padANSI(s string, width int) string {
	if width <= 0 {
		return ""
	}
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

func fitANSI(s string, width int) string {
	if width <= 0 {
		return ""
	}
	fitted := ansi.Truncate(s, width, "")
	for target := width - 1; lipgloss.Width(fitted) > width && target >= 0; target-- {
		fitted = ansi.Truncate(s, target, "")
	}
	return padANSI(fitted, width)
}

func clampInt(v int, minValue int, maxValue int) int {
	if maxValue < minValue {
		return minValue
	}
	if v < minValue {
		return minValue
	}
	if v > maxValue {
		return maxValue
	}
	return v
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

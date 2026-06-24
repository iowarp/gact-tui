package ui

// lm_config_box.go renders the boxed list/detail panels of the LM-config modal.

import (
	"fmt"
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"
)

func lmConfigSelectedMarker(focused bool) string {
	if focused {
		return "▌ "
	}
	return "✓ "
}

func (c *lmConfigComponent) renderBox(title string, rows []string, width int, height int) string {
	return c.renderBoxWithWindow(title, rows, width, height, scrollWindow{})
}

func (c *lmConfigComponent) renderListBox(title string, rows []string, width int, height int, win scrollWindow) string {
	return c.renderBoxWithWindow(title, rows, width, height, win)
}

func lmConfigBoxBodyWidth(width int) int {
	bodyW := width - 4
	if bodyW < 10 {
		return 10
	}
	return bodyW
}

func lmConfigBoxContentWidth(width int) int {
	return lmConfigBoxBodyWidth(width) - 2
}

func lmConfigBoxRailCol(col int, width int) int {
	return col + width - 3
}

func lmConfigBoxContentTop(top int) int {
	return top + 2
}

func (c *lmConfigComponent) renderBoxWithWindow(title string, rows []string, width int, height int, win scrollWindow) string {
	t := c.app.Theme
	bodyW := lmConfigBoxBodyWidth(width)
	bodyLines := make([]string, 0, height)
	for _, row := range rows {
		bodyLines = append(bodyLines, fitANSI(row, bodyW))
		if len(bodyLines) == height {
			break
		}
	}
	for len(bodyLines) < height {
		bodyLines = append(bodyLines, strings.Repeat(" ", bodyW))
	}
	if win.total > maxInt(1, win.end-win.start) && width >= 16 && height >= 2 {
		contentW := lmConfigBoxContentWidth(width)
		if withRail, ok := c.app.modals.renderSideScrollIndicator(bodyLines, contentW, win); ok {
			bodyLines = withRail
		}
	}
	titleStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true)
	borderStyle := lipgloss.NewStyle().Foreground(t.Border)
	lineStyle := lipgloss.NewStyle().Background(t.Bg)
	top := lineStyle.Render(borderStyle.Render("╭" + strings.Repeat("─", width-2) + "╮"))
	bottom := lineStyle.Render(borderStyle.Render("╰" + strings.Repeat("─", width-2) + "╯"))
	titleLine := lineStyle.Render(
		"│ " + fitANSI(titleStyle.Render(title), bodyW) + " │",
	)
	out := []string{top, titleLine}
	for _, line := range bodyLines {
		out = append(out, lineStyle.Render("│ "+line+" │"))
	}
	out = append(out, bottom)
	return strings.Join(out, "\n")
}

func lmConfigFillBlock(s string, width int, height int, bg color.Color) string {
	if width <= 0 {
		return s
	}
	style := lipgloss.NewStyle().Background(bg).Width(width)
	lines := strings.Split(s, "\n")
	if height > 0 && len(lines) > height {
		lines = lines[:height]
	}
	for height > 0 && len(lines) < height {
		lines = append(lines, "")
	}
	for i, line := range lines {
		lines[i] = style.Render(padANSI(line, width))
	}
	return strings.Join(lines, "\n")
}

func lmConfigField_render(
	label, value string, mask bool, focused bool, t Theme,
) string {
	marker := "  "
	if focused {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
	}
	display := value
	if mask && value != "" {
		display = strings.Repeat("*", len(value))
	}
	if focused {
		display += "_"
	}
	if display == "" {
		display = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("(empty)")
	}
	return fmt.Sprintf("%s%s: %s", marker,
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(label),
		display,
	)
}

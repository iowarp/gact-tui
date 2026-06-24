package ui

// command_palette_group_overview.go renders the palette group-overview tile grid.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *commandPaletteComponent) renderGroupOverview(win scrollWindow, width int) modalListRender {
	groups := c.availableGroups()
	if len(groups) == 0 || win.end <= win.start {
		return modalListRender{}
	}
	matches := c.visibleMatches()
	counts := paletteCommandGroupCounts(matches)
	examples := paletteCommandGroupExamples(matches, 3)
	t := c.app.Theme
	columns := paletteOverviewColumnCount(width, len(groups))
	gap := 2
	if columns == 1 {
		gap = 0
	}
	tileW := width
	if columns > 1 {
		tileW = (width - gap*(columns-1)) / columns
	}
	rows := make([]string, 0, ((win.end-win.start)+columns-1)/columns*(paletteGroupTileHeight+1))
	hits := make([]modalListHit, 0, win.end-win.start)
	gapText := lipgloss.NewStyle().Background(t.BgSubtle).Render(strings.Repeat(" ", gap))
	cellStyle := lipgloss.NewStyle().Background(t.BgSubtle).Width(tileW)
	emptyCell := make([]string, paletteGroupTileHeight)
	for i := range emptyCell {
		emptyCell[i] = ""
	}
	for i := win.start; i < win.end; i += columns {
		rowStart := len(rows)
		cells := make([][]string, 0, columns)
		for column := 0; column < columns; column++ {
			idx := i + column
			if idx >= win.end {
				cells = append(cells, emptyCell)
				continue
			}
			group := groups[idx]
			selected := idx == c.paletteSel
			cells = append(cells, c.renderGroupTile(group, counts[group], examples[group], tileW, selected))
			hits = append(hits, modalListHit{
				id:     "palette:group:" + paletteGroupID(group),
				row:    rowStart,
				col:    column * (tileW + gap),
				width:  tileW,
				height: paletteGroupTileHeight,
				action: func(idx int) uiHitAction {
					return func(app *App) tea.Cmd {
						groups := app.cmdPalette.availableGroups()
						if idx < 0 || idx >= len(groups) {
							return nil
						}
						app.cmdPalette.paletteGroup = groups[idx]
						app.cmdPalette.paletteSel = 0
						return nil
					}
				}(idx),
			})
		}
		for line := 0; line < paletteGroupTileHeight; line++ {
			renderedCells := make([]string, 0, columns)
			for column := 0; column < columns; column++ {
				renderedCells = append(renderedCells, cellStyle.Render(cells[column][line]))
			}
			rows = append(rows, strings.Join(renderedCells, gapText))
		}
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

const paletteGroupTileHeight = 4

func paletteOverviewColumnCount(width int, groupCount int) int {
	if groupCount <= 0 {
		return 1
	}
	columns := 2
	if width >= 76 && groupCount >= 5 {
		columns = 3
	}
	if width < 72 {
		columns = 1
	}
	if columns > groupCount {
		columns = groupCount
	}
	gap := 2
	if columns == 1 {
		gap = 0
	}
	for columns > 1 {
		tileW := (width - gap*(columns-1)) / columns
		if tileW >= 24 {
			break
		}
		columns--
		if columns == 1 {
			gap = 0
		}
	}
	if columns < 1 {
		return 1
	}
	return columns
}

func (c *commandPaletteComponent) renderGroupTile(group string, count int, examples []string, width int, selected bool) []string {
	t := c.app.Theme
	titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	borderStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	bodyStyle := t.HintLabel
	if selected {
		titleStyle = titleStyle.Foreground(t.Secondary)
		borderStyle = borderStyle.Foreground(t.Secondary).Bold(true)
	}
	titleText := titleStyle.Render(group)
	if count > 0 {
		titleText += " " + lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(fmt.Sprintf("[%d]", count))
	}
	if selected {
		titleText = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ") + titleText
	}
	descText := bodyStyle.Italic(true).Render(paletteCommandGroupDescription(group))
	exampleText := paletteGroupExampleLine(examples, maxInt(0, width-2))
	if exampleText == "" {
		exampleText = "Enter to browse"
	}
	exampleText = lipgloss.NewStyle().Foreground(t.FgMuted).Render(exampleText)
	innerW := width - 4
	if innerW < 1 {
		innerW = 1
	}
	borderW := width - 2
	if borderW < 1 {
		borderW = 1
	}
	lines := []string{
		paletteTitledBorderLine(borderStyle, titleText, borderW),
		borderStyle.Render("│ ") + paletteTileFit(descText, innerW) + borderStyle.Render(" │"),
		borderStyle.Render("│ ") + paletteTileFit(exampleText, innerW) + borderStyle.Render(" │"),
		borderStyle.Render("└" + strings.Repeat("─", borderW) + "┘"),
	}
	if selected {
		selectedStyle := lipgloss.NewStyle().Background(t.Bg).Width(width)
		for i, line := range lines {
			lines[i] = selectedStyle.Render(line)
		}
	}
	return lines
}

func paletteTitledBorderLine(borderStyle lipgloss.Style, title string, width int) string {
	if width < 1 {
		width = 1
	}
	title = textutil.Truncate(title, maxInt(0, width-2))
	if lipgloss.Width(title) > 0 {
		title = " " + title + " "
	}
	remaining := width - lipgloss.Width(title) - 1
	if remaining < 0 {
		remaining = 0
	}
	return borderStyle.Render("┌─") + title + borderStyle.Render(strings.Repeat("─", remaining)+"┐")
}

func paletteTileFit(s string, width int) string {
	if width < 1 {
		return ""
	}
	s = textutil.Truncate(s, width)
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

func paletteGroupExampleLine(examples []string, maxWidth int) string {
	if maxWidth <= 0 {
		return ""
	}
	out := append([]string(nil), examples...)
	for len(out) > 0 {
		line := strings.Join(out, "  ")
		if lipgloss.Width(line) <= maxWidth {
			return line
		}
		out = out[:len(out)-1]
	}
	return ""
}

package ui

// command_palette_tiles.go renders the palette command grid and individual command tiles.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (p *commandPaletteComponent) renderCommandGrid(matches []gact.Command, win scrollWindow, width int) modalListRender {
	if len(matches) == 0 || win.end <= win.start {
		return modalListRender{}
	}
	t := p.app.Theme
	columns := 2
	gap := 2
	if width < 72 {
		columns = 1
		gap = 0
	}
	tileW := width
	if columns > 1 {
		tileW = (width - gap) / columns
	}
	if tileW < 30 {
		tileW = width
		columns = 1
		gap = 0
	}
	rows := make([]string, 0, ((win.end-win.start)+columns-1)/columns*(paletteCommandTileHeight+1))
	hits := make([]modalListHit, 0, win.end-win.start)
	gapText := lipgloss.NewStyle().Background(t.BgSubtle).Render(strings.Repeat(" ", gap))
	cellStyle := lipgloss.NewStyle().Background(t.BgSubtle).Width(tileW)
	emptyCell := make([]string, paletteCommandTileHeight)
	for i := win.start; i < win.end; i += columns {
		rowStart := len(rows)
		cells := make([][]string, 0, columns)
		for column := 0; column < columns; column++ {
			idx := i + column
			if idx >= win.end {
				cells = append(cells, emptyCell)
				continue
			}
			c := matches[idx]
			selected := idx == p.paletteSel
			cells = append(cells, p.renderCommandTile(c, tileW, selected))
			hits = append(hits, modalListHit{
				id:     fmt.Sprintf("palette:command:%d", idx),
				row:    rowStart,
				col:    column * (tileW + gap),
				width:  tileW,
				height: paletteCommandTileHeight,
				action: func(idx int) uiHitAction {
					return func(app *App) tea.Cmd {
						matches := app.cmdPalette.visibleMatches()
						if idx < 0 || idx >= len(matches) {
							return nil
						}
						app.cmdPalette.paletteSel = idx
						_, cmd := app.cmdPalette.handleKey(keyMsg("enter"))
						return cmd
					}
				}(idx),
			})
		}
		for line := 0; line < paletteCommandTileHeight; line++ {
			renderedCells := make([]string, 0, columns)
			for column := 0; column < columns; column++ {
				renderedCells = append(renderedCells, cellStyle.Render(cells[column][line]))
			}
			rows = append(rows, strings.Join(renderedCells, gapText))
		}
		if i+columns < win.end {
			rows = append(rows, "")
		}
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

const paletteCommandTileHeight = 4

func (p *commandPaletteComponent) renderCommandTile(c gact.Command, width int, selected bool) []string {
	t := p.app.Theme
	titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	borderStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	bodyStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	if selected {
		titleStyle = titleStyle.Foreground(t.Secondary)
		borderStyle = borderStyle.Foreground(t.Secondary).Bold(true)
	}
	title := titleStyle.Render(c.ID)
	if state := strings.TrimSpace(p.currentValue(c.ID)); state != "" {
		title += " " + lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(state)
	}
	if selected {
		title = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ") + title
	}
	innerW := width - 4
	if innerW < 1 {
		innerW = 1
	}
	subtitle := bodyStyle.Render(paletteCommandTileSubtitle(c, innerW))
	action := "Enter " + paletteCommandEnterAction(c)
	action = bodyStyle.Italic(true).Render(paletteCommandLineFit(action, innerW))
	borderW := width - 2
	if borderW < 1 {
		borderW = 1
	}
	lines := []string{
		paletteTitledBorderLine(borderStyle, title, borderW),
		borderStyle.Render("│ ") + paletteTileFitPlain(subtitle, innerW) + borderStyle.Render(" │"),
		borderStyle.Render("│ ") + paletteTileFitPlain(action, innerW) + borderStyle.Render(" │"),
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

func paletteCommandTileSubtitle(c gact.Command, width int) string {
	if width < 1 {
		return ""
	}
	if c.CommandSource == "mcp_prompt" || c.Source == "mcp_prompt" || c.Invocation == "mcp_prompt" {
		candidates := []string{"MCP prompt action"}
		if hint := strings.TrimSpace(c.ArgumentHint); hint != "" {
			candidates = append([]string{"MCP prompt action · input " + hint}, candidates...)
		}
		return firstPaletteLineThatFits(candidates, width)
	}
	return paletteCommandLineFit(paletteCommandSubtitle(c), width)
}

func paletteCommandLineFit(text string, width int) string {
	text = strings.TrimSpace(text)
	if width < 1 || text == "" {
		return ""
	}
	if lipgloss.Width(text) <= width {
		return text
	}
	parts := strings.Split(text, " · ")
	for len(parts) > 1 {
		parts = parts[:len(parts)-1]
		candidate := strings.TrimSpace(strings.Join(parts, " · "))
		if candidate != "" && lipgloss.Width(candidate) <= width {
			return candidate
		}
	}
	words := strings.Fields(text)
	for len(words) > 1 {
		words = words[:len(words)-1]
		candidate := strings.Join(words, " ")
		if lipgloss.Width(candidate) <= width {
			return candidate
		}
	}
	return ansi.Truncate(text, width, "")
}

func firstPaletteLineThatFits(candidates []string, width int) string {
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate != "" && lipgloss.Width(candidate) <= width {
			return candidate
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	return paletteCommandLineFit(candidates[len(candidates)-1], width)
}

func paletteTileFitPlain(s string, width int) string {
	if width < 1 {
		return ""
	}
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

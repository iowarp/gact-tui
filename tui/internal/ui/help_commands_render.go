package ui

// help_commands_render.go renders the help-modal command area into grouped columns.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (m *helpModal) renderCommandAreaColumns(keys []helpKey, width int) modalListRender {
	entries := m.commandEntries(keys)
	if len(entries) == 0 {
		return modalListRender{}
	}
	groups := groupHelpCommandEntries(entries)
	columns, gap, colW := helpCommandColumnLayout(width, len(groups))
	columnGroups := splitHelpCommandGroups(groups, columns)
	columnRows := make([][]string, columns)
	columnHits := make([][]modalListHit, columns)
	for col, colGroups := range columnGroups {
		row := 0
		for _, group := range colGroups {
			boxRows, boxHits := m.renderCommandAreaBox(group.group, group.rows, colW, col*(colW+gap), row)
			columnRows[col] = append(columnRows[col], boxRows...)
			columnHits[col] = append(columnHits[col], boxHits...)
			row += len(boxRows)
		}
	}
	rows := m.renderCommandColumns(columnRows, columns, gap, colW)
	hits := make([]modalListHit, 0, len(entries))
	for _, colHits := range columnHits {
		hits = append(hits, colHits...)
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

func groupHelpCommandEntries(entries []helpCommandEntry) []helpCommandGroup {
	groups := make([]helpCommandGroup, 0, 8)
	groupIndex := map[string]int{}
	for _, entry := range entries {
		idx, ok := groupIndex[entry.group]
		if !ok {
			idx = len(groups)
			groupIndex[entry.group] = idx
			groups = append(groups, helpCommandGroup{group: entry.group})
		}
		groups[idx].rows = append(groups[idx].rows, entry)
	}
	return groups
}

func helpCommandColumnLayout(width int, groupCount int) (int, int, int) {
	columns := 2
	gap := 4
	if width >= 108 && groupCount >= 5 {
		columns = 3
		gap = 2
	}
	if width < 72 {
		columns = 1
		gap = 0
	}
	if columns > groupCount {
		columns = groupCount
	}
	if columns < 1 {
		columns = 1
	}
	colW := width
	if columns > 1 {
		colW = (width - gap*(columns-1)) / columns
	}
	for columns > 1 && colW < 28 {
		columns--
		if columns > 1 {
			colW = (width - gap*(columns-1)) / columns
		} else {
			gap = 0
			colW = width
		}
	}
	return columns, gap, colW
}

func splitHelpCommandGroups(groups []helpCommandGroup, columns int) [][]helpCommandGroup {
	if columns < 1 {
		columns = 1
	}
	columnGroups := make([][]helpCommandGroup, columns)
	perColumn := (len(groups) + columns - 1) / columns
	for i, group := range groups {
		col := minInt(columns-1, i/perColumn)
		columnGroups[col] = append(columnGroups[col], group)
	}
	return columnGroups
}

func (m *helpModal) renderCommandColumns(columnRows [][]string, columns int, gap int, colW int) []string {
	rowCount := 0
	for _, rows := range columnRows {
		if len(rows) > rowCount {
			rowCount = len(rows)
		}
	}
	gapText := lipgloss.NewStyle().Background(m.app.Theme.BgSubtle).Render(strings.Repeat(" ", gap))
	cellStyle := lipgloss.NewStyle().Background(m.app.Theme.BgSubtle).Width(colW)
	rows := make([]string, 0, rowCount)
	for row := 0; row < rowCount; row++ {
		cells := make([]string, 0, columns)
		for col := 0; col < columns; col++ {
			cell := ""
			if row < len(columnRows[col]) {
				cell = columnRows[col][row]
			}
			cells = append(cells, cellStyle.Render(cell))
		}
		rows = append(rows, strings.Join(cells, gapText))
	}
	return rows
}

func (m *helpModal) renderCommandAreaBox(group string, entries []helpCommandEntry, width int, hitCol int, hitRow int) ([]string, []modalListHit) {
	if width < 8 {
		width = 8
	}
	t := m.app.Theme
	borderStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	commandStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	descStyle := t.HintLabel.Italic(true)
	innerW := maxInt(1, width-4)
	topInnerW := maxInt(1, width-2)
	title := titleStyle.Render(group)
	if desc := helpCommandGroupDescription(group, entries); desc != "" && width >= 36 {
		title += " " + t.HintLabel.Italic(true).Render(desc)
	}
	rows := []string{
		borderStyle.Render("┌") + paletteTileFit(title, topInnerW) + borderStyle.Render("┐"),
	}
	hits := make([]modalListHit, 0, len(entries))
	labelW := maxInt(12, minInt(21, innerW-1))
	for idx, entry := range entries {
		command := entry.key
		label := textutil.Truncate(command, labelW)
		descW := maxInt(0, innerW-lipgloss.Width(label)-1)
		body := commandStyle.Render(label)
		if descW > 0 && width >= 36 {
			body += " " + descStyle.Render(textutil.Truncate(entry.desc, descW))
		}
		rows = append(rows, borderStyle.Render("│ ")+paletteTileFit(body, innerW)+borderStyle.Render(" │"))
		hits = append(hits, modalListHit{
			id:     "help:command:" + strings.TrimPrefix(command, "/"),
			row:    hitRow + 1 + idx,
			col:    hitCol + 1,
			width:  maxInt(1, width-2),
			height: 1,
			action: func(command string) uiHitAction {
				return func(app *App) tea.Cmd {
					app.help.open = false
					app.help.tab = 0
					app.help.scroll = 0
					app.focus = FocusInput
					app.inputComposer.input.Focus()
					app.inputComposer.input.SetValue(command)
					app.inputComposer.input.CursorEnd()
					app.setHint("command staged: " + command)
					return nil
				}
			}(command),
		})
	}
	rows = append(rows, borderStyle.Render("└")+paletteTileFit("", topInnerW)+borderStyle.Render("┘"))
	return rows, hits
}

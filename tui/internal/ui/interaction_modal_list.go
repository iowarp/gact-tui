package ui

// interaction_modal_list.go renders modal list items and computes their layout/hit data.

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

type modalListItem struct {
	id             string
	title          string
	meta           string
	description    string
	status         string
	selected       bool
	selectedMarker string
	disabled       bool
	action         uiHitAction
}

type modalListOptions struct {
	width            int
	rowBudget        int
	descriptionLines int
	columns          int
	columnGap        int
	minColumnWidth   int
}

type modalListHit struct {
	id     string
	row    int
	col    int
	width  int
	height int
	action uiHitAction
}

type modalListRender struct {
	rows          []string
	hits          []modalListHit
	renderedItems int
}

func (m *modalkit) renderModalList(items []modalListItem, opts modalListOptions) modalListRender {
	if opts.columns > 1 && opts.descriptionLines <= 0 {
		return m.renderModalListColumns(items, opts)
	}
	t := m.app.Theme
	width := opts.width
	if width < 1 {
		width = 1
	}
	rowBudget := opts.rowBudget
	if rowBudget < 1 {
		rowBudget = len(items) * 2
	}
	descriptionLines := opts.descriptionLines
	if descriptionLines < 0 {
		descriptionLines = 0
	}
	rows := make([]string, 0, rowBudget)
	hits := make([]modalListHit, 0, len(items))
	for _, item := range items {
		if len(rows) >= rowBudget {
			break
		}
		startRow := len(rows)
		rows = append(rows, m.renderModalListItemLine(item, width))

		description := modalListVisibleDescription(item)
		if description != "" && descriptionLines > 0 {
			descIndent := modalListDescriptionIndent(item.title, width)
			descWidth := width - descIndent
			if descWidth < 8 {
				descWidth = max(1, width-2)
				descIndent = width - descWidth
			}
			descRows := textutil.WrapPlainRows(description, descWidth, "")
			if len(descRows) > descriptionLines {
				descRows = descRows[:descriptionLines]
				last := descRows[len(descRows)-1]
				descRows[len(descRows)-1] = textutil.Truncate(last+" ...", descWidth)
			}
			for _, desc := range descRows {
				if len(rows) >= rowBudget {
					break
				}
				descLine := strings.Repeat(" ", descIndent) + t.HintLabel.Italic(true).Render(desc)
				if item.selected {
					descLine = lipgloss.NewStyle().Background(t.Bg).Width(width).Render(descLine)
				}
				rows = append(rows, descLine)
			}
		}
		if item.action != nil {
			hits = append(hits, modalListHit{
				id:     item.id,
				row:    startRow,
				width:  width,
				height: len(rows) - startRow,
				action: item.action,
			})
		}
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

func modalListVisibleDescription(item modalListItem) string {
	desc := strings.TrimSpace(item.description)
	if desc == "" {
		return ""
	}
	descKey := modalListComparisonText(desc)
	for _, value := range []string{item.title, item.status, item.meta} {
		key := modalListComparisonText(value)
		if key != "" && descKey == key {
			return ""
		}
	}
	return desc
}

func modalListComparisonText(text string) string {
	text = strings.ToLower(strings.TrimSpace(text))
	text = strings.Trim(text, "[](){}:;,. ")
	text = strings.Join(strings.Fields(text), " ")
	return text
}

func modalListDescriptionIndent(title string, width int) int {
	const baseIndent = 2
	if width <= baseIndent {
		return 0
	}
	_, tierIndent, withoutTier := splitAgentHierarchyComputedPrefix(title)
	indent := baseIndent + lipgloss.Width(tierIndent)
	trimmed := strings.TrimLeft(withoutTier, " ")
	leading := len(withoutTier) - len(trimmed)
	indent += leading
	if treePrefix := modalListTreePrefixWidth(trimmed); treePrefix > 0 {
		indent += treePrefix
	}
	if indent < baseIndent {
		indent = baseIndent
	}
	if indent > width-8 {
		indent = baseIndent
	}
	return indent
}

func modalListTreePrefixWidth(title string) int {
	if idx := strings.LastIndex(title, "└─ "); idx >= 0 {
		return lipgloss.Width(title[:idx]) + lipgloss.Width("└─ ")
	}
	return 0
}

func (m *modalkit) renderModalListItemLine(item modalListItem, width int) string {
	t := m.app.Theme
	marker := "  "
	titleStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if item.disabled {
		titleStyle = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true)
	}
	if item.selected {
		selectedMarker := item.selectedMarker
		if selectedMarker == "" {
			selectedMarker = "▌ "
		}
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render(selectedMarker)
		titleStyle = titleStyle.Foreground(t.Secondary)
	}
	line := marker + titleStyle.Render(item.title)
	if item.disabled {
		line += "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render("(disabled)")
	}
	if item.status != "" {
		statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		if item.status == "connected" {
			statusStyle = lipgloss.NewStyle().Foreground(t.Success).Bold(true)
		}
		line += "  " + statusStyle.Render("["+item.status+"]")
	}
	if item.meta != "" {
		line += "  " + t.HintLabel.Italic(true).Render(item.meta)
	}
	row := textutil.Truncate(line, width)
	if item.selected {
		row = lipgloss.NewStyle().Background(t.Bg).Width(width).Render(row)
	}
	return row
}

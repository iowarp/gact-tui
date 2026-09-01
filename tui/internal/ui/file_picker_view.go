package ui

// file_picker_view.go renders the file-picker modal.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// view renders the modal: title, filter row, sorted results,
// hint bar. Keeps the total rendered height fixed at ~15 rows so the
// bottom of the modal doesn't dance when filter results change size.
func (m *filePickerComponent) view() string {
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	listW := modalInsetListWidth(w)
	if !m.open {
		return ""
	}

	buttons := []menuButton{closeMenuButton("file-picker:close", func(app *App) { app.filePicker.close() })}

	mode := "tree"
	if !m.treeMode || m.filter != "" {
		mode = "fuzzy"
	}
	filterRow := t.HintKey.Render("@") + t.HintLabel.Render(m.filter) +
		lipgloss.NewStyle().Foreground(t.Primary).Blink(true).Render("_") +
		t.HintLabel.Render("  "+mode)

	matches := m.matches()
	treeRows := m.treeRows()
	useTree := m.treeMode && m.filter == ""

	// Keep a stable result height while the user types, but let taller
	// terminals show more files instead of forcing a cramped 10-row picker.
	resultRows := m.resultRows()
	rows := []string{filterRow, ""}
	resultStartRow := len(rows)
	var list modalListRender
	if m.errText != "" {
		prefix := "file picker unavailable: "
		rows = append(rows, t.HintLabel.Italic(true).Render(
			prefix+textutil.Truncate(m.errText, maxInt(1, listW-lipgloss.Width(prefix)))))
	} else if !m.loaded && len(matches) == 0 && len(treeRows) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading workspace files…"))
	} else if (!useTree && len(matches) == 0) || (useTree && len(treeRows) == 0) {
		rows = append(rows, t.HintLabel.Italic(true).Render("no matches"))
	}
	availableListRows := resultRows - (len(rows) - resultStartRow)
	if availableListRows < 1 {
		availableListRows = 1
	}
	activeCount := len(matches)
	if useTree {
		activeCount = len(treeRows)
	}
	win := selectedItemWindow(activeCount, m.sel, availableListRows)
	listStartRow := len(rows)
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		idx := i
		if useTree {
			row := treeRows[i]
			name := row.entry.Path
			if _, base := filePickerParentName(name); base != "" {
				name = base
			}
			icon := "• "
			if row.entry.Type == "dir" {
				icon = "▸ "
				if m.treeExpanded[row.entry.Path] {
					icon = "▾ "
				}
			}
			listItems = append(listItems, modalListItem{
				id:       fmt.Sprintf("file-picker:item:%d", idx),
				title:    strings.Repeat("  ", row.depth) + icon + name,
				meta:     filePickerEntryMeta(row.entry),
				selected: i == m.sel,
				action: func(app *App) tea.Cmd {
					if !app.filePicker.open {
						app.filePicker.close()
						return nil
					}
					app.filePicker.sel = idx
					return app.filePicker.selectTreeRow(idx)
				},
			})
			continue
		}
		entry := matches[i]
		listItems = append(listItems, modalListItem{
			id:       fmt.Sprintf("file-picker:item:%d", idx),
			title:    entry.Path,
			meta:     filePickerEntryMeta(entry),
			selected: i == m.sel,
			action: func(app *App) tea.Cmd {
				if !app.filePicker.open {
					app.filePicker.close()
					return nil
				}
				matches := app.filePicker.matches()
				if idx < 0 || idx >= len(matches) {
					return nil
				}
				app.filePicker.sel = idx
				return app.filePicker.insertEntry(matches[idx])
			},
		})
	}
	list = a.modals.renderModalList(listItems, modalListOptions{
		width:     listW,
		rowBudget: availableListRows,
	})
	rows = append(rows, list.rows...)
	// Pad to fixed height so the hint bar doesn't jump.
	for len(rows) < resultStartRow+resultRows {
		rows = append(rows, "")
	}

	hint := t.HintLabel.Italic(true).Render(
		modalKeyHint("type to filter", "Tab tree/list", "←/→ collapse/expand", "Enter insert", "Esc cancel"))

	rendered := a.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Insert file reference",
			buttons: buttons,
			footer:  hint,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       resultStartRow + resultRows,
		window:         win,
		wheelID:        "file-picker:list:wheel",
		surfaceWheelID: "file-picker",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.filePicker.handleWheel(button)
		},
		railAction: func(app *App, index int) tea.Cmd {
			if app.filePicker.open {
				app.filePicker.sel = clampSelection(index, app.filePicker.activeCount())
			}
			return nil
		},
	})
	return rendered.modal
}

func (m *filePickerComponent) resultRows() int {
	if m.app.height <= 0 {
		return 10
	}
	return clampInt(m.app.height-20, 10, 18)
}

func filePickerEntryMeta(entry gact.FileEntry) string {
	if entry.Type == "dir" {
		return "folder"
	}
	if entry.Size > 0 {
		return textutil.HumanBytes(entry.Size)
	}
	return ""
}

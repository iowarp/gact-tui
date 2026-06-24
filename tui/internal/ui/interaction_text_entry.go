package ui

// interaction_text_entry.go renders text-entry modals and registers their cursor/textarea hit regions.

import (
	"strings"

	"charm.land/bubbles/v2/textarea"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

type textEntryModalOptions struct {
	width        int
	title        string
	buttons      []menuButton
	surfaceID    string
	intro        []string
	introList    modalListRender
	introListW   int
	editor       string
	editorID     string
	editorValue  string
	cursorAction func(*App, int)
	status       []string
	statusHits   []modalCellHit
	footer       string
}

// withInputEditor fills the editor-related fields of opts that every single-line
// text-entry modal wires identically: the rendered cursor editor, the editor id,
// the current value, and a cursor-action that re-seats the cursor on the same
// input. The id is used both as editorID and as the field prefix so callers only
// pass what differs (title, intro, buttons, footer, …). The returned options
// keep any editor field the caller pre-set non-empty, so modals that decorate
// the editor line (e.g. workspace-create's "label: …") can override editor.
func (m *modalkit) withInputEditor(opts textEntryModalOptions, id string, input *widget.TextInput) textEntryModalOptions {
	if opts.editor == "" {
		opts.editor = m.renderCursorEditor(input.Value(), input.Cursor())
	}
	opts.editorID = id
	opts.editorValue = input.Value()
	opts.cursorAction = func(_ *App, cursor int) { input.SetCursor(cursor) }
	return opts
}

func (m *modalkit) renderTextEntryModal(opts textEntryModalOptions) modalFrameRender {
	rows := make([]string, 0, len(opts.intro)+len(opts.status)+3)
	rows = appendModalTextRows(rows, opts.intro...)
	if len(rows) > 0 {
		rows = append(rows, "")
	}
	editorRow := len(rows)
	rows = append(rows, lipgloss.NewStyle().Foreground(m.app.Theme.Fg).Render("> "+opts.editor))
	statusRow := -1
	if len(opts.status) > 0 {
		rows = append(rows, "")
		statusRow = len(rows)
		rows = appendModalTextRows(rows, opts.status...)
	}
	rendered := m.renderModalFrameWithLayout(modalFrameOptions{
		width:   opts.width,
		title:   opts.title,
		buttons: opts.buttons,
		body:    lipgloss.JoinVertical(lipgloss.Left, rows...),
		footer:  opts.footer,
	})
	if opts.editorID != "" && opts.cursorAction != nil {
		m.app.interaction.registerTextEntryCursorHits(rendered.modal, rendered.bodyRow+editorRow, opts.editorID, opts.editorValue, opts.cursorAction)
	}
	if len(opts.introList.hits) > 0 {
		listW := opts.introListW
		if listW <= 0 {
			listW = modalInnerWidth(opts.width)
		}
		m.app.interaction.registerModalListRegion(rendered.modal, rendered.bodyRow, 0, listW, opts.introList, "", nil)
	}
	if statusRow >= 0 && len(opts.statusHits) > 0 {
		m.app.interaction.registerModalCellHits(rendered.modal, rendered.bodyRow+statusRow, opts.statusHits)
	}
	if opts.surfaceID != "" {
		m.app.interaction.registerModalSurfaceWheel(rendered, opts.surfaceID)
	}
	return rendered
}

func appendModalTextRows(rows []string, blocks ...string) []string {
	for _, block := range blocks {
		if block == "" {
			rows = append(rows, "")
			continue
		}
		rows = append(rows, strings.Split(block, "\n")...)
	}
	return rows
}

func (c *interactionComponent) registerTextEntryCursorHits(modal string, row int, id string, value string, action func(*App, int)) {
	c.registerInlineCursorHits(modal, row, id, lipgloss.Width("> "), value, action)
}

func (c *interactionComponent) registerInlineCursorHits(modal string, row int, id string, prefixWidth int, value string, action func(*App, int)) {
	runes := []rune(value)
	if prefixWidth < 0 {
		prefixWidth = 0
	}
	for cursor := 0; cursor <= len(runes); cursor++ {
		idx := cursor
		col := prefixWidth + lipgloss.Width(string(runes[:cursor]))
		c.registerModalContentHit(modal, "text-entry:"+id+":cursor:"+itoa2(idx), row, col, 1, 1, func(app *App) tea.Cmd {
			action(app, idx)
			return nil
		})
	}
}

func setTextareaCursor(ta *textarea.Model, line int, col int) {
	if ta == nil {
		return
	}
	lineCount := ta.LineCount()
	if lineCount < 1 {
		lineCount = 1
	}
	if line < 0 {
		line = 0
	}
	if line >= lineCount {
		line = lineCount - 1
	}
	for ta.Line() < line {
		ta.CursorDown()
	}
	for ta.Line() > line {
		ta.CursorUp()
	}
	ta.SetCursorColumn(col)
}

func splitTextareaValue(value string) []string {
	lines := strings.Split(value, "\n")
	if len(lines) == 0 {
		return []string{""}
	}
	return lines
}

func (c *interactionComponent) registerModalTextareaCursorHits(modal string, row int, colOffset int, id string, value string, action func(*App, int, int)) {
	if id == "" || action == nil {
		return
	}
	for lineIdx, line := range splitTextareaValue(value) {
		runes := []rune(line)
		for col := 0; col <= len(runes); col++ {
			lineIdx := lineIdx
			col := col
			screenCol := colOffset + lipgloss.Width(string(runes[:col]))
			c.registerModalContentHit(modal, "textarea:"+id+":cursor:"+itoa2(lineIdx)+":"+itoa2(col), row+lineIdx, screenCol, 1, 1, func(app *App) tea.Cmd {
				action(app, lineIdx, col)
				return nil
			})
		}
	}
}

func (c *interactionComponent) registerModalTextareaRegion(modal string, row int, colOffset int, width int, height int, id string, value string, cursorAction func(*App, int, int), wheelAction uiWheelAction) {
	c.registerModalTextareaCursorHits(modal, row, colOffset, id, value, cursorAction)
	if id == "" || wheelAction == nil || width <= 0 || height <= 0 {
		return
	}
	c.registerModalWheelRegion(modal, "textarea:"+id+":wheel", row, colOffset, width, height, wheelAction)
}

func (c *interactionComponent) registerScreenTextareaCursorHits(id string, startX int, startY int, value string, action func(*App, int, int)) {
	if id == "" || action == nil {
		return
	}
	for lineIdx, line := range splitTextareaValue(value) {
		runes := []rune(line)
		for col := 0; col <= len(runes); col++ {
			lineIdx := lineIdx
			col := col
			x := startX + lipgloss.Width(string(runes[:col]))
			c.registerScreenHit(id+":cursor:"+itoa2(lineIdx)+":"+itoa2(col), mouseRect{
				x: x,
				y: startY + lineIdx,
				w: 1,
				h: 1,
			}, func(app *App) tea.Cmd {
				action(app, lineIdx, col)
				return nil
			})
		}
	}
}

func (c *interactionComponent) registerScreenTextareaRegion(id string, startX int, startY int, value string, cursorAction func(*App, int, int)) {
	c.registerScreenTextareaCursorHits(id, startX, startY, value, cursorAction)
}

func (c *interactionComponent) registerScreenTextSpanHit(id string, startX int, y int, line string, col int, span string, action uiHitAction) {
	if id == "" || span == "" || action == nil {
		return
	}
	rect, ok := screenTextSpanRect(startX, y, line, col, span)
	if !ok {
		return
	}
	c.registerScreenHit(id, rect, action)
}

func (c *interactionComponent) registerClippedScreenTextSpanHit(id string, startX int, y int, line string, col int, span string, maxRight int, action uiHitAction) {
	if id == "" || span == "" || action == nil {
		return
	}
	rect, ok := screenTextSpanRect(startX, y, line, col, span)
	if !ok || rect.x >= maxRight {
		return
	}
	if rect.x+rect.w > maxRight {
		rect.w = maxRight - rect.x
	}
	if rect.w < 1 {
		return
	}
	c.registerScreenHit(id, rect, action)
}

func screenTextSpanRect(startX int, y int, line string, col int, span string) (mouseRect, bool) {
	if span == "" {
		return mouseRect{}, false
	}
	if col < 0 || col > len(line) {
		return mouseRect{}, false
	}
	return mouseRect{
		x: startX + lipgloss.Width(line[:col]),
		y: y,
		w: lipgloss.Width(span),
		h: 1,
	}, true
}

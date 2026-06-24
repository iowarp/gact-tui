package ui

// interaction.go provides core modal/interaction primitives: row hits, scroll windows, and scrollable modal bodies.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

type modalRowHit struct {
	id     string
	start  int
	height int
	action uiHitAction
}

type scrollWindow struct {
	start  int
	end    int
	scroll int
	total  int
}

type modalBodyWindow struct {
	body   string
	window scrollWindow
}

func modalKeyHint(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return strings.Join(out, "  ")
}

func (c *interactionComponent) registerScreenSurfaceHit(id string, action uiHitAction) {
	if id == "" || action == nil {
		return
	}
	c.registerScreenHit(id, c.app.chrome.screenSurfaceRect(), action)
}

func (c *interactionComponent) registerFocusSurfaceHit(id string, rect mouseRect, focus FocusZone, after func(*App)) {
	if id == "" || rect.w <= 0 || rect.h <= 0 {
		return
	}
	c.registerScreenHit(id, rect, func(app *App) tea.Cmd {
		app.focus = focus
		if after != nil {
			after(app)
		}
		return nil
	})
}

func (m *modalkit) renderCursorEditor(value string, cursor int) string {
	runes := []rune(value)
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(runes) {
		cursor = len(runes)
	}
	cursorStyle := lipgloss.NewStyle().Reverse(true).Foreground(m.app.Theme.Fg)
	if cursor == len(runes) {
		return string(runes) + cursorStyle.Render(" ")
	}
	return string(runes[:cursor]) +
		cursorStyle.Render(string(runes[cursor:cursor+1])) +
		string(runes[cursor+1:])
}

func (m *modalkit) renderScrollableModalBody(body string, rows int, modalWidth int, win scrollWindow) string {
	padded := padModalBody(body, rows)
	visibleUnits := rows
	if win.end > win.start {
		visibleUnits = win.end - win.start
	}
	if win.total <= visibleUnits || modalWidth < 16 || rows < 2 {
		return padded
	}
	contentW := modalScrollableContentWidth(modalWidth)
	if contentW < 4 {
		return padded
	}

	lines := strings.Split(padded, "\n")
	lines, ok := m.app.modals.renderSideScrollIndicator(lines, contentW, win)
	if !ok {
		return padded
	}
	return strings.Join(lines, "\n")
}

func (mk *modalkit) renderSideScrollIndicator(lines []string, contentW int, win scrollWindow) ([]string, bool) {
	a := mk.app
	trackRows := len(lines)
	visible := maxInt(1, win.end-win.start)
	if trackRows < 1 || contentW < 4 || win.total <= visible {
		return lines, false
	}
	out := append([]string(nil), lines...)
	thumbRows := trackRows * visible / maxInt(1, win.total)
	if thumbRows < 1 {
		thumbRows = 1
	}
	if thumbRows > trackRows {
		thumbRows = trackRows
	}
	maxScroll := win.total - visible
	maxThumbStart := trackRows - thumbRows
	thumbStart := 0
	if maxScroll > 0 && maxThumbStart > 0 {
		thumbStart = win.start * maxThumbStart / maxScroll
	}

	trackStyle := lipgloss.NewStyle().Foreground(a.Theme.FgFaint)
	thumbStyle := lipgloss.NewStyle().Foreground(a.Theme.Secondary)
	for i, line := range lines {
		marker := trackStyle.Render("│")
		if i >= thumbStart && i < thumbStart+thumbRows {
			marker = thumbStyle.Render("┃")
		}
		out[i] = fitANSI(line, contentW) + " " + marker
	}
	return out, true
}

func (c *interactionComponent) registerModalSurfaceAndBodyWheel(rendered modalFrameRender, id string, bodyRows int, action uiWheelAction) {
	rect := overlayMouseRect(rendered.modal, c.app.width, c.app.height)
	c.registerScreenHit(id+":surface", rect, func(app *App) tea.Cmd { return nil })
	c.registerScreenWheelHit(id+":surface:wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd { return nil })
	if rendered.bodyRow >= 0 && bodyRows > 0 && action != nil {
		c.registerModalContentWheelHit(rendered.modal, id+":body:wheel", rendered.bodyRow, 0, modalScrollableBodyWidth(rect.w), bodyRows, action)
	}
}

func (c *interactionComponent) registerModalSurfaceWheel(rendered modalFrameRender, id string) {
	rect := overlayMouseRect(rendered.modal, c.app.width, c.app.height)
	c.registerScreenWheelHit(id+":surface:wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd { return nil })
}

func (c *interactionComponent) registerModalWheelRegion(modal string, id string, row int, col int, width int, height int, action uiWheelAction) {
	if id == "" || action == nil || height <= 0 {
		return
	}
	c.registerModalContentWheelHit(modal, id, row, col, width, height, action)
}

// moveSelection and clampSelection delegate to the widget package so list
// selection has a single source of truth. moveSelection keeps its legacy guard
// (a no-op delta or empty list returns sel unchanged) for byte-identical
// behavior across the field-based callers.
func moveSelection(sel int, count int, delta int) int {
	if count <= 0 || delta == 0 {
		return sel
	}
	return widget.ClampSelection(sel+delta, count)
}

func clampSelection(sel int, count int) int {
	return widget.ClampSelection(sel, count)
}

func moveScrollOffset(scroll int, delta int) int {
	scroll += delta
	if scroll < 0 {
		return 0
	}
	return scroll
}

func boundedScrollWindow(total int, budget int, scroll int) scrollWindow {
	if total < 0 {
		total = 0
	}
	if budget < 1 {
		budget = 1
	}
	maxScroll := total - budget
	if maxScroll < 0 {
		maxScroll = 0
	}
	if scroll < 0 {
		scroll = 0
	}
	if scroll > maxScroll {
		scroll = maxScroll
	}
	end := scroll + budget
	if end > total {
		end = total
	}
	if end < scroll {
		end = scroll
	}
	return scrollWindow{start: scroll, end: end, scroll: scroll, total: total}
}

func windowModalBody(body string, budget int, scroll int) modalBodyWindow {
	lines := strings.Split(body, "\n")
	win := boundedScrollWindow(len(lines), budget, scroll)
	return modalBodyWindow{
		body:   strings.Join(lines[win.start:win.end], "\n"),
		window: win,
	}
}

func modalRangeHint(win scrollWindow, hint string) string {
	return hint
}

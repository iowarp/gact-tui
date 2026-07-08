package ui

// detail_modal.go renders the scrollable detail modal and caches its wrapped content.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type scrollableDetailOptions struct {
	width      int
	title      string
	content    string
	scroll     int
	page       int
	tabs       []menuTab
	hint       string
	closeID    string
	closeLabel string
	close      func(*App)
}

type scrollableDetailRender struct {
	modal  string
	scroll int
	window scrollWindow
}

type detailWrapCache struct {
	content string
	width   int
	wrapped string
}

func (m *modalkit) renderScrollableDetailModal(opts scrollableDetailOptions) scrollableDetailRender {
	t := m.app.Theme
	w := opts.width
	if w < 12 {
		w = 12
	}
	innerW := modalInnerWidth(w)
	if innerW < 10 {
		innerW = 10
	}
	page := opts.page
	if page < 1 {
		page = 1
	}

	wrapped := m.app.conversation.cachedDetailWrappedContent(opts.content, innerW)
	page = compactModalBodyRows(wrapped, page, valuefmt.MinInt(8, page))
	lines := strings.Split(wrapped, "\n")
	title := opts.title
	closeID := opts.closeID
	if closeID == "" {
		closeID = "detail:close"
	}
	closeFn := opts.close
	if closeFn == nil {
		closeFn = func(app *App) { app.detail.close() }
	}
	closeLabel := strings.TrimSpace(opts.closeLabel)
	if closeLabel == "" {
		closeLabel = "x"
	}
	buttons := []menuButton{
		{
			id:    "detail:copy",
			label: "copy",
			action: func(app *App) tea.Cmd {
				return app.clipboard.copyDetailText()
			},
		},
		{
			id:    closeID,
			label: closeLabel,
			action: func(app *App) tea.Cmd {
				closeFn(app)
				return nil
			},
		},
	}
	if permissionButtons := m.app.detail.permissionInspectorDecisionButtons(title); len(permissionButtons) > 0 {
		buttons = append(permissionButtons, buttons...)
	}
	if m.app.detail.fileUploadAvailable() {
		buttons = append([]menuButton{{
			id:    "detail:upload",
			label: "upload",
			action: func(app *App) tea.Cmd {
				return app.fileViewer.uploadCurrentDetail()
			},
		}}, buttons...)
	}
	if m.app.detail.fileExternalAvailable() {
		buttons = append([]menuButton{{
			id:    "detail:open-external",
			label: "open",
			action: func(app *App) tea.Cmd {
				return app.detail.openFileExternally()
			},
		}}, buttons...)
	}

	hint := opts.hint
	if hint == "" {
		hint = "Up/Down scroll  Pg page  g/G top/bottom  y copy  Esc close"
	}
	if m.app.MouseEnabled {
		hint = strings.Replace(hint, "Up/Down scroll  ", "scroll  ", 1)
		hint = "drag app copy  Alt+drag terminal select  " + hint
	}
	if m.app.detail.fileUploadAvailable() {
		hint = "u upload  " + hint
	}
	if m.app.detail.fileExternalAvailable() {
		hint = "o open  " + hint
	}
	if m.app.detail.fileHasModes() {
		hint = "Tab mode  " + hint
	}
	hintStyle := t.HintLabel
	bodyContent := strings.Join(lines, "\n")
	rendered := m.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      title,
			buttons:    buttons,
			tabs:       opts.tabs,
			tabPadding: 1,
			tabSpacing: 1,
		},
		content:     bodyContent,
		pageSize:    page,
		scroll:      opts.scroll,
		wheelID:     "detail",
		footerHint:  hint,
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.detail.scroll = moveScrollOffsetByWheel(app.detail.scroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.detail.scroll = scroll
			return nil
		},
	})
	visibleBody := windowModalBody(bodyContent, page, rendered.window.scroll)
	visibleLines := strings.Split(visibleBody.body, "\n")
	m.app.clipboard.setDetailSnapshot(visibleLines, rendered.modal, rendered.bodyRow)
	rendered.modal = m.app.clipboard.renderDetailDragHighlight(rendered.modal)
	return scrollableDetailRender{modal: rendered.modal, scroll: rendered.window.scroll, window: rendered.window}
}

func (c *conversationComponent) cachedDetailWrappedContent(content string, width int) string {
	if c == nil || c.app == nil {
		return textutil.Wrap(content, width)
	}
	a := c.app
	if a.detail.wrap.width == width && a.detail.wrap.content == content {
		return a.detail.wrap.wrapped
	}
	wrapped := textutil.Wrap(content, width)
	a.detail.wrap = detailWrapCache{
		content: content,
		width:   width,
		wrapped: wrapped,
	}
	return wrapped
}

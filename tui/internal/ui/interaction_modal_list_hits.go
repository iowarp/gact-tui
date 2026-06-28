package ui

// interaction_modal_list_hits.go registers modal-list row/rail/region mouse hit handlers.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (c *interactionComponent) registerSelectableListRailHits(rendered modalFrameRender, id string, win scrollWindow, bodyRows int, action func(*App, int) tea.Cmd) {
	if id == "" || action == nil || bodyRows <= 0 || rendered.bodyRow < 0 || win.total <= 1 || rendered.modal == "" {
		return
	}
	visibleItems := win.end - win.start
	if visibleItems < 1 {
		visibleItems = 1
	}
	if win.total <= visibleItems {
		return
	}
	modalWidth := lipgloss.Width(rendered.modal)
	contentW := modalScrollableContentWidth(modalWidth)
	if modalWidth < 16 || contentW < 4 {
		return
	}
	railCol := contentW + 1
	for row := 0; row < bodyRows; row++ {
		row := row
		target := row * (win.total - 1) / maxInt(1, bodyRows-1)
		c.registerModalContentHit(rendered.modal, id+":rail:"+itoa2(row), rendered.bodyRow+row, railCol, 1, 1, func(app *App) tea.Cmd {
			return action(app, target)
		})
	}
}

func (c *interactionComponent) registerModalIndexRailHits(modal string, id string, rowOffset int, col int, visibleRows int, total int, action func(*App, int) tea.Cmd) {
	if id == "" || action == nil || visibleRows <= 1 || total <= visibleRows || modal == "" {
		return
	}
	for row := 0; row < visibleRows; row++ {
		row := row
		index := row * (total - 1) / maxInt(1, visibleRows-1)
		c.registerModalContentHit(modal, id+":rail:"+itoa2(row), rowOffset+row, col, 1, 1, func(app *App) tea.Cmd {
			return action(app, index)
		})
	}
}

func (c *interactionComponent) registerModalIndexedListRailHits(modal string, id string, rowOffset int, col int, visibleRows int, indexes []int, action func(*App, int) tea.Cmd) {
	if id == "" || action == nil || len(indexes) == 0 {
		return
	}
	c.registerModalIndexRailHits(modal, id, rowOffset, col, visibleRows, len(indexes), func(app *App, pos int) tea.Cmd {
		if pos < 0 {
			pos = 0
		}
		if pos >= len(indexes) {
			pos = len(indexes) - 1
		}
		return action(app, indexes[pos])
	})
}

func (c *interactionComponent) registerModalListHits(modal string, rowOffset int, col int, width int, hits []modalListHit) {
	for _, hit := range hits {
		hitCol := col + hit.col
		hitWidth := width
		if hit.width > 0 {
			hitWidth = hit.width
		}
		c.registerModalContentHit(modal, hit.id, rowOffset+hit.row, hitCol, hitWidth, hit.height, hit.action)
	}
}

func offsetModalListHits(list modalListRender, rowOffset int) []modalListHit {
	if len(list.hits) == 0 {
		return nil
	}
	hits := make([]modalListHit, 0, len(list.hits))
	for _, hit := range list.hits {
		hits = append(hits, modalListHit{
			id:     hit.id,
			row:    rowOffset + hit.row,
			col:    hit.col,
			width:  hit.width,
			height: hit.height,
			action: hit.action,
		})
	}
	return hits
}

func (c *interactionComponent) registerModalListRegion(modal string, rowOffset int, col int, width int, list modalListRender, wheelID string, wheelAction uiWheelAction) {
	if len(list.rows) > 0 && wheelID != "" && wheelAction != nil {
		c.registerModalContentWheelHit(modal, wheelID, rowOffset, col, width, maxInt(1, len(list.rows)), wheelAction)
	}
	if len(list.hits) > 0 {
		c.registerModalListHits(modal, rowOffset, col, width, list.hits)
	}
}

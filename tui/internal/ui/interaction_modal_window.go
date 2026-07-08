package ui

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// interaction_modal_window.go windows long modal lists to a scroll viewport and clips/indexes them.

func (c *interactionComponent) registerWindowedModalListHits(rendered scrollableModalFrameRender, col int, width int, list modalListRender) {
	if rendered.modal == "" || rendered.bodyRow < 0 {
		return
	}
	clipped := clipModalListToWindow(list, rendered.window)
	c.registerModalListRegion(rendered.modal, rendered.bodyRow, col, width, clipped, "", nil)
}

func clipModalListToWindow(list modalListRender, win scrollWindow) modalListRender {
	if len(list.rows) == 0 && len(list.hits) == 0 {
		return modalListRender{}
	}
	start := clampInt(win.start, 0, len(list.rows))
	end := clampInt(win.end, start, len(list.rows))
	clippedRows := append([]string(nil), list.rows[start:end]...)
	visibleHits := make([]modalListHit, 0, len(list.hits))
	for _, hit := range list.hits {
		if hit.height <= 0 {
			continue
		}
		hitStart := maxInt(hit.row, win.start)
		hitEnd := valuefmt.MinInt(hit.row+hit.height, win.end)
		if hitEnd <= hitStart {
			continue
		}
		visibleHits = append(visibleHits, modalListHit{
			id:     hit.id,
			row:    hitStart - win.start,
			col:    hit.col,
			width:  hit.width,
			height: hitEnd - hitStart,
			action: hit.action,
		})
	}
	return modalListRender{
		rows:          clippedRows,
		hits:          visibleHits,
		renderedItems: list.renderedItems,
	}
}

func windowedIndexRange(cursor, total int, visibleRows int, defaultRows int) (int, int) {
	if visibleRows <= 0 {
		visibleRows = defaultRows
	}
	if total <= visibleRows {
		return 0, total
	}
	half := visibleRows / 2
	start := cursor - half
	if start < 0 {
		start = 0
	}
	end := start + visibleRows
	if end > total {
		end = total
		start = end - visibleRows
	}
	return start, end
}

func (m *modalkit) renderWindowedIndexModalList(indexes []int, cursor int, visibleRows int, defaultRows int, opts modalListOptions, item func(int) modalListItem) (modalListRender, scrollWindow) {
	start, end := windowedIndexRange(cursor, len(indexes), visibleRows, defaultRows)
	items := make([]modalListItem, 0, end-start)
	for i := start; i < end; i++ {
		if item == nil {
			continue
		}
		items = append(items, item(indexes[i]))
	}
	if opts.rowBudget < 1 {
		opts.rowBudget = visibleRows
	}
	list := m.renderModalList(items, opts)
	return list, scrollWindow{start: start, end: end, scroll: start, total: len(indexes)}
}

func selectedItemWindow(total int, selected int, budget int) scrollWindow {
	if total < 0 {
		total = 0
	}
	if budget < 1 {
		budget = 1
	}
	if budget > total {
		budget = total
	}
	if total == 0 {
		return scrollWindow{total: total}
	}
	if selected < 0 {
		selected = 0
	}
	if selected >= total {
		selected = total - 1
	}
	start := selected - budget/2
	if start < 0 {
		start = 0
	}
	if start+budget > total {
		start = total - budget
	}
	return boundedScrollWindow(total, budget, start)
}

func (m *modalkit) modalListItemBudget(fixedRows int, rowsPerItem int, maxItems int) int {
	if rowsPerItem < 1 {
		rowsPerItem = 1
	}
	if maxItems < 1 {
		maxItems = 1
	}
	availableRows := m.app.height - fixedRows - 6
	if availableRows < rowsPerItem {
		return 1
	}
	budget := availableRows / rowsPerItem
	if budget > maxItems {
		budget = maxItems
	}
	if budget < 1 {
		return 1
	}
	return budget
}

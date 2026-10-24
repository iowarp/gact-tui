package ui

// catalog_browser_selection.go manages catalog-browser selection/offset clamping and content-index navigation.

import (
	tea "charm.land/bubbletea/v2"
)

const catalogBrowserRowBudget = 12
const catalogBrowserBodyRows = catalogBrowserRowBudget * 2
const catalogBrowserMinBodyRows = 8

func catalogBrowserClampOffset(sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserRowBudget)
}

func catalogBrowserClampOffsetForKind(kind catalogBrowserKind, sel, offset, itemCount int) int {
	return catalogBrowserClampOffsetForBudget(sel, offset, itemCount, catalogBrowserVisibleItemBudget(kind))
}

func catalogBrowserContentIndexes(kind catalogBrowserKind, items []catalogItem) []int {
	indexes := make([]int, 0, len(items))
	for i := range items {
		indexes = append(indexes, i)
	}
	return indexes
}

func catalogBrowserSelectionPosition(indexes []int, sel int) int {
	for pos, idx := range indexes {
		if idx == sel {
			return pos
		}
	}
	return 0
}

func catalogBrowserNormalizeSelection(cb *catalogBrowserState) {
	if cb == nil || len(cb.items) == 0 {
		return
	}
	indexes := catalogBrowserContentIndexes(cb.kind, cb.items)
	if len(indexes) == 0 {
		cb.sel = 0
		cb.offset = 0
		return
	}
	for _, idx := range indexes {
		if idx == cb.sel {
			return
		}
	}
	for _, idx := range indexes {
		if idx > cb.sel {
			cb.sel = idx
			return
		}
	}
	cb.sel = indexes[len(indexes)-1]
}

func catalogBrowserMoveSelection(cb *catalogBrowserState, delta int) {
	if cb == nil || len(cb.items) == 0 {
		return
	}
	indexes := catalogBrowserContentIndexes(cb.kind, cb.items)
	if len(indexes) == 0 {
		cb.sel = 0
		cb.offset = 0
		return
	}
	pos := catalogBrowserSelectionPosition(indexes, cb.sel)
	pos = clampInt(pos+delta, 0, len(indexes)-1)
	cb.sel = indexes[pos]
	cb.offset = catalogBrowserClampOffsetForKind(cb.kind, pos, cb.offset, len(indexes))
}

func catalogBrowserVisibleItemBudget(kind catalogBrowserKind) int {
	if kind == catalogKindTools {
		return catalogBrowserBodyRows
	}
	if kind == catalogKindPrompts {
		return catalogBrowserBodyRows
	}
	return catalogBrowserRowBudget
}

func catalogBrowserClampOffsetForBudget(sel, offset, itemCount, budget int) int {
	if budget < 1 {
		budget = 1
	}
	if itemCount <= budget {
		return 0
	}
	maxOffset := itemCount - budget
	if offset > maxOffset {
		offset = maxOffset
	}
	if offset < 0 {
		offset = 0
	}
	if sel < offset {
		return sel
	}
	if sel >= offset+budget {
		return sel - budget + 1
	}
	return offset
}

func catalogBrowserBodyRowsForContent(renderedRows int, itemCount int, itemBudget int) int {
	if itemBudget < 1 {
		itemBudget = 1
	}
	if itemCount > itemBudget {
		return catalogBrowserBodyRows
	}
	return clampInt(renderedRows, catalogBrowserMinBodyRows, catalogBrowserBodyRows)
}

func (c *catalogComponent) runItemAction(itemID string) tea.Cmd {
	if c.current == nil {
		return nil
	}
	for i, item := range c.current.items {
		if item.id == itemID {
			c.current.sel = i
			_, cmd := c.handleKey(keyMsg("enter"))
			return cmd
		}
	}
	return nil
}

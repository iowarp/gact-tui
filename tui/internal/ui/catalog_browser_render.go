package ui

// catalog_browser_render.go renders the catalog-browser modal.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// view renders the modal: title + rows + hint bar.
// Fixed result-height so the hint bar stays anchored regardless of
// how many items come back.
func (c *catalogComponent) view() string {
	t := c.app.Theme
	if c.current == nil {
		return ""
	}
	// Catalog rows carry descriptions, routing metadata, and source tags.
	// Use the inspection-pane width so lists remain readable without
	// consuming the whole application frame.
	w := c.app.modals.detailModalWidth()

	buttons := c.headerButtons()
	listW := modalInsetListWidth(w)
	lead := c.leadRows(listW)
	rows := lead.rows
	catalogBrowserNormalizeSelection(c.current)
	emptyGuidance := catalogBrowserUsesGuidanceEmptyState(c.current.kind, c.current.items)
	contentIndexes := catalogBrowserContentIndexes(c.current.kind, c.current.items)
	if emptyGuidance {
		contentIndexes = nil
		rows = append(rows, c.renderEmptyGuidanceRows(c.current.items, listW)...)
	}
	selectionPosition := catalogBrowserSelectionPosition(contentIndexes, c.current.sel)
	c.current.offset = catalogBrowserClampOffsetForKind(
		c.current.kind,
		selectionPosition,
		c.current.offset,
		len(contentIndexes),
	)
	start := c.current.offset
	itemBudget := catalogBrowserVisibleItemBudget(c.current.kind)
	end := min(len(contentIndexes), start+itemBudget)
	listItems := make([]modalListItem, 0, end-start)
	if !emptyGuidance {
		for pos := start; pos < end; pos++ {
			i := contentIndexes[pos]
			item := c.current.items[i]
			// LLL2: dim disabled tools so the user can scan what's off
			// at a glance. Selected highlight still wins so the cursor
			// never disappears on a disabled row.
			isDisabled := item.disabled || (c.current.kind == catalogKindTools &&
				c.disabledTools != nil && c.disabledTools[item.id])
			idx := i
			description := valuefmt.CompactCatalogText(valuefmt.FirstNonEmpty(item.inlineDesc, item.desc))
			inlineMeta := ""
			if c.current.kind == catalogKindTools ||
				c.current.kind == catalogKindPrompts ||
				c.current.kind == catalogKindExpertPacks {
				inlineMeta = description
				description = ""
			}
			listItems = append(listItems, modalListItem{
				id:          fmt.Sprintf("catalog:item:%d", idx),
				title:       item.title,
				meta:        inlineMeta,
				description: description,
				status:      catalogStatusTagLabel(item.statusTag),
				selected:    i == c.current.sel,
				disabled:    isDisabled,
				action:      nil,
			})
			if !isDisabled {
				listItems[len(listItems)-1].action = func(app *App) tea.Cmd {
					if app.catalog.current == nil || idx < 0 || idx >= len(app.catalog.current.items) {
						return nil
					}
					app.catalog.current.sel = idx
					app.catalog.current.offset = catalogBrowserClampOffsetForKind(app.catalog.current.kind, idx, app.catalog.current.offset, len(app.catalog.current.items))
					app.catalog.cancelPendingDeletesOutsideSelection()
					_, cmd := app.catalog.handleKey(keyMsg("enter"))
					return cmd
				}
			}
		}
	}
	descriptionLines := 2
	if c.current.kind == catalogKindTools ||
		c.current.kind == catalogKindPrompts ||
		c.current.kind == catalogKindExpertPacks ||
		c.current.kind == catalogKindAgents ||
		c.current.kind == catalogKindAgentDetail ||
		c.current.kind == catalogKindAgentBlueprintDetail ||
		c.current.kind == catalogKindAgentBlueprintSources ||
		c.current.kind == catalogKindExpertPackDetail {
		descriptionLines = 1
	}
	list := c.app.modals.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        catalogBrowserBodyRows,
		descriptionLines: descriptionLines,
	})
	listStartRow := len(rows)
	rows = append(rows, list.rows...)
	end = start + list.renderedItems
	bodyRows := catalogBrowserBodyRowsForContent(len(rows), len(contentIndexes), itemBudget)

	hintText := catalogBrowserHintText(c.current)
	win := scrollWindow{
		start:  start,
		end:    end,
		scroll: start,
		total:  len(contentIndexes),
	}
	rendered := c.app.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   c.current.title,
			buttons: buttons,
			footer:  t.HintLabel.Italic(true).Render(hintText),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       bodyRows,
		window:         win,
		wheelID:        "catalog:list:wheel",
		surfaceWheelID: "catalog",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.catalog.handleWheel(button)
		},
		railAction: func(app *App, index int) tea.Cmd {
			if app.catalog.current != nil {
				indexes := catalogBrowserContentIndexes(app.catalog.current.kind, app.catalog.current.items)
				index = clampSelection(index, len(indexes))
				if index >= 0 && index < len(indexes) {
					app.catalog.current.sel = indexes[index]
				}
				app.catalog.current.offset = catalogBrowserClampOffsetForKind(app.catalog.current.kind, index, app.catalog.current.offset, len(indexes))
				app.catalog.cancelPendingDeletesOutsideSelection()
			}
			return nil
		},
	})
	if lead.actionRow >= 0 && len(lead.actionButtons) > 0 {
		c.app.interaction.registerModalButtons(rendered.modal, rendered.bodyRow+lead.actionRow, lead.actionCol, lead.actionButtons)
	}
	return rendered.modal
}

package ui

// conversation_viewport_hits.go registers mouse hit regions for conversation parts, details, and diffs.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
)

func (c *conversationComponent) registerPartHits(blocks []conversationPartHitBlock, body string, viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	if len(blocks) == 0 || viewportRows < 1 {
		return
	}
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	visibleStart := c.scrollStart(body, viewportRows)
	visibleEnd := visibleStart + viewportRows
	for _, block := range blocks {
		if block.height <= 0 || block.msgIdx < 0 || block.msgIdx >= len(c.messages) {
			continue
		}
		start := block.fullStart
		end := block.fullStart + block.height
		if end <= visibleStart || start >= visibleEnd {
			continue
		}
		screenStart := max(start, visibleStart)
		screenEnd := min(end, visibleEnd)
		msgIdx := block.msgIdx
		addrIdx := block.addrIdx
		c.registerPartHit(msgIdx, addrIdx, screenStart-visibleStart, screenEnd-screenStart, contentW, bodyWidth, hasPermissionBanner)
		c.registerDetailHit(block, msgIdx, addrIdx, visibleStart, visibleEnd, contentW, bodyWidth, hasPermissionBanner)
		c.registerDiffHits(block, msgIdx, addrIdx, visibleStart, visibleEnd, contentW, bodyWidth, hasPermissionBanner)
	}
}

func (c *conversationComponent) registerPartHit(msgIdx int, addrIdx int, row int, height int, contentW int, bodyWidth int, hasPermissionBanner bool) {
	c.registerContentHitActions(
		fmt.Sprintf("conversation:part:%d:%d", msgIdx, addrIdx),
		row,
		0,
		contentW,
		height,
		bodyWidth,
		hasPermissionBanner,
		func(app *App) tea.Cmd {
			if msgIdx < 0 || msgIdx >= len(app.conversation.messages) {
				return nil
			}
			addr := addressablePartsOf(app.conversation.messages[msgIdx])
			if addrIdx < 0 || addrIdx >= len(addr) {
				return nil
			}
			alreadySelected := app.focus == FocusBody &&
				app.conversation.bodySelMsgIdx == msgIdx &&
				app.conversation.bodySelPartIdx == addrIdx
			app.conversation.selectPartForHit(msgIdx, addrIdx)
			if alreadySelected {
				app.detail.openModal()
			}
			return nil
		},
		func(app *App) tea.Cmd {
			return app.conversation.openActionsForPart(msgIdx, addrIdx)
		},
	)
}

func (c *conversationComponent) registerDetailHit(block conversationPartHitBlock, msgIdx int, addrIdx int, visibleStart int, visibleEnd int, contentW int, bodyWidth int, hasPermissionBanner bool) {
	if !block.opensDetail || block.detailStart < 0 {
		return
	}
	detailRow := block.detailStart
	if detailRow < visibleStart || detailRow >= visibleEnd {
		return
	}
	c.registerContentHitActions(
		fmt.Sprintf("conversation:detail:%d:%d", msgIdx, addrIdx),
		detailRow-visibleStart,
		0,
		contentW,
		1,
		bodyWidth,
		hasPermissionBanner,
		func(app *App) tea.Cmd {
			if msgIdx < 0 || msgIdx >= len(app.conversation.messages) {
				return nil
			}
			addr := addressablePartsOf(app.conversation.messages[msgIdx])
			if addrIdx < 0 || addrIdx >= len(addr) {
				return nil
			}
			app.conversation.selectPartForHit(msgIdx, addrIdx)
			app.detail.openModal()
			return nil
		},
		func(app *App) tea.Cmd {
			return app.conversation.openActionsForPart(msgIdx, addrIdx)
		},
	)
}

func (c *conversationComponent) registerDiffHits(block conversationPartHitBlock, msgIdx int, addrIdx int, visibleStart int, visibleEnd int, contentW int, bodyWidth int, hasPermissionBanner bool) {
	for _, action := range block.diffActions {
		actionRow := action.row
		if actionRow < visibleStart || actionRow >= visibleEnd {
			continue
		}
		actionPath := action.path
		actionName := action.action
		actionCol := action.col - 1
		if actionCol < 0 {
			actionCol = 0
		}
		actionW := action.width + 2
		if actionW < 1 {
			actionW = 1
		}
		if actionCol+actionW > contentW {
			actionW = contentW - actionCol
		}
		if actionW < 1 {
			continue
		}
		c.registerContentHit(
			fmt.Sprintf("conversation:diff:%s:%s", actionName, actionPath),
			actionRow-visibleStart,
			actionCol,
			actionW,
			1,
			bodyWidth,
			hasPermissionBanner,
			func(app *App) tea.Cmd {
				if msgIdx >= 0 && msgIdx < len(app.conversation.messages) {
					addr := addressablePartsOf(app.conversation.messages[msgIdx])
					if addrIdx >= 0 && addrIdx < len(addr) {
						app.conversation.selectPartForHit(msgIdx, addrIdx)
					}
				}
				sid := app.session.currentID()
				if sid == "" {
					app.setHint(actionName + " diff: no active session")
					return nil
				}
				switch actionName {
				case "apply":
					return applyDiffsCmd(app.c, sid, actionPath)
				case "reject":
					return rejectDiffsCmd(app.c, sid, actionPath)
				default:
					return nil
				}
			},
		)
	}
}

func (c *conversationComponent) selectPartForHit(msgIdx int, addrIdx int) {
	c.app.focus = FocusBody
	c.bodySelMsgIdx = msgIdx
	c.bodySelPartIdx = addrIdx
	c.stickyToBottom = false
	c.pendingPartScroll = false
	c.searchHitMessageID = ""
}

func (c *conversationComponent) registerContentHit(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiHitAction) {
	c.registerContentHitActions(id, row, col, width, height, bodyWidth, hasPermissionBanner, action, nil)
}

func (c *conversationComponent) registerContentHitActions(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiHitAction, secondaryAction uiHitAction) {
	if c.app.interaction.hits == nil {
		return
	}
	c.app.interaction.registerScreenHitActions(id, c.contentRect(row, col, width, height, bodyWidth, hasPermissionBanner), action, secondaryAction)
}

func (c *conversationComponent) registerContentWheelHit(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiWheelAction) {
	if c.app.interaction.hits == nil {
		return
	}
	c.app.interaction.registerScreenWheelHit(id, c.contentRect(row, col, width, height, bodyWidth, hasPermissionBanner), action)
}

func (c *conversationComponent) contentRect(row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool) mouseRect {
	return conversationContentRectFromGeometry(c.paneOffsetX(), row, col, width, height, bodyWidth, hasPermissionBanner)
}

func (c *conversationComponent) registerFocusSurface(conversationHeight int, bodyWidth int) {
	if c.app.interaction.hits == nil || conversationHeight <= 0 || bodyWidth <= 0 {
		return
	}
	c.app.interaction.registerFocusSurfaceHit("conversation:body:focus", c.focusSurfaceRect(conversationHeight, bodyWidth), FocusBody, func(app *App) {
		app.conversation.maybeInitCursor()
	})
}

func (c *conversationComponent) focusSurfaceRect(conversationHeight int, bodyWidth int) mouseRect {
	return conversationFocusSurfaceRectFromGeometry(c.paneOffsetX(), conversationHeight, bodyWidth)
}

func (c *conversationComponent) paneOffsetX() int {
	if c.app.sidebar.bodyHitOffsetX > 0 {
		return c.app.sidebar.bodyHitOffsetX
	}
	sidebarW, _, _ := c.app.chrome.mainPaneGeometry()
	return sidebarW
}

func renderedPaneOuterWidth(requested int) int {
	if requested > 2 {
		return requested - 2
	}
	if requested < 1 {
		return 1
	}
	return requested
}

func (c *conversationComponent) registerWheelHit(viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	if viewportRows < 1 {
		return
	}
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	c.registerContentWheelHit("conversation:body:wheel", 0, 0, contentW, viewportRows, bodyWidth, hasPermissionBanner, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.interaction.handleConversationWheel(button)
	})
}

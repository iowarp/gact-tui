package ui

// conversationActionsModal: the transcript-part action menu overlay.

import (
	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// conversationActionsModal is the transcript-part action menu's state: open
// flag plus the selectable-list cursor.
type conversationActionsModal struct {
	open bool
	sel  int
}

func (m *conversationActionsModal) reset() { *m = conversationActionsModal{} }

func (c *conversationComponent) selectPart(msgIdx int, addrIdx int) bool {
	if msgIdx < 0 || msgIdx >= len(c.messages) {
		return false
	}
	addr := addressablePartsOf(c.messages[msgIdx])
	if addrIdx < 0 || addrIdx >= len(addr) {
		return false
	}
	c.app.focus = FocusBody
	c.bodySelMsgIdx = msgIdx
	c.bodySelPartIdx = addrIdx
	c.stickyToBottom = false
	c.pendingPartScroll = false
	c.searchHitMessageID = ""
	return true
}

func (c *conversationComponent) openActionsForPart(msgIdx int, addrIdx int) tea.Cmd {
	if !c.selectPart(msgIdx, addrIdx) {
		return nil
	}
	c.actions.open = true
	c.actions.sel = 0
	return nil
}

func (c *conversationComponent) openActionsForSelection() tea.Cmd {
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		c.maybeInitCursor()
	}
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		c.app.setHint("no conversation block selected")
		return nil
	}
	addr := addressablePartsOf(c.messages[c.bodySelMsgIdx])
	if c.bodySelPartIdx < 0 || c.bodySelPartIdx >= len(addr) {
		c.bodySelPartIdx = firstAddressablePartIdx(c.messages[c.bodySelMsgIdx])
	}
	return c.openActionsForPart(c.bodySelMsgIdx, c.bodySelPartIdx)
}

func (c *conversationComponent) closeActions() { c.actions.reset() }

func (c *conversationComponent) selectedPart() (gact.Message, gact.Part, bool) {
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		return gact.Message{}, gact.Part{}, false
	}
	m := c.messages[c.bodySelMsgIdx]
	addr := addressablePartsOf(m)
	if c.bodySelPartIdx < 0 || c.bodySelPartIdx >= len(addr) {
		return gact.Message{}, gact.Part{}, false
	}
	partIdx := addr[c.bodySelPartIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return gact.Message{}, gact.Part{}, false
	}
	return m, m.Parts[partIdx], true
}

func (c *conversationComponent) handleActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := c.actionItems()
	if cmd, handled := c.app.modals.handleActionMenuKey(k, items, &c.actions.sel, func(app *App) { app.conversation.closeActions() }); handled {
		return c.app, cmd
	}
	return c.app, nil
}

func (c *conversationComponent) viewActions() string {
	items := c.actionItems()

	title := "Conversation actions"
	contextLine := "No conversation block selected."
	if m, p, ok := c.selectedPart(); ok {
		title = textutil.Truncate(conversationPartActionTitle(m, p), 44)
		contextLine = conversationPartActionContext(m, p)
	}

	return c.app.modals.renderActionMenu(actionMenuOptions{
		prefix:      "conversation-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &c.actions.sel,
		rowBudget:   14,
		close:       func(app *App) { app.conversation.closeActions() },
	})
}

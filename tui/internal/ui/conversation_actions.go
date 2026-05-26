package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type conversationAction struct {
	id          string
	title       string
	description string
	key         string
	action      func(*App) tea.Cmd
}

func (a *App) selectConversationPart(msgIdx int, addrIdx int) bool {
	if msgIdx < 0 || msgIdx >= len(a.messages) {
		return false
	}
	addr := addressablePartsOf(a.messages[msgIdx])
	if addrIdx < 0 || addrIdx >= len(addr) {
		return false
	}
	a.focus = FocusBody
	a.bodySelMsgIdx = msgIdx
	a.bodySelPartIdx = addrIdx
	a.stickyToBottom = false
	a.pendingPartScroll = false
	a.searchHitMessageID = ""
	return true
}

func (a *App) openConversationActionsForPart(msgIdx int, addrIdx int) tea.Cmd {
	if !a.selectConversationPart(msgIdx, addrIdx) {
		return nil
	}
	a.conversationActionsOpen = true
	a.conversationActionsSel = 0
	return nil
}

func (a *App) openConversationActionsForSelection() tea.Cmd {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		a.maybeInitBodyCursor()
	}
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		a.transientHint = "no conversation block selected"
		return nil
	}
	addr := addressablePartsOf(a.messages[a.bodySelMsgIdx])
	if a.bodySelPartIdx < 0 || a.bodySelPartIdx >= len(addr) {
		a.bodySelPartIdx = firstAddressablePartIdx(a.messages[a.bodySelMsgIdx])
	}
	return a.openConversationActionsForPart(a.bodySelMsgIdx, a.bodySelPartIdx)
}

func (a *App) closeConversationActions() {
	a.conversationActionsOpen = false
	a.conversationActionsSel = 0
}

func (a *App) selectedConversationPart() (gact.Message, gact.Part, bool) {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		return gact.Message{}, gact.Part{}, false
	}
	m := a.messages[a.bodySelMsgIdx]
	addr := addressablePartsOf(m)
	if a.bodySelPartIdx < 0 || a.bodySelPartIdx >= len(addr) {
		return gact.Message{}, gact.Part{}, false
	}
	partIdx := addr[a.bodySelPartIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return gact.Message{}, gact.Part{}, false
	}
	return m, m.Parts[partIdx], true
}

func (a *App) selectedConversationActionItems() []conversationAction {
	m, p, ok := a.selectedConversationPart()
	if !ok {
		return nil
	}
	items := []conversationAction{
		{
			id:          "detail",
			title:       "Open detail",
			description: "Show the selected block in the shared detail pane.",
			key:         "Enter",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:          "copy-block",
			title:       "Copy block",
			description: "Copy this semantic block without sidebar borders.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("y"))
				return cmd
			},
		},
		{
			id:          "copy-conversation",
			title:       "Copy conversation",
			description: "Copy the full transcript as role-prefixed text.",
			key:         "Y",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("Y"))
				return cmd
			},
		},
	}
	if m.Role == gact.RoleUser {
		items = append(items, conversationAction{
			id:          "retry",
			title:       "Retry message",
			description: "Resend this user message.",
			key:         "R",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("R"))
				return cmd
			},
		})
	}
	if p.Type == gact.PartTypeFileDiff {
		items = append(items, conversationAction{
			id:          "apply-diffs",
			title:       "Apply pending diffs",
			description: "Apply all unapplied file diffs in this session.",
			key:         "a",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("a"))
				return cmd
			},
		}, conversationAction{
			id:          "reject-diffs",
			title:       "Reject pending diffs",
			description: "Reject all unapplied file diffs in this session.",
			key:         "r",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("r"))
				return cmd
			},
		})
	}
	items = append(items, conversationAction{
		id:          "delete",
		title:       "Delete message",
		description: "Remove the whole message containing this block.",
		key:         "d",
		action: func(app *App) tea.Cmd {
			app.closeConversationActions()
			_, cmd := app.handleBodyKey(keyMsg("d"))
			return cmd
		},
	})
	return items
}

func (a *App) applyConversationActionSelection() tea.Cmd {
	items := a.selectedConversationActionItems()
	if len(items) == 0 {
		a.closeConversationActions()
		return nil
	}
	if a.conversationActionsSel < 0 {
		a.conversationActionsSel = 0
	}
	if a.conversationActionsSel >= len(items) {
		a.conversationActionsSel = len(items) - 1
	}
	return items[a.conversationActionsSel].action(a)
}

func (a *App) handleConversationActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedConversationActionItems()
	switch k.String() {
	case "esc", "q", "left", "h", "m":
		a.closeConversationActions()
		return a, nil
	case "up", "k":
		a.conversationActionsSel = moveSelection(a.conversationActionsSel, len(items), -1)
		return a, nil
	case "down", "j":
		a.conversationActionsSel = moveSelection(a.conversationActionsSel, len(items), 1)
		return a, nil
	case "pgup", "ctrl+u", "g", "home":
		a.conversationActionsSel = 0
		return a, nil
	case "pgdown", "ctrl+d", "G", "end":
		if len(items) > 0 {
			a.conversationActionsSel = len(items) - 1
		}
		return a, nil
	case "enter":
		return a, a.applyConversationActionSelection()
	}
	for i, item := range items {
		if k.String() == item.key {
			a.conversationActionsSel = i
			return a, item.action(a)
		}
	}
	return a, nil
}

func (a *App) viewConversationActions() string {
	t := a.Theme
	w := a.modalWidth()
	listW := w - 8
	if listW < 1 {
		listW = w - 4
	}
	items := a.selectedConversationActionItems()
	if a.conversationActionsSel < 0 {
		a.conversationActionsSel = 0
	}
	if a.conversationActionsSel >= len(items) && len(items) > 0 {
		a.conversationActionsSel = len(items) - 1
	}

	title := "Conversation actions"
	contextLine := t.HintLabel.Render("No conversation block selected.")
	if m, p, ok := a.selectedConversationPart(); ok {
		title = truncate(conversationPartActionTitle(m, p), 44)
		contextLine = t.HintLabel.Render(conversationPartActionContext(m, p))
	}

	rows := []string{contextLine, ""}
	listStartRow := len(rows)
	win := selectedItemWindow(len(items), a.conversationActionsSel, a.modalListItemBudget(5, 2, 8))
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		item := items[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:          "conversation-actions:" + item.id,
			title:       item.title,
			description: item.description,
			status:      item.key,
			selected:    i == a.conversationActionsSel,
			action: func(app *App) tea.Cmd {
				app.conversationActionsSel = idx
				return app.applyConversationActionSelection()
			},
		})
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        14,
		descriptionLines: 1,
	})
	rows = append(rows, list.rows...)

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   title,
			buttons: []menuButton{closeMenuButton("conversation-actions:close", func(app *App) { app.closeConversationActions() })},
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		window:         win,
		wheelID:        "conversation-actions:list:wheel",
		surfaceWheelID: "conversation-actions",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.conversationActionsSel = moveSelectionByWheel(app.conversationActionsSel, len(app.selectedConversationActionItems()), button)
			return nil
		},
	})
	return rendered.modal
}

func conversationPartActionTitle(m gact.Message, p gact.Part) string {
	role := strings.TrimSpace(m.Role)
	if role == "" {
		role = "message"
	}
	kind := strings.TrimSpace(p.Type)
	switch p.Type {
	case gact.PartTypeToolCall:
		if p.ToolName != "" {
			kind = p.ToolName + " call"
		}
	case gact.PartTypeToolResult:
		if p.ToolName != "" {
			kind = p.ToolName + " result"
		} else {
			kind = "tool result"
		}
	case gact.PartTypeText:
		kind = "text"
	case gact.PartTypeFileDiff:
		kind = "file diff"
	case gact.PartTypeExpertHandoff:
		kind = "expert handoff"
	case gact.PartTypeRoutingDecision:
		kind = "routing decision"
	}
	if kind == "" {
		kind = "block"
	}
	return role + " · " + kind
}

func conversationPartActionContext(m gact.Message, p gact.Part) string {
	id := shortID(m.ID)
	if id == "" {
		id = "message"
	}
	detail := p.Type
	switch {
	case p.Path != "":
		detail = p.Path
	case p.ToolName != "":
		detail = p.ToolName
	case p.AgentID != "":
		detail = p.AgentID
	case p.SelectedAgent != "":
		detail = p.SelectedAgent
	case p.SubsessionID != "":
		detail = p.SubsessionID
	case p.Summary != "":
		detail = p.Summary
	case p.Text != "":
		detail = p.Text
	}
	detail = strings.ReplaceAll(strings.TrimSpace(detail), "\n", " ")
	if detail == "" {
		detail = "selected block"
	}
	return fmt.Sprintf("%s · %s", id, truncate(detail, 60))
}

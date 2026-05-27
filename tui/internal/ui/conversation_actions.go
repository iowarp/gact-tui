package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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

func (a *App) selectedConversationActionItems() []actionMenuItem {
	m, p, ok := a.selectedConversationPart()
	if !ok {
		return nil
	}
	items := []actionMenuItem{
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
	if p.Type == gact.PartTypeAgentQuestion && p.Question != nil {
		items = append(items, actionMenuItem{
			id:          "answer-question",
			title:       "Answer question",
			description: "Reply to this backend-emitted user question.",
			key:         "a",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				app.openAskUserModal(*p.Question)
				return nil
			},
		})
	}
	if m.ID != "" && m.Role != gact.RoleSystem {
		items = append(items, actionMenuItem{
			id:          "retry-with-notes",
			title:       "Retry with notes",
			description: "Create a linked retry attempt with operator notes.",
			key:         "T",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				app.openRetryNotesModal(m.ID)
				return nil
			},
		})
	}
	if m.Role == gact.RoleUser {
		items = append(items, actionMenuItem{
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
		items = append(items, actionMenuItem{
			id:          "apply-diffs",
			title:       "Apply pending diffs",
			description: "Apply all unapplied file diffs in this session.",
			key:         "a",
			action: func(app *App) tea.Cmd {
				app.closeConversationActions()
				_, cmd := app.handleBodyKey(keyMsg("a"))
				return cmd
			},
		}, actionMenuItem{
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
	items = append(items, actionMenuItem{
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
	return a.applyActionMenuSelection(items, &a.conversationActionsSel, func(app *App) { app.closeConversationActions() })
}

func (a *App) handleConversationActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedConversationActionItems()
	if cmd, handled := a.handleActionMenuKey(k, items, &a.conversationActionsSel, func(app *App) { app.closeConversationActions() }); handled {
		return a, cmd
	}
	return a, nil
}

func (a *App) viewConversationActions() string {
	items := a.selectedConversationActionItems()

	title := "Conversation actions"
	contextLine := "No conversation block selected."
	if m, p, ok := a.selectedConversationPart(); ok {
		title = truncate(conversationPartActionTitle(m, p), 44)
		contextLine = conversationPartActionContext(m, p)
	}

	return a.renderActionMenu(actionMenuOptions{
		prefix:      "conversation-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &a.conversationActionsSel,
		rowBudget:   14,
		close:       func(app *App) { app.closeConversationActions() },
	})
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
	case gact.PartTypeAgentQuestion:
		kind = "agent question"
	case gact.PartTypeRetryAttempt:
		kind = "retry attempt"
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

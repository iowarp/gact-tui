package ui

// conversation_action_items.go builds the conversation part action-menu items.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *conversationComponent) actionItems() []actionMenuItem {
	m, p, ok := c.selectedPart()
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
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:          "copy-block",
			title:       "Copy block",
			description: "Copy this semantic block without sidebar borders.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("y"))
				return cmd
			},
		},
		{
			id:          "copy-conversation",
			title:       "Copy conversation",
			description: "Copy the full transcript with tool evidence.",
			key:         "Y",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("Y"))
				return cmd
			},
		},
	}
	if p.Type == gact.PartTypeAgentQuestion && p.Question != nil {
		items = append(items, actionMenuItem{
			id:          "answer-question",
			title:       "Answer question",
			description: "Respond to the question and continue the run.",
			key:         "a",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				app.askUser.openModal(*p.Question)
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
				app.conversation.closeActions()
				app.retryNotes.openModal(m.ID)
				return nil
			},
		})
		items = append(items, actionMenuItem{
			id:          "retry-with-model",
			title:       "Retry with model",
			description: "Create a linked attempt with a provider/model override.",
			key:         "M",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				app.retryModel.openModal(m.ID)
				return nil
			},
		})
		items = append(items, actionMenuItem{
			id:          "rewind-to-message",
			title:       "Rewind to here",
			description: "Remove later messages and resume from this point.",
			key:         "W",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				sessionID := m.SessionID
				if sessionID == "" {
					sessionID = app.session.currentID()
				}
				return rewindSessionCmd(app.c, sessionID, m.ID, false)
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
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("R"))
				return cmd
			},
		})
	}
	if c.app.session.currentID() != "" {
		items = append(items, actionMenuItem{
			id:          "undo-last",
			title:       "Undo last message",
			description: "Undo the most recent conversation change.",
			key:         "u",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				return undoSessionCmd(app.c, app.session.currentID(), 1)
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
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("a"))
				return cmd
			},
		}, actionMenuItem{
			id:          "reject-diffs",
			title:       "Reject pending diffs",
			description: "Reject all unapplied file diffs in this session.",
			key:         "r",
			action: func(app *App) tea.Cmd {
				app.conversation.closeActions()
				_, cmd := app.conversation.handleKey(keyMsg("r"))
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
			app.conversation.closeActions()
			_, cmd := app.conversation.handleKey(keyMsg("d"))
			return cmd
		},
	})
	return items
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
	return fmt.Sprintf("%s · %s", id, textutil.Truncate(detail, 60))
}

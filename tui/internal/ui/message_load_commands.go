package ui

// message_load_commands.go defines message/context-file load commands and the messages-loaded handler.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// loadMessagesCmd fetches messages for a session.
func loadMessagesCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		msgs, _, err := c.ListMessages(ctx, client.MessageFilter{
			SessionID:     sessionID,
			Limit:         100,
			IncludeSystem: true,
		})
		if err != nil {
			return errMsg{err: err, stage: "messages"}
		}
		writeTUIAuditReceived("messages.loaded.raw", map[string]any{
			"session_id": sessionID,
			"messages":   msgs,
		})
		// Reverse so we have chronological (oldest-first) order for display.
		out := make([]gact.Message, len(msgs))
		for i, m := range msgs {
			normalizeMessagePresentation(&m)
			out[len(msgs)-1-i] = m
		}
		writeTUIAuditReceived("messages.loaded.normalized", map[string]any{
			"session_id": sessionID,
			"messages":   out,
		})
		return messagesLoadedMsg{sessionID: sessionID, messages: out}
	}
}

type messagesLoadedMsg struct {
	sessionID string
	messages  []gact.Message
}

func (c *connectionComponent) handleMessagesLoaded(m messagesLoadedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	// Only apply if it's for the currently selected session.
	if a.session.currentID() == m.sessionID {
		a.conversation.messages = a.conversation.mergeLoadedMessagesWithSemanticLiveCache(m.sessionID, m.messages)
		a.conversation.invalidateRenderCache()
		a.conversation.stickyToBottom = true
	}
	return a, nil
}

// loadContextFilesCmd fetches the in-context files for a session.
func loadContextFilesCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		files, err := c.ListContextFiles(ctx, sessionID)
		if err != nil {
			// Don't promote to error stage — context files are optional.
			return contextFilesLoadedMsg{sessionID: sessionID, files: nil}
		}
		return contextFilesLoadedMsg{sessionID: sessionID, files: files}
	}
}

func loadContextFileContentCmd(c *client.Client, sessionID, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		content, err := c.ContextFileContent(ctx, sessionID, path)
		return contextFileContentLoadedMsg{sessionID: sessionID, path: path, content: content, err: err}
	}
}

// deleteMessageCmd fires a background DELETE for a message. The TUI already
// dropped the message locally so there's no message for us to emit on success;
// failures are silently swallowed because the user's next session switch or
// Ctrl+R will re-sync from the backend. If delete failures become a real
// problem, switch to an errMsg-returning command with a retry UX.
func deleteMessageCmd(c *client.Client, sessionID, messageID string) tea.Cmd {
	return func() tea.Msg {
		if messageID == "" {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.DeleteMessage(ctx, sessionID, messageID)
		return nil
	}
}

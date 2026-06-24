package ui

// conversationComponent post commands: posting user messages (with file
// mentions / agent routing) to the backend and reconciling the ack/failure
// replies back into the conversation and composer.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// postMessageCmd posts a user message to the current session. On
// failure the message returns postFailedMsg rather than errMsg so the
// Update handler can restore the text to the input (rather than
// sending the whole UI to StageError for a transient backend blip).
func postMessageCmd(c *client.Client, sessionID, text string) tea.Cmd {
	return postMessageWithMentionsAndAgentCmd(c, sessionID, text, text, nil, "")
}

func postMessageWithMentionsCmd(c *client.Client, sessionID, draftText, text string, mentions []composerFileMention) tea.Cmd {
	return postMessageWithMentionsAndAgentCmd(c, sessionID, draftText, text, mentions, "")
}

func postMessageWithMentionsAndAgentCmd(c *client.Client, sessionID, draftText, text string, mentions []composerFileMention, agentID string) tea.Cmd {
	return func() tea.Msg {
		// Real LLM turns can easily run 10s+ (Haiku via a proxy is
		// ~5-15s; Sonnet via a ReAct loop can be minutes). 120s gives
		// the TUI enough patience without hanging forever on a wedged
		// backend - SSE is the source of truth for in-flight
		// progress anyway.
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		mentionCopy := cloneComposerFileMentions(mentions)
		seen := map[string]bool{}
		attached := make([]gact.ContextFile, 0, len(mentionCopy))
		for _, mention := range mentionCopy {
			path := strings.TrimSpace(mention.Path)
			if path == "" || seen[path] {
				continue
			}
			seen[path] = true
			mode := mention.Mode
			if mode == "" {
				mode = "read"
			}
			cf, err := c.AddContextFile(ctx, sessionID, path, mode)
			if err != nil {
				return postFailedMsg{
					text:     draftText,
					mentions: mentionCopy,
					err:      fmt.Errorf("attach %s: %w", path, err),
				}
			}
			attached = append(attached, cf)
		}
		text = sanitizeSelectedFileMentions(text, mentionCopy)
		_, err := c.PostMessage(ctx, sessionID, client.PostMessageRequest{
			Parts:   []gact.Part{gact.NewTextPart(text)},
			AgentID: agentID,
		})
		if err != nil {
			return postFailedMsg{text: draftText, mentions: mentionCopy, err: err}
		}
		return msgPostedAck{sessionID: sessionID, text: text, contextFiles: attached}
	}
}

// postFailedMsg is the sole signal that PostMessage failed. Lets the
// Update handler restore the user's text into the textarea so a
// transient network blip doesn't cost them their message.
type postFailedMsg struct {
	text     string
	mentions []composerFileMention
	err      error
}

type msgPostedAck struct {
	sessionID    string
	text         string // the user message just posted; used by auto-rename
	contextFiles []gact.ContextFile
}

func (c *conversationComponent) handlePostFailed(m postFailedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	// Transient failure (dial error, backend restart, upstream 5xx).
	// Don't blow away the UI; restore the text so the user can
	// just press Enter again once the backend is back. Surface a
	// transient hint so they know what happened.
	a.inputComposer.input.SetValue(m.text)
	a.inputComposer.fileMentions = cloneComposerFileMentions(m.mentions)
	a.setHint(c.postFailureHint(m.err))
	return a, nil
}

func (c *conversationComponent) handleMsgPostedAck(m msgPostedAck) (tea.Model, tea.Cmd) {
	a := c.app
	// User message is in the store; the SSE stream will reflect it via
	// the message.created event the server publishes.
	if a.session.currentID() == m.sessionID && len(m.contextFiles) > 0 {
		a.session.mergeContextFiles(m.contextFiles)
	}
	// Auto-rename: if this was the first user message and the session
	// still carries the default title, patch it to a truncated version of
	// the message so the sidebar becomes self-describing. Silent: no toast
	// if the PATCH fails because the rename is a nicety, not load-bearing.
	if title, ok := autoRenameTitle(a, m.sessionID, m.text); ok {
		return a, patchSessionTitleCmd(a.c, m.sessionID, title)
	}
	return a, nil
}

func (c *conversationComponent) postFailureHint(err error) string {
	a := c.app
	if err == nil {
		return a.localizer.t(msgPostFailureRetry, nil)
	}
	var backendErr *client.Error
	if errors.As(err, &backendErr) && backendErr.Code == "agent_not_available" {
		switch stringDetail(backendErr.Details, "agent_status") {
		case "starting":
			return a.localizer.t(msgPostFailureAgentStarting, nil)
		case "failed":
			return a.localizer.t(msgPostFailureAgentFailed, nil)
		case "not_configured":
			return a.localizer.t(msgPostFailureAgentNotConfigured, nil)
		default:
			return a.localizer.t(msgPostFailureAgentUnknown, nil)
		}
	}
	return a.localizer.t(msgPostFailureRetryWithError, map[string]string{"error": err.Error()})
}

func stringDetail(details map[string]any, key string) string {
	if details == nil {
		return ""
	}
	value, ok := details[key]
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return text
}

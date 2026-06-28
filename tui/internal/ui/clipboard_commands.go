package ui

// clipboardComponent copy commands: the /copy family that pulls assistant
// replies or the selected transcript block out to the system clipboard.

import (
	"fmt"
)

// copyLastAssistantReply scans backwards through the messages for the most
// recent assistant message and writes it through the shared clipboard adapter.
// Returns a toast describing the outcome; caller renders it as a transientHint.
func (c *clipboardComponent) copyLastAssistantReply() string {
	text, ok := lastAssistantText(c.app.conversation.messages)
	if !ok {
		return "no assistant reply to copy"
	}
	return copyExactTextToClipboard(text, "no assistant reply to copy", func(chars int) string {
		return fmt.Sprintf("copied %d chars to clipboard", chars)
	})
}

// copySelectedOrLastAssistant mirrors what operators
// expect from a visible transcript: copy the selected semantic block when the
// body cursor points at one, otherwise fall back to the selected message and
// finally to the newest assistant reply for the classic /copy behavior.
func (c *clipboardComponent) copySelectedOrLastAssistant() string {
	if c.app.conversation.bodySelMsgIdx >= 0 && c.app.conversation.bodySelMsgIdx < len(c.app.conversation.messages) {
		if text, ok := selectedConversationBlockText(c.app.conversation.messages, c.app.conversation.bodySelMsgIdx, c.app.conversation.bodySelPartIdx); ok {
			return copyExactTextToClipboard(text, "nothing to copy - selected block has no text", func(chars int) string {
				return fmt.Sprintf("copied selected block (%d chars) to clipboard", chars)
			})
		}
		if text, ok := messageText(c.app.conversation.messages[c.app.conversation.bodySelMsgIdx]); ok {
			return copyExactTextToClipboard(text, "nothing to copy - selected message has no text", func(chars int) string {
				return fmt.Sprintf("copied selected message (%d chars) to clipboard", chars)
			})
		}
		return "nothing to copy - selected block has no text"
	}
	return c.copyLastAssistantReply()
}

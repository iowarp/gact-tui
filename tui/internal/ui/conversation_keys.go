package ui

// conversation_keys.go is the conversation pane's keyboard router.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *conversationComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := k.String()
	if text := strings.ToLower(strings.TrimSpace(k.Text)); text == "pageup" || text == "pagedown" || text == "end" {
		key = text
	}
	switch key {
	case "enter":
		// For projected execution, Enter answers "what is this
		// transcript item?" with event/turn detail. Ctrl+E remains the
		// produced-artifact expansion path. Legacy message parts keep
		// their historical Enter expansion behavior below.
		if c.app.execution.openSemanticDetailForSelection() {
			return c.app, nil
		}
		c.app.detail.openModal()
		return c.app, nil
	case "up", "k":
		// TTTTTTTTT1: up/k walks the body cursor one addressable part
		// backward, crossing message boundaries. User feedback:
		// "selector goes conversation turn to conversation turn
		// instead of logical block to logical block". When an
		// assistant reads two files in one turn, each read_file +
		// matching tool_result is a distinct block; this lets the
		// user step through them individually. Message-jump shortcuts
		// (`[` / `]`) still exist for the coarse-grained case.
		if len(c.messages) == 0 {
			return c.app, nil
		}
		c.stepPartCursor(-1)
	case "down", "j":
		if len(c.messages) == 0 {
			return c.app, nil
		}
		c.stepPartCursor(+1)
	case "pgup", "pageup", "ctrl+u":
		// Page-scroll for the within-message use case. Doesn't move
		// the cursor — when the user wants to read a long single
		// message, the cursor stays on it.
		c.scrollOffset += 10
		c.stickyToBottom = false
	case "pgdown", "pagedown", "ctrl+d":
		c.reattachBottom()
	case "g":
		// g jumps the cursor to the first addressable block. TTTTTTTTT1:
		// also lands on the first part of that message so the per-block
		// marker is immediately meaningful.
		if len(c.messages) > 0 {
			c.bodySelMsgIdx = c.snapToVisibleMsg(0, 1)
			c.bodySelPartIdx = firstAddressablePartIdx(c.messages[c.bodySelMsgIdx])
			c.scrollToSelectedMessage()
		}
	case "G", "end":
		if len(c.messages) > 0 {
			c.bodySelMsgIdx = c.snapToVisibleMsg(len(c.messages)-1, -1)
			c.bodySelPartIdx = lastAddressablePartIdx(c.messages[c.bodySelMsgIdx])
			c.scrollToSelectedMessage()
		}
	case "n":
		// Y1 + TTTTTTTTT1: n/N advance the part cursor the same way
		// j/k do. Kept as a second binding because the keyboard map
		// long-documented n/N as body-cursor nav.
		if len(c.messages) == 0 {
			return c.app, nil
		}
		c.stepPartCursor(+1)
	case "N":
		if len(c.messages) == 0 {
			return c.app, nil
		}
		c.stepPartCursor(-1)
		// XXXXXXXXX1: `[` / `]` removed — user feedback: "i also dont
		// see the value with the message selector and global turn
		// selector rather just have the message selector". The
		// part-by-part j/k is the single selector now; message-jump
		// was redundant with g/G + the per-part walk.
	case "a":
		// Apply all unapplied diffs in the current session.
		if sid := c.app.session.currentID(); sid != "" && c.hasPendingDiffs() {
			return c.app, applyDiffsCmd(c.app.c, sid)
		}
	case "r":
		if sid := c.app.session.currentID(); sid != "" && c.hasPendingDiffs() {
			return c.app, rejectDiffsCmd(c.app.c, sid)
		}
	case "m":
		return c.app, c.openActionsForSelection()
	case "y":
		// Yank: when the body cursor is on an addressable part, copy
		// that semantic block first (tool result, diff, text, etc.).
		// Fall back to the selected message's text, then latest
		// assistant text. Feedback is a transient toast because
		// clipboard success is otherwise invisible.
		var (
			text string
			ok   bool
		)
		if c.bodySelMsgIdx >= 0 && c.bodySelMsgIdx < len(c.messages) {
			text, ok = selectedConversationBlockText(c.messages, c.bodySelMsgIdx, c.bodySelPartIdx)
			if !ok {
				text, ok = messageText(c.messages[c.bodySelMsgIdx])
			}
		} else {
			text, ok = lastAssistantText(c.messages)
		}
		if !ok {
			c.app.setHint("nothing to copy — selected block has no text")
			return c.app, nil
		}
		c.app.setHint(copyExactTextToClipboard(text, "nothing to copy — selected block has no text", func(chars int) string {
			return fmt.Sprintf("copied %d chars to clipboard", chars)
		}))
	case "Y":
		// PPPPPPPP1: yank the FULL conversation as role-prefixed
		// markdown so the user can paste an entire turn into a bug
		// report, another LLM, or a teammate. Complements `y` which
		// takes a single message.
		text, ok := c.app.clipboard.fullTranscriptTextCached()
		if !ok {
			c.app.setHint("nothing to copy — conversation has no text yet")
			return c.app, nil
		}
		c.app.setHint(copyExactTextToClipboard(text, "nothing to copy — conversation has no text yet", func(chars int) string {
			return fmt.Sprintf("copied full conversation (%d chars) to clipboard", chars)
		}))
	case "R":
		// Retry: when the body cursor is on a user message, resend
		// that one's text; otherwise fall back to "latest user".
		// Cursor-on-assistant is a no-op with an explanatory toast.
		sid := c.app.session.currentID()
		if sid == "" {
			return c.app, nil
		}
		var (
			text string
			ok   bool
		)
		if c.bodySelMsgIdx >= 0 && c.bodySelMsgIdx < len(c.messages) {
			sel := c.messages[c.bodySelMsgIdx]
			if sel.Role != gact.RoleUser {
				c.app.setHint("retry: cursor is not on a user message")
				return c.app, scheduleHintExpire(c.app.transientHint)
			}
			text, ok = messageText(sel)
		} else {
			text, ok = lastUserText(c.messages)
		}
		if !ok {
			c.app.setHint("no user message to retry")
			return c.app, nil
		}
		c.app.setHint("retrying…")
		return c.app, postMessageCmd(c.app.c, sid, text)
	case "t":
		// S1: toggle per-message timestamps under the role headers.
		// Not persisted — this is a live-debugging aid, not a real
		// preference. Flipping it re-renders the conversation so the
		// change is visible immediately.
		state := "off"
		if c.app.toggleShowTimestamps() {
			state = "on"
		}
		c.app.setHint("timestamps: " + state)
		return c.app, scheduleHintExpire(c.app.transientHint)
	case "d":
		// Delete: when the body cursor is set, drop THAT message;
		// otherwise fall back to "latest". Optimistic local removal;
		// background DELETE via deleteMessageCmd. No two-step
		// confirmation — reload re-fetches on failure.
		if len(c.messages) == 0 {
			c.app.setHint("no messages to delete")
			return c.app, nil
		}
		idx := len(c.messages) - 1
		if c.bodySelMsgIdx >= 0 && c.bodySelMsgIdx < len(c.messages) {
			idx = c.bodySelMsgIdx
		}
		target := c.messages[idx]
		c.messages = append(c.messages[:idx], c.messages[idx+1:]...)
		c.invalidateRenderCache()
		// Cursor shifts back to previous message (clamped) so the
		// selection stays on-screen after a delete.
		if c.bodySelMsgIdx >= 0 {
			if c.bodySelMsgIdx >= len(c.messages) {
				c.bodySelMsgIdx = len(c.messages) - 1
			}
			// TTTTTTTTT1: re-clamp the part index against the new
			// selected message's addressable-parts list.
			if c.bodySelMsgIdx >= 0 {
				addr := addressablePartsOf(c.messages[c.bodySelMsgIdx])
				if c.bodySelPartIdx >= len(addr) {
					c.bodySelPartIdx = len(addr) - 1
				}
			} else {
				c.bodySelPartIdx = -1
			}
		}
		c.app.setHint("deleted message")
		deleteSessionID := target.SessionID
		if deleteSessionID == "" {
			deleteSessionID = c.app.session.currentID()
		}
		return c.app, tea.Batch(
			deleteMessageCmd(c.app.c, deleteSessionID, target.ID),
			scheduleHintExpire(c.app.transientHint),
		)
	}
	return c.app, nil
}

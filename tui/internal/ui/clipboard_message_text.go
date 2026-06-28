package ui

// clipboard_message_text.go extracts copyable plain text from messages (full transcript, last user/assistant).

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// messageText returns the concatenated text/thinking content of a
// single message - the same flattening rule lastAssistantText uses.
// Returns ("", false) when the message has no copyable content.
func messageText(m gact.Message) (string, bool) {
	var b strings.Builder
	for _, p := range m.Parts {
		var chunk string
		switch p.Type {
		case gact.PartTypeText:
			chunk = p.Text
		case gact.PartTypeThinking:
			if p.Thinking == "" {
				continue
			}
			chunk = "<thinking>\n" + p.Thinking + "\n</thinking>"
		default:
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(chunk)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

// fullConversationText concatenates every message's text into a
// single role-prefixed transcript, suitable for pasting into a
// bug report, another LLM, or a teammate. Each message opens with
// `## user:` / `## assistant:` / `## tool:` etc. so the blocks are
// grammatically separable. Messages with no copyable text are
// skipped silently (e.g. assistant turns that were pure tool_call).
// Returns ("", false) when nothing is copyable.
func fullConversationText(msgs []gact.Message) (string, bool) {
	var b strings.Builder
	for i, m := range msgs {
		txt, ok := messageTranscriptText(msgs, i)
		if !ok {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		role := string(m.Role)
		if role == "" {
			role = "message"
		}
		b.WriteString("## ")
		b.WriteString(role)
		b.WriteString(":\n")
		b.WriteString(txt)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

// lastUserText walks msgs in reverse and returns the concatenated
// text of the newest user message. Multiple text parts are joined
// with blank-line separators; non-text parts are skipped because the
// retry payload is a plain-text resend (the backend will re-run any
// tool calls itself).
//
// Returns ("", false) when there is no user message, so the caller
// can surface "no user message to retry" rather than posting "".
func lastUserText(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleUser {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeText || p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(p.Text)
		}
		if b.Len() == 0 {
			// User message with no text (e.g. only an image) is
			// not retryable as a plain-text resend.
			return "", false
		}
		return b.String(), true
	}
	return "", false
}

// lastAssistantText walks msgs in reverse order and returns the
// concatenated plain text of the newest assistant message. Multiple
// text/thinking parts are joined with blank lines to preserve para
// structure; tool_call and tool_result parts are omitted because
// they rarely carry copy-worthy free text.
//
// Returns ("", false) when there is no assistant message in the
// slice so the caller can surface a useful "nothing to copy" hint
// rather than silently putting an empty string on the clipboard.
func lastAssistantText(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			var chunk string
			switch p.Type {
			case gact.PartTypeText:
				chunk = p.Text
			case gact.PartTypeThinking:
				// Thinking is fenced so the recipient can strip or
				// keep it depending on what they're doing with the
				// copied text.
				if p.Thinking == "" {
					continue
				}
				chunk = "<thinking>\n" + p.Thinking + "\n</thinking>"
			default:
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(chunk)
		}
		if b.Len() == 0 {
			// Assistant message exists but carries no text content
			// (e.g. only tool calls). Treat as "no copyable text".
			return "", false
		}
		return b.String(), true
	}
	return "", false
}

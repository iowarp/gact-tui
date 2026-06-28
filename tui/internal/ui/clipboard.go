package ui

// clipboardComponent: the copy-to-clipboard domain (drag selection, transcript snapshots, copy peeks).

import "strings"

// clipboardComponent owns the copy-to-clipboard domain: mouse drag-to-copy
// selection over the conversation viewport and the detail overlay, the
// clipboard command helpers (last reply, selected block, compose draft, detail
// view, session ID), and the full-transcript copy cache. It holds a
// back-reference to the root App for shared services (messages, theme,
// dimensions, transient footer hint, compose/detail peeks).
type clipboardComponent struct {
	app *App

	// conversationCopy stores the currently visible plain transcript rows so
	// mouse drag can copy exactly what the operator selected. copyDrag tracks
	// the active conversation drag; detailCopy/detailCopyDrag mirror it for the
	// detail overlay.
	conversationCopy conversationCopySnapshot
	copyDrag         conversationCopyDrag
	detailCopy       conversationCopySnapshot
	detailCopyDrag   conversationCopyDrag

	// fullConversationCopyCache memoizes the role-prefixed full-transcript text
	// keyed on message-array content so repeated `Y` yanks stay O(1).
	fullConversationCopyCache fullConversationCopyCache
}

func copyTextToClipboard(label string, text string) string {
	return copyExactTextToClipboard(text, "nothing to copy", func(int) string {
		if strings.TrimSpace(label) == "" {
			label = "content"
		}
		return "copied " + label + " to clipboard"
	})
}

func copyExactTextToClipboard(text string, emptyHint string, copiedHint func(chars int) string) string {
	if strings.TrimSpace(text) == "" {
		if strings.TrimSpace(emptyHint) == "" {
			return "nothing to copy"
		}
		return emptyHint
	}
	if clipboardForcedFailure() {
		return clipboardFailureHint()
	}
	if err := clipboardWrite(text); err != nil {
		if oscErr := osc52Write(text); oscErr != nil {
			return clipboardFailureHint()
		}
		return "sent copy via terminal OSC52 (native clipboard unavailable: " + err.Error() + ")"
	}
	if copiedHint == nil {
		return "copied content to clipboard"
	}
	return copiedHint(len(text))
}

func clipboardFailureHint() string {
	return "copy failed - run `gact diag`; check clipboard_native/clipboard_missing/clipboard_osc52"
}

func (c *clipboardComponent) fullTranscriptTextCached() (string, bool) {
	if c == nil || c.app == nil {
		return fullConversationText(nil)
	}
	key := fullConversationCopyCacheKey(c.app.conversation.messages)
	if c.fullConversationCopyCache.valid && key == c.fullConversationCopyCache.key {
		return c.fullConversationCopyCache.text, c.fullConversationCopyCache.ok
	}
	text, ok := fullConversationText(c.app.conversation.messages)
	c.fullConversationCopyCache = fullConversationCopyCache{
		key:   key,
		valid: true,
		text:  text,
		ok:    ok,
	}
	return text, ok
}

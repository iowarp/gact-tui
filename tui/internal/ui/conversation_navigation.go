package ui

// scrollToSelectedMessage shifts scrollOffset so the selected message
// sits inside the visible window. Uses the same bottom-anchored math
// jumpToMessage does.
//
// The basic offset only pins the *message*, not the
// selected part within it. For long messages (multi-tool assistants
// with two bulky reads), walking the part cursor up with `k` can
// leave the ▸ marker scrolled above the viewport. The caller can
// detect that with `selectedPartEarlyInMessage` — for now this
// function keeps the earlier message-anchoring behaviour and
// the visibility-of-part refinement is punted to a follow-up, since
// doing it right needs per-part row metadata from the renderer.
func (c *conversationComponent) scrollToSelectedMessage() {
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		return
	}
	c.scrollOffset = len(c.messages) - c.bodySelMsgIdx - 1
	c.stickyToBottom = c.scrollOffset == 0
	if c.selectedPartIsBottomBlock() {
		c.scrollOffset = 0
		c.stickyToBottom = true
		c.pendingPartScroll = false
		return
	}
	// Arm the post-render scroll adjustment so the View
	// path can nudge the viewport to keep the ▸ marker visible. The
	// base message-anchored offset is rough (measures in messages,
	// scrollClip wants lines); the per-part fine-tune reads the
	// rendered body and lines up the marker properly.
	c.pendingPartScroll = true
}

func (c *conversationComponent) selectedPartIsBottomBlock() bool {
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		return false
	}
	_, absorbed := pairToolResults(c.messages)
	lastVisible := -1
	for i := len(c.messages) - 1; i >= 0; i-- {
		if absorbed[i] {
			continue
		}
		if len(addressablePartsOf(c.messages[i])) == 0 {
			continue
		}
		lastVisible = i
		break
	}
	if c.bodySelMsgIdx != lastVisible {
		return false
	}
	addr := addressablePartsOf(c.messages[c.bodySelMsgIdx])
	return len(addr) > 0 && c.bodySelPartIdx == len(addr)-1
}

func (c *conversationComponent) reattachBottom() {
	c.scrollOffset = 0
	c.stickyToBottom = true
	c.pendingPartScroll = false
}

// maybeInitBodyCursor seeds the body message cursor when the user
// enters FocusBody for the first time. Previously the cursor stayed
// at -1 (invisible) until the user explicitly pressed n/N — the user
// reported "I have not seen this, nor can I see it now" because Tab
// alone gave no visual feedback. Default to the latest message so
// the marker is immediately visible AND so Ctrl+E expands the most
// recent bulky output by default (preserves the L3 behaviour).
// Skip past any absorbed tool messages so the
// cursor lands on a row the renderer actually paints — otherwise the
// highlight is invisible because the index targets a message that
// pairToolResults swallowed into its assistant parent.
func (c *conversationComponent) maybeInitCursor() {
	if c.app.focus != FocusBody {
		return
	}
	if c.bodySelMsgIdx >= 0 && c.bodySelMsgIdx < len(c.messages) {
		c.bodySelMsgIdx = c.snapToVisibleMsg(c.bodySelMsgIdx, -1)
		// Reseat the part cursor on the snapped msg. If the
		// old partIdx is still valid for the new msg, keep it; else
		// fall back to last-part so Ctrl+E targets the bulky block at
		// the bottom of the turn (matches the earlier default).
		addr := addressablePartsOf(c.messages[c.bodySelMsgIdx])
		if c.bodySelPartIdx < 0 || c.bodySelPartIdx >= len(addr) {
			c.bodySelPartIdx = len(addr) - 1
		}
		return
	}
	if len(c.messages) == 0 {
		return
	}
	c.bodySelMsgIdx = c.snapToVisibleMsg(len(c.messages)-1, -1)
	c.bodySelPartIdx = lastAddressablePartIdx(c.messages[c.bodySelMsgIdx])
	c.scrollToSelectedMessage()
}

// snapToVisibleMsg walks from idx in the given direction (+1 forward,
// -1 backward) until it finds a non-absorbed message, then returns
// that index. If none exists in that direction, falls back to the
// other direction. Returns idx itself if everything is absorbed
// (degenerate case — keeps the cursor stable).
func (c *conversationComponent) snapToVisibleMsg(idx, dir int) int {
	if len(c.messages) == 0 {
		return -1
	}
	_, absorbed := pairToolResults(c.messages)
	if dir == 0 {
		dir = -1
	}
	i := idx
	for i >= 0 && i < len(c.messages) {
		if !absorbed[i] {
			return i
		}
		i += dir
	}
	// Fall back to scanning the other direction.
	i = idx
	dir = -dir
	for i >= 0 && i < len(c.messages) {
		if !absorbed[i] {
			return i
		}
		i += dir
	}
	return idx
}

// jumpToMessage scrolls the conversation pane so the message with the
// given ID is visible. Implementation: find the index, set scrollOffset
// to (totalMessages - index - 1) so the renderer's bottom-anchored
// math leaves it on screen. Falls back to "stick to bottom" if the ID
// is no longer in the loaded slice (e.g. SSE replaced the list).
//
// V3: also sets searchHitMessageID so the render layer can mark the
// row visually. The marker clears on the next non-jump action via
// clearSearchHit — the row isn't a persistent selection, just a
// "here's what you were looking for" hint.
func (c *conversationComponent) jumpToMessage(messageID string) {
	for i, m := range c.messages {
		if m.ID == messageID {
			c.scrollOffset = len(c.messages) - i - 1
			c.stickyToBottom = c.scrollOffset == 0
			c.searchHitMessageID = messageID
			return
		}
	}
	c.scrollOffset = 0
	c.stickyToBottom = true
}

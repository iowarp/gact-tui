package ui

// conversation_render_cache.go caches rendered messages and manages cache invalidation/reset per session.

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

const maxConversationRenderCacheEntries = 1024

type conversationRenderCacheEntry struct {
	row       string
	blocks    []conversationPartHitBlock
	lineCount int
}

func (c *conversationComponent) cachedMessageRender(t Theme, themeSig uint64, m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part, selectedPartID string) conversationRenderCacheEntry {
	key := conversationRenderCacheKey(c.conversationRenderRevision, themeSig, m, c.msgRenderEpoch[m.ID], prev, width, inlineResults, selectedPartID)
	if c.conversationRenderCache == nil {
		c.conversationRenderCache = make(map[uint64]conversationRenderCacheEntry)
	} else if cached, ok := c.conversationRenderCache[key]; ok {
		return cached
	} else if len(c.conversationRenderCache) > maxConversationRenderCacheEntries {
		c.conversationRenderCache = make(map[uint64]conversationRenderCacheEntry)
	}
	// Single pass: render the row and compute hit geometry from the same
	// per-part renders, halving the work for a streaming turn and removing the
	// risk of the two passes drifting on line heights.
	row, blocks := t.renderMessageWithHits(m, prev, width, inlineResults, selectedPartID)
	entry := conversationRenderCacheEntry{
		row:       row,
		blocks:    blocks,
		lineCount: renderedStringLineCount(row),
	}
	c.conversationRenderCache[key] = entry
	return entry
}

func (c *conversationComponent) invalidateRenderCache() {
	c.conversationRenderCache = nil
	c.conversationRenderRevision++
	// The revision bump already namespaces every key, so old epochs can never
	// produce a stale hit. Resetting the map just keeps it from accumulating
	// entries for messages that no longer exist (e.g. across session switches).
	c.msgRenderEpoch = nil
}

// clearMessages drops the loaded conversation and invalidates the render cache
// so nothing stale survives. The single entry point for "wipe the transcript"
// (session switch, archive view, palette clear, workspace switch) instead of
// each caller pairing messages=nil with invalidateRenderCache() by hand.
func (c *conversationComponent) clearMessages() {
	c.messages = nil
	c.invalidateRenderCache()
}

// resetForSession wipes the transcript domain for a session switch: it clears
// the loaded messages (optionally seeding them from a semantic live cache),
// resets the viewport to stick to the bottom, and clears the cross-session
// markers (search hit, body cursor). It is the single entry point sessionComponent
// uses on selectIndex instead of poking conversation fields one by one.
func (c *conversationComponent) resetForSession(seed []gact.Message) {
	c.messages = seed
	c.invalidateRenderCache()
	c.scrollOffset = 0
	c.stickyToBottom = true
	c.searchHitMessageID = "" // search-hit marker doesn't travel across sessions
	c.bodySelMsgIdx = -1      // body cursor resets to off on session switch
	c.bodySelPartIdx = -1     // part cursor resets too
}

// clearForCommand wipes the transcript and snaps the viewport back to the
// bottom for the palette's /clear command. The seam for that cross-domain
// caller, which previously paired clearMessages with the scroll/sticky writes.
func (c *conversationComponent) clearForCommand() {
	c.clearMessages()
	c.scrollOffset = 0
	c.stickyToBottom = true
}

// resetScopedView clears the transcript and viewport markers on a workspace
// switch. It mirrors the exact inline writes the workspace modal previously
// performed (no render-cache invalidation, no search-marker reset) so the
// teardown stays behaviour-identical; it is the seam for that cross-domain
// caller rather than a general session-switch reset (use resetForSession).
func (c *conversationComponent) resetScopedView() {
	c.messages = nil
	c.scrollOffset = 0
	c.stickyToBottom = true
	c.bodySelMsgIdx = -1
	c.bodySelPartIdx = -1
}

// appendSwapMarker appends a model-swap marker message and snaps the viewport
// to the bottom so the new marker is visible. The caller computes the marker
// itself; this method just owns the conversation-field mutations.
func (c *conversationComponent) appendSwapMarker(marker gact.Message) {
	c.messages = append(c.messages, marker)
	c.invalidateRenderCache()
	c.stickyToBottom = true
}

// bumpMessageEpoch marks a message's rendered content as changed so the next
// render misses the cache for that message (and only that message). It is the
// single invalidation primitive for in-place message mutations; every SSE
// handler that edits a.conversation.messages content defers a call to it. Whole-list swaps
// use invalidateConversationRenderCache instead.
func (c *conversationComponent) bumpMessageEpoch(msgID string) {
	if msgID == "" {
		return
	}
	if c.msgRenderEpoch == nil {
		c.msgRenderEpoch = make(map[string]uint64)
	}
	c.msgRenderEpoch[msgID]++
}

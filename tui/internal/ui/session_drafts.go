package ui

// swapDraftFor is the draft-swap half of a session switch. It
// stashes whatever the input currently holds under the OUTGOING
// session's ID (read from lastLoadedSessionID, not currentSessionID
// which has already flipped to the incoming idx by the time callers
// reach here) and loads whatever draft was saved for `newSID`.
// Exported as its own method so tests can exercise it without
// triggering the SSE startup path selectSession also does.
func (c *inputComposerComponent) swapDraftFor(newSID string) {
	if c.lastLoadedSessionID != "" && c.lastLoadedSessionID != newSID {
		c.stashDraft(c.lastLoadedSessionID, c.input.Value())
		c.stashFileMentions(c.lastLoadedSessionID, activeComposerFileMentions(c.input.Value(), c.fileMentions))
	}
	c.input.Reset()
	c.fileMentions = nil
	c.pastes = nil
	if saved, ok := c.inputDraftBySession[newSID]; ok {
		c.input.SetValue(saved)
	}
	if mentions, ok := c.fileMentionsBySession[newSID]; ok {
		c.fileMentions = cloneComposerFileMentions(mentions)
	}
	c.lastLoadedSessionID = newSID
}

// stashDraft saves `val` as the draft for `sid`. Empty drafts clear
// any prior entry so leftover state doesn't resurface. Map is lazily
// allocated to avoid burning memory for sessions that never get a
// draft.
func (c *inputComposerComponent) stashDraft(sid, val string) {
	if sid == "" {
		return
	}
	if val == "" {
		delete(c.inputDraftBySession, sid)
		return
	}
	if c.inputDraftBySession == nil {
		c.inputDraftBySession = map[string]string{}
	}
	c.inputDraftBySession[sid] = val
}

func (c *inputComposerComponent) stashFileMentions(sid string, mentions []composerFileMention) {
	if sid == "" {
		return
	}
	if len(mentions) == 0 {
		delete(c.fileMentionsBySession, sid)
		return
	}
	if c.fileMentionsBySession == nil {
		c.fileMentionsBySession = map[string][]composerFileMention{}
	}
	c.fileMentionsBySession[sid] = cloneComposerFileMentions(mentions)
}
